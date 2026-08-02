import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, gt, gte, inArray, or, sql } from "drizzle-orm";

import type { DeliveryStatus } from "@nister/contracts";
import type { Database } from "../connection.js";
import {
  auditLogs,
  deliveries,
  deliveryOffers,
  deliveryStatusHistory,
  driverCashTransactions,
  driverEmergencyEvents,
  driverLocations,
  driverProfiles,
  driverSafetyIncidents,
  driverShifts,
  outboxEvents,
  serviceZones,
  vehicles,
  vendorOrders,
} from "../schema.js";
import { asRecord, decodeCursor, encodeCursor, PersistenceError } from "./shared.js";

export interface DriverMoneyRecord {
  amountMinor: string;
  currency: string;
}

export interface DriverShiftRecord {
  id: string;
  status: typeof driverShifts.$inferSelect.status;
  vehicleId: string;
  serviceZoneId: string;
  startedAt: string;
  pausedAt: string | null;
  endedAt: string | null;
  version: number;
}

export interface DriverHomeRecord {
  driverId: string;
  publicReference: string;
  driverStatus: typeof driverProfiles.$inferSelect.status;
  onlineStatus: "ONLINE" | "OFFLINE" | "PAUSED";
  currentShift: DriverShiftRecord | null;
  currentVehicle: { id: string; label: string; status: typeof vehicles.$inferSelect.status } | null;
  currentZone: { id: string; name: string } | null;
  activeDeliveryId: string | null;
  cashLiability: DriverMoneyRecord;
  todayEarnings: DriverMoneyRecord;
  todayDeliveries: number;
  eligibilityBlocks: string[];
  alerts: string[];
}

export interface DriverOfferRecord {
  id: string;
  version: number;
  expiresAt: string;
  pickupArea: string;
  dropoffArea: string;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  packageSize: string;
  vehicleRequirement: string;
  expectedEarnings: DriverMoneyRecord;
  cashOnDelivery: DriverMoneyRecord | null;
  pickupCount: number;
  dropoffCount: number;
}

export interface DriverDeliveryRecord {
  id: string;
  reference: string;
  status: DeliveryStatus;
  version: number;
  pickupCodeRequired: boolean;
  deliveryCodeRequired: boolean;
  cashExpected: DriverMoneyRecord | null;
  earnings: DriverMoneyRecord;
  stops: Array<{
    id: string;
    kind: "PICKUP" | "DROPOFF";
    name: string;
    area: string;
    address: string;
    instructions: string | null;
    packageCount: number;
    complete: boolean;
  }>;
}

export interface DriverEarningsRecord {
  today: DriverMoneyRecord;
  thisWeek: DriverMoneyRecord;
  pending: DriverMoneyRecord;
  available: DriverMoneyRecord;
  paid: DriverMoneyRecord;
  bonuses: DriverMoneyRecord;
  adjustments: DriverMoneyRecord;
  cashLiability: DriverMoneyRecord;
  transactions: Array<{
    id: string;
    reference: string;
    kind: "DELIVERY" | "BONUS" | "ADJUSTMENT" | "PAYOUT" | "CASH";
    amount: DriverMoneyRecord;
    status: string;
    occurredAt: string;
  }>;
}

const activeDeliveryStatuses: DeliveryStatus[] = [
  "DRIVER_ASSIGNED",
  "DRIVER_ACCEPTED",
  "TRAVELLING_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PICKUP_VERIFIED",
  "IN_TRANSIT",
  "ARRIVED_AT_CUSTOMER",
  "RETURN_REQUIRED",
  "RETURNING_TO_VENDOR",
];

const iso = (value: Date | null | undefined): string | null => value ? value.toISOString() : null;
const amount = (value: bigint | number | string | null | undefined): string => (value ?? 0n).toString();
const moneyRecord = (amountMinor: bigint | number | string | null | undefined, currency = "GHS"): DriverMoneyRecord => ({
  amountMinor: amount(amountMinor),
  currency,
});

const snapshotText = (snapshot: unknown, keys: string[], fallback: string): string => {
  const record = asRecord(snapshot);
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
};

const snapshotNumber = (snapshot: unknown, keys: string[], fallback: number): number => {
  const record = asRecord(snapshot);
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
};

const vehicleLabel = (vehicle: typeof vehicles.$inferSelect): string => {
  const parts = [
    vehicle.vehicleType.toLowerCase().replace(/^\w/, (char) => char.toUpperCase()),
    [vehicle.make, vehicle.model].filter(Boolean).join(" "),
    vehicle.registrationNumber,
  ].filter(Boolean);
  return parts.join(" · ");
};

function toShiftRecord(shift: typeof driverShifts.$inferSelect): DriverShiftRecord {
  return {
    id: shift.id,
    status: shift.status,
    vehicleId: shift.vehicleId,
    serviceZoneId: shift.serviceZoneId,
    startedAt: shift.startedAt.toISOString(),
    pausedAt: iso(shift.pausedAt),
    endedAt: iso(shift.endedAt),
    version: shift.version,
  };
}

function cashFromDelivery(delivery: typeof deliveries.$inferSelect): DriverMoneyRecord | null {
  const pickup = asRecord(delivery.pickupSnapshot);
  const dropoff = asRecord(delivery.dropoffSnapshot);
  const raw = dropoff.cashOnDeliveryMinor ?? dropoff.cashExpectedMinor ?? pickup.cashOnDeliveryMinor;
  if (typeof raw === "bigint" || typeof raw === "number" || typeof raw === "string") {
    const value = BigInt(raw);
    return value > 0n ? moneyRecord(value, delivery.currency) : null;
  }
  return null;
}

function toDeliveryRecord(delivery: typeof deliveries.$inferSelect): DriverDeliveryRecord {
  const pickupPackages = Math.max(1, snapshotNumber(delivery.pickupSnapshot, ["packageCount", "packages"], 1));
  const dropoffPackages = Math.max(1, snapshotNumber(delivery.dropoffSnapshot, ["packageCount", "packages"], pickupPackages));
  return {
    id: delivery.id,
    reference: delivery.publicReference,
    status: delivery.status,
    version: delivery.version,
    pickupCodeRequired: Boolean(delivery.deliveryCodeHash || asRecord(delivery.pickupSnapshot).pickupCodeHash),
    deliveryCodeRequired: Boolean(delivery.deliveryCodeHash),
    cashExpected: cashFromDelivery(delivery),
    earnings: moneyRecord(delivery.driverEarningMinor, delivery.currency),
    stops: [
      {
        id: `${delivery.id}:pickup`,
        kind: "PICKUP",
        name: snapshotText(delivery.pickupSnapshot, ["name", "storeName", "vendorName"], "Pickup"),
        area: snapshotText(delivery.pickupSnapshot, ["area", "locality", "city"], "Pickup area"),
        address: snapshotText(delivery.pickupSnapshot, ["address", "streetAddress"], "Pickup address"),
        instructions: snapshotText(delivery.pickupSnapshot, ["instructions", "deliveryInstructions"], "") || null,
        packageCount: pickupPackages,
        complete: ["PICKUP_VERIFIED", "IN_TRANSIT", "ARRIVED_AT_CUSTOMER", "COMPLETED"].includes(delivery.status),
      },
      {
        id: `${delivery.id}:dropoff`,
        kind: "DROPOFF",
        name: snapshotText(delivery.dropoffSnapshot, ["recipientName", "name"], "Customer"),
        area: snapshotText(delivery.dropoffSnapshot, ["area", "locality", "city"], "Dropoff area"),
        address: snapshotText(delivery.dropoffSnapshot, ["address", "streetAddress"], "Dropoff address"),
        instructions: snapshotText(delivery.dropoffSnapshot, ["instructions", "deliveryInstructions"], "") || null,
        packageCount: dropoffPackages,
        complete: delivery.status === "COMPLETED",
      },
    ],
  };
}

function toOfferRecord(row: {
  offer: typeof deliveryOffers.$inferSelect;
  delivery: typeof deliveries.$inferSelect;
}): DriverOfferRecord {
  const estimatedDurationSeconds = snapshotNumber(row.delivery.dropoffSnapshot, ["estimatedDurationSeconds"], 0);
  return {
    id: row.offer.id,
    version: row.offer.version,
    expiresAt: row.offer.expiresAt.toISOString(),
    pickupArea: snapshotText(row.delivery.pickupSnapshot, ["area", "locality", "city"], "Pickup area"),
    dropoffArea: snapshotText(row.delivery.dropoffSnapshot, ["area", "locality", "city"], "Dropoff area"),
    estimatedDistanceKm: Number(((row.offer.distanceToPickupMetres ?? 0) / 1000).toFixed(1)),
    estimatedDurationMinutes: Math.max(0, Math.round(estimatedDurationSeconds / 60)),
    packageSize: snapshotText(row.delivery.pickupSnapshot, ["packageSize", "packageDescription"], "Standard package"),
    vehicleRequirement: snapshotText(row.delivery.pickupSnapshot, ["vehicleRequirement"], "Any approved vehicle"),
    expectedEarnings: moneyRecord(row.offer.offeredEarningMinor, row.offer.currency),
    cashOnDelivery: cashFromDelivery(row.delivery),
    pickupCount: 1,
    dropoffCount: 1,
  };
}

async function driverForUser(db: Database, userId: string, lock = false): Promise<typeof driverProfiles.$inferSelect> {
  const query = db
    .select()
    .from(driverProfiles)
    .where(eq(driverProfiles.userId, userId));
  const [driver] = lock ? await query.for("update").limit(1) : await query.limit(1);
  if (!driver) throw new PersistenceError("DRIVER_NOT_ELIGIBLE", "The authenticated user is not an approved driver", 422);
  return driver;
}

async function currentShift(db: Database, driverId: string): Promise<(typeof driverShifts.$inferSelect) | null> {
  const [shift] = await db
    .select()
    .from(driverShifts)
    .where(and(eq(driverShifts.driverId, driverId), sql`${driverShifts.status} <> 'ENDED'`))
    .orderBy(desc(driverShifts.startedAt))
    .limit(1);
  return shift ?? null;
}

async function activeVehicle(db: Database, driverId: string): Promise<(typeof vehicles.$inferSelect) | null> {
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.driverId, driverId), inArray(vehicles.status, ["ACTIVE", "APPROVED"])))
    .orderBy(desc(sql`case when ${vehicles.status} = 'ACTIVE' then 1 else 0 end`), desc(vehicles.createdAt))
    .limit(1);
  return vehicle ?? null;
}

async function activeZone(db: Database): Promise<(typeof serviceZones.$inferSelect) | null> {
  const [zone] = await db
    .select()
    .from(serviceZones)
    .where(eq(serviceZones.status, "ACTIVE"))
    .orderBy(asc(serviceZones.name))
    .limit(1);
  return zone ?? null;
}

async function activeDelivery(db: Database, driverId: string): Promise<(typeof deliveries.$inferSelect) | null> {
  const [delivery] = await db
    .select()
    .from(deliveries)
    .where(and(eq(deliveries.driverId, driverId), inArray(deliveries.status, activeDeliveryStatuses)))
    .orderBy(desc(deliveries.updatedAt))
    .limit(1);
  return delivery ?? null;
}

async function cashLiability(db: Database, driverId: string): Promise<string> {
  const [row] = await db
    .select({
      amount: sql<string>`coalesce(sum(case
        when ${driverCashTransactions.status} = 'DISPUTED' then 0
        when ${driverCashTransactions.type} in ('CASH_COLLECTED', 'CASH_ADJUSTMENT') then ${driverCashTransactions.amountMinor}
        when ${driverCashTransactions.type} in ('CASH_DEPOSITED', 'CASH_WRITEOFF') then -${driverCashTransactions.amountMinor}
        else 0 end), 0)::text`,
    })
    .from(driverCashTransactions)
    .where(eq(driverCashTransactions.driverId, driverId));
  return row?.amount ?? "0";
}

async function deliveryEarningsSince(db: Database, driverId: string, since: Date): Promise<{ amount: string; count: number }> {
  const [row] = await db
    .select({
      amount: sql<string>`coalesce(sum(${deliveries.driverEarningMinor}), 0)::text`,
      count: sql<number>`count(${deliveries.id})::integer`,
    })
    .from(deliveries)
    .where(and(eq(deliveries.driverId, driverId), eq(deliveries.status, "COMPLETED"), gte(deliveries.completedAt, since)));
  return { amount: row?.amount ?? "0", count: row?.count ?? 0 };
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfWeek(): Date {
  const today = startOfToday();
  const day = today.getUTCDay() || 7;
  today.setUTCDate(today.getUTCDate() - day + 1);
  return today;
}

export class PostgresDriverOperationsRepository {
  constructor(private readonly db: Database) {}

  async readHome(driverUserId: string): Promise<DriverHomeRecord> {
    const driver = await driverForUser(this.db, driverUserId);
    const [shift, delivery, vehicle, cash, today] = await Promise.all([
      currentShift(this.db, driver.id),
      activeDelivery(this.db, driver.id),
      activeVehicle(this.db, driver.id),
      cashLiability(this.db, driver.id),
      deliveryEarningsSince(this.db, driver.id, startOfToday()),
    ]);
    const zone = shift
      ? (await this.db.select().from(serviceZones).where(eq(serviceZones.id, shift.serviceZoneId)).limit(1))[0] ?? null
      : null;
    const currentVehicle = shift
      ? (await this.db.select().from(vehicles).where(eq(vehicles.id, shift.vehicleId)).limit(1))[0] ?? vehicle
      : vehicle;
    const eligibilityBlocks: string[] = [];
    if (driver.status !== "ACTIVE") eligibilityBlocks.push("Driver profile must be ACTIVE before going online.");
    if (!currentVehicle) eligibilityBlocks.push("An approved vehicle is required before starting a shift.");
    return {
      driverId: driver.id,
      publicReference: driver.publicReference,
      driverStatus: driver.status,
      onlineStatus: shift?.status === "STARTED" ? "ONLINE" : shift?.status === "PAUSED" ? "PAUSED" : "OFFLINE",
      currentShift: shift ? toShiftRecord(shift) : null,
      currentVehicle: currentVehicle ? { id: currentVehicle.id, label: vehicleLabel(currentVehicle), status: currentVehicle.status } : null,
      currentZone: zone ? { id: zone.id, name: zone.name } : null,
      activeDeliveryId: delivery?.id ?? null,
      cashLiability: moneyRecord(cash, driver.currency),
      todayEarnings: moneyRecord(today.amount, driver.currency),
      todayDeliveries: today.count,
      eligibilityBlocks,
      alerts: cash !== "0" ? ["Outstanding driver cash must be reconciled on schedule."] : [],
    };
  }

  startShift(input: {
    driverUserId: string;
    vehicleId?: string;
    serviceZoneId?: string;
    startCheckData?: Record<string, unknown>;
  }): Promise<DriverHomeRecord> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const driver = await driverForUser(db, input.driverUserId, true);
      if (driver.status !== "ACTIVE") {
        throw new PersistenceError("DRIVER_NOT_ELIGIBLE", "Driver must be ACTIVE before starting a shift", 422);
      }
      const existing = await currentShift(db, driver.id);
      if (existing) throw new PersistenceError("DRIVER_NOT_ELIGIBLE", "Driver already has an active shift", 422);
      const vehicle = input.vehicleId
        ? (await db.select().from(vehicles).where(and(eq(vehicles.id, input.vehicleId), eq(vehicles.driverId, driver.id))).limit(1))[0] ?? null
        : await activeVehicle(db, driver.id);
      if (!vehicle || !["ACTIVE", "APPROVED"].includes(vehicle.status)) {
        throw new PersistenceError("DRIVER_NOT_ELIGIBLE", "An approved vehicle is required before starting a shift", 422);
      }
      const zone = input.serviceZoneId
        ? (await db.select().from(serviceZones).where(eq(serviceZones.id, input.serviceZoneId)).limit(1))[0] ?? null
        : await activeZone(db);
      if (!zone || zone.status !== "ACTIVE") {
        throw new PersistenceError("DELIVERY_OPTION_UNAVAILABLE", "The requested service zone is not active", 422);
      }
      await db.insert(driverShifts).values({
        id: randomUUID(),
        driverId: driver.id,
        vehicleId: vehicle.id,
        serviceZoneId: zone.id,
        status: "STARTED",
        startCheckData: input.startCheckData ?? {},
      });
      if (vehicle.status === "APPROVED") {
        await db.update(vehicles).set({ status: "ACTIVE", updatedAt: new Date(), version: vehicle.version + 1 }).where(eq(vehicles.id, vehicle.id));
      }
      return new PostgresDriverOperationsRepository(db).readHome(input.driverUserId);
    });
  }

  updateShift(input: {
    driverUserId: string;
    shiftId?: string;
    action: "PAUSE" | "RESUME" | "END";
  }): Promise<DriverHomeRecord> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const driver = await driverForUser(db, input.driverUserId, true);
      const [shift] = await db
        .select()
        .from(driverShifts)
        .where(and(
          eq(driverShifts.driverId, driver.id),
          input.shiftId ? eq(driverShifts.id, input.shiftId) : sql`${driverShifts.status} <> 'ENDED'`,
        ))
        .for("update")
        .limit(1);
      if (!shift) throw PersistenceError.notFound("Driver shift not found");
      if (input.action === "PAUSE" && shift.status !== "STARTED") {
        throw new PersistenceError("INVALID_STATE_TRANSITION", "Only a started shift can be paused", 409);
      }
      if (input.action === "RESUME" && shift.status !== "PAUSED") {
        throw new PersistenceError("INVALID_STATE_TRANSITION", "Only a paused shift can be resumed", 409);
      }
      if (input.action === "END" && shift.status === "ENDED") {
        throw new PersistenceError("INVALID_STATE_TRANSITION", "Shift is already ended", 409);
      }
      const now = new Date();
      await db.update(driverShifts).set({
        status: input.action === "PAUSE" ? "PAUSED" : input.action === "RESUME" ? "STARTED" : "ENDED",
        pausedAt: input.action === "PAUSE" ? now : input.action === "RESUME" ? null : shift.pausedAt,
        endedAt: input.action === "END" ? now : shift.endedAt,
        updatedAt: now,
        version: shift.version + 1,
      }).where(eq(driverShifts.id, shift.id));
      return new PostgresDriverOperationsRepository(db).readHome(input.driverUserId);
    });
  }

  async listOffers(driverUserId: string): Promise<DriverOfferRecord[]> {
    const driver = await driverForUser(this.db, driverUserId);
    const rows = await this.db
      .select({ offer: deliveryOffers, delivery: deliveries })
      .from(deliveryOffers)
      .innerJoin(deliveries, eq(deliveries.id, deliveryOffers.deliveryId))
      .where(and(eq(deliveryOffers.driverId, driver.id), eq(deliveryOffers.status, "SENT"), gt(deliveryOffers.expiresAt, new Date())))
      .orderBy(asc(deliveryOffers.expiresAt));
    return rows.map(toOfferRecord);
  }

  async findOffer(driverUserId: string, offerId: string): Promise<DriverOfferRecord | null> {
    const driver = await driverForUser(this.db, driverUserId);
    const [row] = await this.db
      .select({ offer: deliveryOffers, delivery: deliveries })
      .from(deliveryOffers)
      .innerJoin(deliveries, eq(deliveries.id, deliveryOffers.deliveryId))
      .where(and(eq(deliveryOffers.id, offerId), eq(deliveryOffers.driverId, driver.id)))
      .limit(1);
    return row ? toOfferRecord(row) : null;
  }

  acceptOffer(input: {
    driverUserId: string;
    offerId: string;
    expectedOfferVersion: number;
    idempotencyKey: string;
  }): Promise<DriverDeliveryRecord> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const driver = await driverForUser(db, input.driverUserId, true);
      if (driver.status !== "ACTIVE") {
        throw new PersistenceError("DRIVER_NOT_ELIGIBLE", "Driver must be ACTIVE before accepting offers", 422);
      }
      const [row] = await db
        .select({ offer: deliveryOffers, delivery: deliveries })
        .from(deliveryOffers)
        .innerJoin(deliveries, eq(deliveries.id, deliveryOffers.deliveryId))
        .where(and(eq(deliveryOffers.id, input.offerId), eq(deliveryOffers.driverId, driver.id)))
        .for("update")
        .limit(1);
      if (!row || row.offer.status !== "SENT" || row.offer.expiresAt <= new Date()) {
        throw new PersistenceError("DELIVERY_OFFER_EXPIRED", "Delivery offer is no longer available", 409);
      }
      if (row.offer.version !== input.expectedOfferVersion) {
        throw new PersistenceError("VERSION_CONFLICT", "Delivery offer changed before acceptance", 409);
      }
      const [delivery] = await db.select().from(deliveries).where(eq(deliveries.id, row.delivery.id)).for("update").limit(1);
      if (!delivery || delivery.status !== "OFFER_SENT") {
        throw new PersistenceError("DELIVERY_OFFER_EXPIRED", "Delivery has already been assigned", 409);
      }
      const shift = await currentShift(db, driver.id);
      const vehicleId = shift?.vehicleId ?? delivery.vehicleId;
      const now = new Date();
      const firstVersion = delivery.version + 1;
      await db.update(deliveryOffers).set({ status: "CANCELLED", respondedAt: now, updatedAt: now, version: sql`${deliveryOffers.version} + 1` }).where(and(eq(deliveryOffers.deliveryId, delivery.id), eq(deliveryOffers.status, "SENT"), sql`${deliveryOffers.id} <> ${row.offer.id}`));
      await db.update(deliveryOffers).set({ status: "ACCEPTED", respondedAt: now, updatedAt: now, version: row.offer.version + 1 }).where(eq(deliveryOffers.id, row.offer.id));
      await db.update(deliveries).set({
        status: "DRIVER_ASSIGNED",
        driverId: driver.id,
        assignedDriverUserId: driver.userId,
        vehicleId,
        updatedAt: now,
        version: firstVersion,
      }).where(eq(deliveries.id, delivery.id));
      await this.writeDeliveryHistory(db, {
        deliveryId: delivery.id,
        previousStatus: delivery.status,
        newStatus: "DRIVER_ASSIGNED",
        action: "DRIVER_ACCEPT_OFFER",
        actorType: "USER",
        actorUserId: driver.userId,
        requestId: randomUUID(),
        idempotencyKey: input.idempotencyKey,
        metadata: { offerId: row.offer.id },
      });
      await db.update(deliveries).set({
        status: "DRIVER_ACCEPTED",
        updatedAt: now,
        version: firstVersion + 1,
      }).where(eq(deliveries.id, delivery.id));
      await this.writeDeliveryHistory(db, {
        deliveryId: delivery.id,
        previousStatus: "DRIVER_ASSIGNED",
        newStatus: "DRIVER_ACCEPTED",
        action: "CONFIRM_ASSIGNMENT",
        actorType: "SYSTEM",
        actorUserId: null,
        requestId: randomUUID(),
        idempotencyKey: `${input.idempotencyKey}:confirm`,
        metadata: { offerId: row.offer.id },
      });
      await this.writeAuditAndOutbox(db, driver.userId, "delivery.offer_accepted", "DELIVERY", delivery.id, firstVersion + 1, {
        offerId: row.offer.id,
        previousStatus: delivery.status,
        status: "DRIVER_ACCEPTED",
      });
      const [updated] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id)).limit(1);
      return toDeliveryRecord(updated!);
    });
  }

  rejectOffer(input: {
    driverUserId: string;
    offerId: string;
    expectedOfferVersion: number;
    reason?: string | null;
  }): Promise<{ accepted: boolean }> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const driver = await driverForUser(db, input.driverUserId, true);
      const [offer] = await db
        .select()
        .from(deliveryOffers)
        .where(and(eq(deliveryOffers.id, input.offerId), eq(deliveryOffers.driverId, driver.id)))
        .for("update")
        .limit(1);
      if (!offer || offer.status !== "SENT") {
        throw new PersistenceError("DELIVERY_OFFER_EXPIRED", "Delivery offer is no longer available", 409);
      }
      if (offer.version !== input.expectedOfferVersion) {
        throw new PersistenceError("VERSION_CONFLICT", "Delivery offer changed before rejection", 409);
      }
      const now = new Date();
      await db.update(deliveryOffers).set({
        status: "REJECTED",
        respondedAt: now,
        rejectionReason: input.reason ?? null,
        updatedAt: now,
        version: offer.version + 1,
      }).where(eq(deliveryOffers.id, offer.id));
      const [remaining] = await db
        .select({ count: sql<number>`count(${deliveryOffers.id})::integer` })
        .from(deliveryOffers)
        .where(and(eq(deliveryOffers.deliveryId, offer.deliveryId), eq(deliveryOffers.status, "SENT"), gt(deliveryOffers.expiresAt, now)));
      if ((remaining?.count ?? 0) === 0) {
        const [delivery] = await db.select().from(deliveries).where(eq(deliveries.id, offer.deliveryId)).for("update").limit(1);
        if (delivery?.status === "OFFER_SENT") {
          await db.update(deliveries).set({ status: "AWAITING_ASSIGNMENT", updatedAt: now, version: delivery.version + 1 }).where(eq(deliveries.id, delivery.id));
          await this.writeDeliveryHistory(db, {
            deliveryId: delivery.id,
            previousStatus: delivery.status,
            newStatus: "AWAITING_ASSIGNMENT",
            action: "DRIVER_REJECT_OFFER",
            actorType: "USER",
            actorUserId: driver.userId,
            requestId: randomUUID(),
            idempotencyKey: `reject:${offer.id}:${offer.version}`,
            reasonText: input.reason,
            metadata: { offerId: offer.id },
          });
        }
      }
      return { accepted: true };
    });
  }

  async findActiveDelivery(driverUserId: string): Promise<DriverDeliveryRecord | null> {
    const driver = await driverForUser(this.db, driverUserId);
    const delivery = await activeDelivery(this.db, driver.id);
    return delivery ? toDeliveryRecord(delivery) : null;
  }

  async findDelivery(driverUserId: string, deliveryIdOrReference: string): Promise<DriverDeliveryRecord | null> {
    const driver = await driverForUser(this.db, driverUserId);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      deliveryIdOrReference,
    );
    const [delivery] = await this.db
      .select()
      .from(deliveries)
      .where(and(
        eq(deliveries.driverId, driver.id),
        isUuid
          ? or(eq(deliveries.id, deliveryIdOrReference), eq(deliveries.publicReference, deliveryIdOrReference))
          : eq(deliveries.publicReference, deliveryIdOrReference),
      ))
      .limit(1);
    return delivery ? toDeliveryRecord(delivery) : null;
  }

  transitionDelivery(input: {
    driverUserId: string;
    deliveryId: string;
    expectedVersion: number;
    expectedState: DeliveryStatus;
    newState: DeliveryStatus;
    action: string;
    reason?: string | null;
    evidence?: Record<string, unknown> | null;
    idempotencyKey: string;
    offlineEventId?: string | null;
    cashCollectedMinor?: string | null;
    currency?: string | null;
  }): Promise<DriverDeliveryRecord> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const driver = await driverForUser(db, input.driverUserId, true);
      const [delivery] = await db
        .select()
        .from(deliveries)
        .where(and(eq(deliveries.id, input.deliveryId), eq(deliveries.driverId, driver.id)))
        .for("update")
        .limit(1);
      if (!delivery) throw PersistenceError.notFound("Delivery not found");
      if (delivery.version !== input.expectedVersion || delivery.status !== input.expectedState) {
        throw new PersistenceError("VERSION_CONFLICT", "Delivery changed before transition", 409);
      }
      const now = new Date();
      const completedAt = input.newState === "COMPLETED" ? now : delivery.completedAt;
      const [updated] = await db.update(deliveries).set({
        status: input.newState,
        completedAt,
        updatedAt: now,
        version: delivery.version + 1,
      }).where(eq(deliveries.id, delivery.id)).returning();
      await this.writeDeliveryHistory(db, {
        deliveryId: delivery.id,
        previousStatus: delivery.status,
        newStatus: input.newState,
        action: input.action,
        actorType: "USER",
        actorUserId: driver.userId,
        requestId: randomUUID(),
        idempotencyKey: input.idempotencyKey,
        reasonText: input.reason,
        metadata: { evidence: input.evidence ?? null, offlineEventId: input.offlineEventId ?? null },
      });
      if (input.newState === "COMPLETED") {
        await db.update(vendorOrders).set({ status: "DELIVERED", deliveredAt: now, updatedAt: now, version: sql`${vendorOrders.version} + 1` }).where(eq(vendorOrders.id, delivery.vendorOrderId));
      }
      if (input.newState === "COMPLETED" && input.cashCollectedMinor && BigInt(input.cashCollectedMinor) > 0n) {
        await db.insert(driverCashTransactions).values({
          id: randomUUID(),
          driverId: driver.id,
          deliveryId: delivery.id,
          type: "CASH_COLLECTED",
          amountMinor: BigInt(input.cashCollectedMinor),
          currency: input.currency ?? delivery.currency,
          status: "PENDING",
          offlineEventId: input.offlineEventId ?? null,
          idempotencyKey: input.idempotencyKey,
          reason: "Delivery completion cash collection",
        });
      }
      await this.writeAuditAndOutbox(db, driver.userId, "delivery.transitioned", "DELIVERY", delivery.id, updated!.version, {
        previousStatus: delivery.status,
        status: input.newState,
        action: input.action,
      });
      return toDeliveryRecord(updated!);
    });
  }

  async recordLocations(input: {
    driverUserId: string;
    points: Array<{
      deliveryId?: string | null;
      latitude: string;
      longitude: string;
      accuracyMetres?: string | null;
      headingDegrees?: string | null;
      speedMetresSecond?: string | null;
      recordedAt: Date;
      offlineEventId?: string | null;
      source: typeof driverLocations.$inferSelect.source;
    }>;
  }): Promise<{ accepted: number; duplicates: number }> {
    const driver = await driverForUser(this.db, input.driverUserId);
    const rows = input.points.map((point) => ({
      id: randomUUID(),
      driverId: driver.id,
      deliveryId: point.deliveryId ?? null,
      latitude: point.latitude,
      longitude: point.longitude,
      accuracyMetres: point.accuracyMetres ?? null,
      headingDegrees: point.headingDegrees ?? null,
      speedMetresSecond: point.speedMetresSecond ?? null,
      recordedAt: point.recordedAt,
      source: point.source,
      offlineEventId: point.offlineEventId ?? null,
    }));
    const inserted = rows.length
      ? await this.db.insert(driverLocations).values(rows).onConflictDoNothing().returning({ id: driverLocations.id })
      : [];
    return { accepted: inserted.length, duplicates: rows.length - inserted.length };
  }

  async readCash(driverUserId: string): Promise<{ liability: DriverMoneyRecord }> {
    const driver = await driverForUser(this.db, driverUserId);
    return { liability: moneyRecord(await cashLiability(this.db, driver.id), driver.currency) };
  }

  async listCashTransactions(driverUserId: string, query: { cursor?: string; limit: number }): Promise<{
    items: Array<{ id: string; type: string; amount: DriverMoneyRecord; status: string; createdAt: string }>;
    pagination: { nextCursor: string | null; hasMore: boolean; limit: number };
  }> {
    const driver = await driverForUser(this.db, driverUserId);
    const cursor = decodeCursor(query.cursor);
    const rows = await this.db
      .select()
      .from(driverCashTransactions)
      .where(and(eq(driverCashTransactions.driverId, driver.id), cursor ? gt(driverCashTransactions.id, cursor) : undefined))
      .orderBy(asc(driverCashTransactions.id))
      .limit(query.limit + 1);
    const selected = rows.slice(0, query.limit);
    return {
      items: selected.map((row) => ({
        id: row.id,
        type: row.type,
        amount: moneyRecord(row.amountMinor, row.currency),
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: {
        nextCursor: rows.length > query.limit && selected.length ? encodeCursor(selected[selected.length - 1]!.id) : null,
        hasMore: rows.length > query.limit,
        limit: query.limit,
      },
    };
  }

  recordCashDeposit(input: {
    driverUserId: string;
    amountMinor: string;
    currency: string;
    reference?: string | null;
    evidenceStorageKey?: string | null;
    idempotencyKey: string;
  }): Promise<{ id: string; status: string; amount: DriverMoneyRecord }> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const driver = await driverForUser(db, input.driverUserId, true);
      const [created] = await db.insert(driverCashTransactions).values({
        id: randomUUID(),
        driverId: driver.id,
        type: "CASH_DEPOSITED",
        amountMinor: BigInt(input.amountMinor),
        currency: input.currency,
        status: "PENDING",
        reference: input.reference ?? null,
        evidenceStorageKey: input.evidenceStorageKey ?? null,
        idempotencyKey: input.idempotencyKey,
      }).returning();
      return { id: created!.id, status: created!.status, amount: moneyRecord(created!.amountMinor, created!.currency) };
    });
  }

  async disputeCashTransaction(input: {
    driverUserId: string;
    transactionId: string;
    reason: string;
  }): Promise<{ id: string; status: string }> {
    const driver = await driverForUser(this.db, input.driverUserId);
    const [updated] = await this.db.update(driverCashTransactions).set({
      status: "DISPUTED",
      reason: input.reason,
      updatedAt: new Date(),
    }).where(and(eq(driverCashTransactions.id, input.transactionId), eq(driverCashTransactions.driverId, driver.id))).returning();
    if (!updated) throw PersistenceError.notFound("Cash transaction not found");
    return { id: updated.id, status: updated.status };
  }

  async readEarnings(driverUserId: string): Promise<DriverEarningsRecord> {
    const driver = await driverForUser(this.db, driverUserId);
    const [today, week, cash, recentDeliveries, recentCash] = await Promise.all([
      deliveryEarningsSince(this.db, driver.id, startOfToday()),
      deliveryEarningsSince(this.db, driver.id, startOfWeek()),
      cashLiability(this.db, driver.id),
      this.db
        .select()
        .from(deliveries)
        .where(and(eq(deliveries.driverId, driver.id), eq(deliveries.status, "COMPLETED")))
        .orderBy(desc(deliveries.completedAt))
        .limit(10),
      this.db
        .select()
        .from(driverCashTransactions)
        .where(eq(driverCashTransactions.driverId, driver.id))
        .orderBy(desc(driverCashTransactions.createdAt))
        .limit(10),
    ]);
    return {
      today: moneyRecord(today.amount, driver.currency),
      thisWeek: moneyRecord(week.amount, driver.currency),
      pending: moneyRecord(week.amount, driver.currency),
      available: moneyRecord(0, driver.currency),
      paid: moneyRecord(0, driver.currency),
      bonuses: moneyRecord(0, driver.currency),
      adjustments: moneyRecord(0, driver.currency),
      cashLiability: moneyRecord(cash, driver.currency),
      transactions: [
        ...recentDeliveries.map((delivery) => ({
          id: delivery.id,
          reference: delivery.publicReference,
          kind: "DELIVERY" as const,
          amount: moneyRecord(delivery.driverEarningMinor, delivery.currency),
          status: delivery.status,
          occurredAt: (delivery.completedAt ?? delivery.updatedAt).toISOString(),
        })),
        ...recentCash.map((transaction) => ({
          id: transaction.id,
          reference: transaction.reference ?? transaction.id,
          kind: "CASH" as const,
          amount: moneyRecord(transaction.amountMinor, transaction.currency),
          status: transaction.status,
          occurredAt: transaction.createdAt.toISOString(),
        })),
      ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 20),
    };
  }

  async reportSafetyIncident(input: {
    driverUserId: string;
    deliveryId?: string | null;
    incidentType: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    description: string;
    latitude?: string | null;
    longitude?: string | null;
    evidenceStorageKeys?: string[];
  }): Promise<{ id: string; status: string }> {
    const driver = await driverForUser(this.db, input.driverUserId);
    const [created] = await this.db.insert(driverSafetyIncidents).values({
      id: randomUUID(),
      driverId: driver.id,
      deliveryId: input.deliveryId ?? null,
      incidentType: input.incidentType,
      severity: input.severity,
      description: input.description,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      evidenceStorageKeys: input.evidenceStorageKeys ?? [],
    }).returning();
    return { id: created!.id, status: created!.status };
  }

  async reportEmergency(input: {
    driverUserId: string;
    deliveryId?: string | null;
    emergencyType: string;
    message?: string | null;
    latitude?: string | null;
    longitude?: string | null;
  }): Promise<{ id: string; status: string }> {
    const driver = await driverForUser(this.db, input.driverUserId);
    const [created] = await this.db.insert(driverEmergencyEvents).values({
      id: randomUUID(),
      driverId: driver.id,
      deliveryId: input.deliveryId ?? null,
      emergencyType: input.emergencyType,
      message: input.message ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    }).returning();
    return { id: created!.id, status: created!.status };
  }

  private async writeDeliveryHistory(
    db: Database,
    input: {
      deliveryId: string;
      previousStatus: DeliveryStatus | null;
      newStatus: DeliveryStatus;
      action: string;
      actorType: "USER" | "SYSTEM";
      actorUserId: string | null;
      requestId: string;
      idempotencyKey: string;
      reasonText?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await db.insert(deliveryStatusHistory).values({
      id: randomUUID(),
      deliveryId: input.deliveryId,
      previousStatus: input.previousStatus,
      newStatus: input.newStatus,
      action: input.action,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      reasonText: input.reasonText,
      requestId: input.requestId,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
    });
  }

  private async writeAuditAndOutbox(
    db: Database,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    eventVersion: number,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await db.insert(auditLogs).values({
      id: randomUUID(),
      actorType: "USER",
      actorUserId,
      action,
      entityType,
      entityId,
      afterData: payload,
    });
    await db.insert(outboxEvents).values({
      id: randomUUID(),
      aggregateType: entityType,
      aggregateId: entityId,
      eventType: action,
      eventVersion,
      payload,
    });
  }
}
