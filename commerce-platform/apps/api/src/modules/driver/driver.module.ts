import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CursorPaginationSchema,
  type DeliveryStatus,
  type DriverStatus,
  type MoneyDto,
} from "@nister/contracts";
import {
  PostgresDriverOperationsRepository,
  type DriverDeliveryRecord,
  type DriverEarningsRecord,
  type DriverHomeRecord,
  type DriverOfferRecord,
  type DriverMoneyRecord,
  type Database,
} from "@nister/database";
import { money } from "@nister/money";
import { deliveryMachine, type DeliveryAction } from "@nister/state-machines";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { RequirePermissions, type AuthenticatedPrincipal } from "../../common/auth.js";
import { ApiError } from "../../common/errors.js";
import { ListEnvelope, type PageResult, ZodValidationPipe } from "../../common/http.js";
import { IdempotencyService, requireIdempotencyKey } from "../../common/idempotency.js";
import { moneyDto } from "../../common/money.js";
import { CurrentPrincipal } from "../../common/principal.js";
import {
  DATABASE,
  PERSISTENCE_MODE,
  PersistenceModule,
  requireDatabase,
  type PersistenceMode,
} from "../../persistence/persistence.module.js";

const UuidSchema = z.uuid();
const MinorAmountSchema = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform(String);

const StartShiftSchema = z.object({
  vehicleId: z.uuid().optional(),
  serviceZoneId: z.uuid().optional(),
  batteryPercentage: z.number().int().min(0).max(100).optional(),
  startCheckData: z.record(z.string(), z.unknown()).default({}),
});

const OfferActionSchema = z.object({
  expectedOfferVersion: z.number().int().positive(),
  reason: z.string().min(1).max(500).optional(),
});

const DeliveryBaseTransitionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  recordedAt: z.iso.datetime().optional(),
  offlineEventId: z.uuid().optional(),
  notes: z.string().max(2_000).optional(),
});

const PickupVerificationSchema = DeliveryBaseTransitionSchema.extend({
  pickupCode: z.string().min(2).max(100),
  packageCount: z.number().int().positive(),
  qrValue: z.string().max(500).optional(),
  evidenceFileIds: z.array(z.string().min(1)).default([]),
});

const CompletionSchema = DeliveryBaseTransitionSchema.extend({
  deliveryCode: z.string().min(2).max(100),
  recipientName: z.string().min(2).max(200),
  signatureFileId: z.string().min(1).optional(),
  photoFileIds: z.array(z.string().min(1)).default([]),
  cashCollectedMinor: MinorAmountSchema.optional(),
  currency: z.string().length(3).default("GHS"),
});

const FailureSchema = DeliveryBaseTransitionSchema.extend({
  reason: z.string().min(3).max(1_000),
});

const LocationBatchSchema = z.object({
  points: z.array(z.object({
    deliveryId: z.uuid().nullable().optional(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMetres: z.number().nonnegative().optional(),
    headingDegrees: z.number().min(0).max(360).optional(),
    speedMetresSecond: z.number().nonnegative().optional(),
    recordedAt: z.iso.datetime(),
    offlineEventId: z.uuid().optional(),
    source: z.enum(["FOREGROUND", "BACKGROUND", "OFFLINE_SYNC"]).default("FOREGROUND"),
  })).min(1).max(100),
});

const CashDepositSchema = z.object({
  amountMinor: MinorAmountSchema,
  currency: z.string().length(3).default("GHS"),
  reference: z.string().max(64).optional(),
  evidenceStorageKey: z.string().max(1000).optional(),
});

const CashDisputeSchema = z.object({
  transactionId: z.uuid(),
  reason: z.string().min(3).max(1_000),
});

const SafetyIncidentSchema = z.object({
  deliveryId: z.uuid().nullable().optional(),
  incidentType: z.string().min(2).max(100),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  description: z.string().min(3).max(2_000),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  evidenceStorageKeys: z.array(z.string().min(1).max(1000)).default([]),
});

const EmergencySchema = z.object({
  deliveryId: z.uuid().nullable().optional(),
  emergencyType: z.string().min(2).max(100),
  message: z.string().max(2_000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

type StartShiftInput = z.infer<typeof StartShiftSchema>;
type OfferActionInput = z.infer<typeof OfferActionSchema>;
type DeliveryBaseTransition = z.infer<typeof DeliveryBaseTransitionSchema>;
type PickupVerificationInput = z.infer<typeof PickupVerificationSchema>;
type CompletionInput = z.infer<typeof CompletionSchema>;
type FailureInput = z.infer<typeof FailureSchema>;
type LocationBatchInput = z.infer<typeof LocationBatchSchema>;
type CashDepositInput = z.infer<typeof CashDepositSchema>;
type CashDisputeInput = z.infer<typeof CashDisputeSchema>;
type SafetyIncidentInput = z.infer<typeof SafetyIncidentSchema>;
type EmergencyInput = z.infer<typeof EmergencySchema>;

export interface DriverHomeDto {
  driverStatus: DriverStatus;
  onlineStatus: "ONLINE" | "OFFLINE" | "PAUSED";
  currentShiftId: string | null;
  currentVehicle: string;
  currentZone: string;
  activeDeliveryId: string | null;
  cashLiability: MoneyDto;
  todayEarnings: MoneyDto;
  todayDeliveries: number;
  eligibilityBlocks: string[];
  alerts: string[];
}

export interface DriverOfferDto {
  id: string;
  version: number;
  expiresAt: string;
  pickupArea: string;
  dropoffArea: string;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  packageSize: string;
  vehicleRequirement: string;
  expectedEarnings: MoneyDto;
  cashOnDelivery: MoneyDto | null;
  pickupCount: number;
  dropoffCount: number;
}

export interface DriverDeliveryDto {
  id: string;
  reference: string;
  status: DeliveryStatus;
  version: number;
  nextAction: DriverDeliveryAction | null;
  pickupCodeRequired: boolean;
  deliveryCodeRequired: boolean;
  cashExpected: MoneyDto | null;
  earnings: MoneyDto;
  stops: DriverDeliveryRecord["stops"];
}

type DriverDeliveryAction =
  | "TRAVELLING_TO_PICKUP"
  | "ARRIVED_AT_PICKUP"
  | "VERIFY_PICKUP"
  | "START_TRANSIT"
  | "ARRIVED_AT_CUSTOMER"
  | "COMPLETE";

export interface DriverOperationsRepository {
  readHome(driverUserId: string): Promise<DriverHomeRecord>;
  startShift(input: { driverUserId: string } & StartShiftInput): Promise<DriverHomeRecord>;
  updateShift(input: { driverUserId: string; shiftId?: string; action: "PAUSE" | "RESUME" | "END" }): Promise<DriverHomeRecord>;
  listOffers(driverUserId: string): Promise<DriverOfferRecord[]>;
  findOffer(driverUserId: string, offerId: string): Promise<DriverOfferRecord | null>;
  acceptOffer(input: { driverUserId: string; offerId: string; expectedOfferVersion: number; idempotencyKey: string }): Promise<DriverDeliveryRecord>;
  rejectOffer(input: { driverUserId: string; offerId: string; expectedOfferVersion: number; reason?: string | null }): Promise<{ accepted: boolean }>;
  findActiveDelivery(driverUserId: string): Promise<DriverDeliveryRecord | null>;
  findDelivery(driverUserId: string, deliveryIdOrReference: string): Promise<DriverDeliveryRecord | null>;
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
  }): Promise<DriverDeliveryRecord>;
  recordLocations(input: {
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
      source: "FOREGROUND" | "BACKGROUND" | "OFFLINE_SYNC";
    }>;
  }): Promise<{ accepted: number; duplicates: number }>;
  readCash(driverUserId: string): Promise<{ liability: DriverMoneyRecord }>;
  listCashTransactions(driverUserId: string, query: { cursor?: string; limit: number }): Promise<PageResult<{
    id: string;
    type: string;
    amount: DriverMoneyRecord;
    status: string;
    createdAt: string;
  }>>;
  recordCashDeposit(input: { driverUserId: string } & CashDepositInput & { idempotencyKey: string }): Promise<{ id: string; status: string; amount: DriverMoneyRecord }>;
  disputeCashTransaction(input: { driverUserId: string } & CashDisputeInput): Promise<{ id: string; status: string }>;
  readEarnings(driverUserId: string): Promise<DriverEarningsRecord>;
  reportSafetyIncident(input: {
    driverUserId: string;
    deliveryId?: string | null;
    incidentType: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    description: string;
    latitude?: string | null;
    longitude?: string | null;
    evidenceStorageKeys?: string[];
  }): Promise<{ id: string; status: string }>;
  reportEmergency(input: {
    driverUserId: string;
    deliveryId?: string | null;
    emergencyType: string;
    message?: string | null;
    latitude?: string | null;
    longitude?: string | null;
  }): Promise<{ id: string; status: string }>;
}

export const DRIVER_OPERATIONS_REPOSITORY = Symbol("DRIVER_OPERATIONS_REPOSITORY");

const toMoneyDto = (value: DriverMoneyRecord): MoneyDto => moneyDto(money(value.amountMinor, value.currency));

function nextAction(status: DeliveryStatus): DriverDeliveryAction | null {
  switch (status) {
    case "DRIVER_ACCEPTED":
      return "TRAVELLING_TO_PICKUP";
    case "TRAVELLING_TO_PICKUP":
      return "ARRIVED_AT_PICKUP";
    case "ARRIVED_AT_PICKUP":
      return "VERIFY_PICKUP";
    case "PICKUP_VERIFIED":
      return "START_TRANSIT";
    case "IN_TRANSIT":
      return "ARRIVED_AT_CUSTOMER";
    case "ARRIVED_AT_CUSTOMER":
      return "COMPLETE";
    default:
      return null;
  }
}

function homeDto(home: DriverHomeRecord): DriverHomeDto {
  return {
    driverStatus: home.driverStatus,
    onlineStatus: home.onlineStatus,
    currentShiftId: home.currentShift?.id ?? null,
    currentVehicle: home.currentVehicle?.label ?? "No approved vehicle",
    currentZone: home.currentZone?.name ?? "No active zone",
    activeDeliveryId: home.activeDeliveryId,
    cashLiability: toMoneyDto(home.cashLiability),
    todayEarnings: toMoneyDto(home.todayEarnings),
    todayDeliveries: home.todayDeliveries,
    eligibilityBlocks: home.eligibilityBlocks,
    alerts: home.alerts,
  };
}

function offerDto(offer: DriverOfferRecord): DriverOfferDto {
  return {
    ...offer,
    expectedEarnings: toMoneyDto(offer.expectedEarnings),
    cashOnDelivery: offer.cashOnDelivery ? toMoneyDto(offer.cashOnDelivery) : null,
  };
}

function deliveryDto(delivery: DriverDeliveryRecord): DriverDeliveryDto {
  return {
    ...delivery,
    nextAction: nextAction(delivery.status),
    cashExpected: delivery.cashExpected ? toMoneyDto(delivery.cashExpected) : null,
    earnings: toMoneyDto(delivery.earnings),
  };
}

function earningsDto(earnings: DriverEarningsRecord) {
  return {
    ...earnings,
    today: toMoneyDto(earnings.today),
    thisWeek: toMoneyDto(earnings.thisWeek),
    pending: toMoneyDto(earnings.pending),
    available: toMoneyDto(earnings.available),
    paid: toMoneyDto(earnings.paid),
    bonuses: toMoneyDto(earnings.bonuses),
    adjustments: toMoneyDto(earnings.adjustments),
    cashLiability: toMoneyDto(earnings.cashLiability),
    transactions: earnings.transactions.map((transaction) => ({
      ...transaction,
      amount: toMoneyDto(transaction.amount),
    })),
  };
}

@Injectable()
export class InMemoryDriverOperationsRepository implements DriverOperationsRepository {
  private home: DriverHomeRecord = {
    driverId: "00000000-0000-4000-8000-000000000501",
    publicReference: "DRV-DEMO",
    driverStatus: "ACTIVE",
    onlineStatus: "OFFLINE",
    currentShift: null,
    currentVehicle: { id: "00000000-0000-4000-8000-000000000502", label: "Motorbike · DEMO-24", status: "ACTIVE" },
    currentZone: { id: "00000000-0000-4000-8000-000000000503", name: "Accra Central" },
    activeDeliveryId: null,
    cashLiability: { amountMinor: "0", currency: "GHS" },
    todayEarnings: { amountMinor: "0", currency: "GHS" },
    todayDeliveries: 0,
    eligibilityBlocks: [],
    alerts: [],
  };
  private readonly offers = new Map<string, DriverOfferRecord>();
  private readonly deliveries = new Map<string, DriverDeliveryRecord>();

  constructor() {
    const offerId = "00000000-0000-4000-8000-000000000510";
    this.offers.set(offerId, {
      id: offerId,
      version: 1,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      pickupArea: "Osu",
      dropoffArea: "Labone",
      estimatedDistanceKm: 5.4,
      estimatedDurationMinutes: 26,
      packageSize: "2 medium bags",
      vehicleRequirement: "Motorbike or car",
      expectedEarnings: { amountMinor: "1850", currency: "GHS" },
      cashOnDelivery: { amountMinor: "12800", currency: "GHS" },
      pickupCount: 1,
      dropoffCount: 1,
    });
  }

  async readHome(): Promise<DriverHomeRecord> {
    return structuredClone(this.home);
  }

  async startShift(): Promise<DriverHomeRecord> {
    this.home = {
      ...this.home,
      onlineStatus: "ONLINE",
      currentShift: {
        id: this.home.currentShift?.id ?? randomUUID(),
        status: "STARTED",
        vehicleId: this.home.currentVehicle!.id,
        serviceZoneId: this.home.currentZone!.id,
        startedAt: new Date().toISOString(),
        pausedAt: null,
        endedAt: null,
        version: 1,
      },
    };
    return this.readHome();
  }

  async updateShift(input: { action: "PAUSE" | "RESUME" | "END" }): Promise<DriverHomeRecord> {
    if (!this.home.currentShift) throw ApiError.notFound("Driver shift not found");
    const nextStatus = input.action === "PAUSE" ? "PAUSED" : input.action === "RESUME" ? "STARTED" : "ENDED";
    this.home = {
      ...this.home,
      onlineStatus: nextStatus === "STARTED" ? "ONLINE" : nextStatus === "PAUSED" ? "PAUSED" : "OFFLINE",
      currentShift: nextStatus === "ENDED" ? null : { ...this.home.currentShift, status: nextStatus, version: this.home.currentShift.version + 1 },
    };
    return this.readHome();
  }

  async listOffers(): Promise<DriverOfferRecord[]> {
    return [...this.offers.values()].map((offer) => structuredClone(offer));
  }

  async findOffer(_driverUserId: string, offerId: string): Promise<DriverOfferRecord | null> {
    return this.offers.has(offerId) ? structuredClone(this.offers.get(offerId)!) : null;
  }

  async acceptOffer(input: { offerId: string; expectedOfferVersion: number }): Promise<DriverDeliveryRecord> {
    const offer = this.offers.get(input.offerId);
    if (!offer || offer.version !== input.expectedOfferVersion) throw new ApiError("DELIVERY_OFFER_EXPIRED", "Delivery offer is no longer available", 409);
    this.offers.delete(input.offerId);
    const delivery: DriverDeliveryRecord = {
      id: "00000000-0000-4000-8000-000000000520",
      reference: "DEL-DEMO",
      status: "DRIVER_ACCEPTED",
      version: 1,
      pickupCodeRequired: true,
      deliveryCodeRequired: true,
      cashExpected: offer.cashOnDelivery,
      earnings: offer.expectedEarnings,
      stops: [
        { id: "pickup", kind: "PICKUP", name: "Demo Vendor", area: offer.pickupArea, address: "Oxford Street", instructions: null, packageCount: 1, complete: false },
        { id: "dropoff", kind: "DROPOFF", name: "Customer", area: offer.dropoffArea, address: "Customer address", instructions: null, packageCount: 1, complete: false },
      ],
    };
    this.deliveries.set(delivery.id, delivery);
    this.home = { ...this.home, activeDeliveryId: delivery.id };
    return structuredClone(delivery);
  }

  async rejectOffer(input: { offerId: string }): Promise<{ accepted: boolean }> {
    this.offers.delete(input.offerId);
    return { accepted: true };
  }

  async findActiveDelivery(): Promise<DriverDeliveryRecord | null> {
    const deliveryId = this.home.activeDeliveryId;
    return deliveryId && this.deliveries.has(deliveryId) ? structuredClone(this.deliveries.get(deliveryId)!) : null;
  }

  async findDelivery(_driverUserId: string, deliveryIdOrReference: string): Promise<DriverDeliveryRecord | null> {
    const delivery = [...this.deliveries.values()].find((item) => item.id === deliveryIdOrReference || item.reference === deliveryIdOrReference);
    return delivery ? structuredClone(delivery) : null;
  }

  async transitionDelivery(input: { deliveryId: string; newState: DeliveryStatus; cashCollectedMinor?: string | null }): Promise<DriverDeliveryRecord> {
    const delivery = this.deliveries.get(input.deliveryId);
    if (!delivery) throw ApiError.notFound("Delivery not found");
    const updated = {
      ...delivery,
      status: input.newState,
      version: delivery.version + 1,
      stops: delivery.stops.map((stop) =>
        input.newState === "PICKUP_VERIFIED" && stop.kind === "PICKUP"
          ? { ...stop, complete: true }
          : input.newState === "COMPLETED" && stop.kind === "DROPOFF"
            ? { ...stop, complete: true }
            : stop,
      ),
    };
    this.deliveries.set(updated.id, updated);
    if (updated.status === "COMPLETED") {
      this.home = {
        ...this.home,
        activeDeliveryId: null,
        todayDeliveries: this.home.todayDeliveries + 1,
        todayEarnings: { amountMinor: String(BigInt(this.home.todayEarnings.amountMinor) + BigInt(updated.earnings.amountMinor)), currency: "GHS" },
        cashLiability: input.cashCollectedMinor
          ? { amountMinor: String(BigInt(this.home.cashLiability.amountMinor) + BigInt(input.cashCollectedMinor)), currency: "GHS" }
          : this.home.cashLiability,
      };
    }
    return structuredClone(updated);
  }

  async recordLocations(input: { points: unknown[] }): Promise<{ accepted: number; duplicates: number }> {
    return { accepted: input.points.length, duplicates: 0 };
  }

  async readCash(): Promise<{ liability: DriverMoneyRecord }> {
    return { liability: this.home.cashLiability };
  }

  async listCashTransactions(_driverUserId: string, query: { limit: number }): Promise<PageResult<{ id: string; type: string; amount: DriverMoneyRecord; status: string; createdAt: string }>> {
    return { items: [], pagination: { nextCursor: null, hasMore: false, limit: query.limit } };
  }

  async recordCashDeposit(input: CashDepositInput): Promise<{ id: string; status: string; amount: DriverMoneyRecord }> {
    return { id: randomUUID(), status: "PENDING", amount: { amountMinor: input.amountMinor, currency: input.currency } };
  }

  async disputeCashTransaction(input: CashDisputeInput): Promise<{ id: string; status: string }> {
    return { id: input.transactionId, status: "DISPUTED" };
  }

  async readEarnings(): Promise<DriverEarningsRecord> {
    return {
      today: this.home.todayEarnings,
      thisWeek: this.home.todayEarnings,
      pending: this.home.todayEarnings,
      available: { amountMinor: "0", currency: "GHS" },
      paid: { amountMinor: "0", currency: "GHS" },
      bonuses: { amountMinor: "0", currency: "GHS" },
      adjustments: { amountMinor: "0", currency: "GHS" },
      cashLiability: this.home.cashLiability,
      transactions: [],
    };
  }

  async reportSafetyIncident(): Promise<{ id: string; status: string }> {
    return { id: randomUUID(), status: "OPEN" };
  }

  async reportEmergency(): Promise<{ id: string; status: string }> {
    return { id: randomUUID(), status: "OPEN" };
  }
}

@Injectable()
export class DriverOperationsService {
  constructor(
    @Inject(DRIVER_OPERATIONS_REPOSITORY) private readonly repository: DriverOperationsRepository,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  async home(principal: AuthenticatedPrincipal): Promise<DriverHomeDto> {
    return homeDto(await this.repository.readHome(principal.userId));
  }

  async startShift(principal: AuthenticatedPrincipal, input: StartShiftInput): Promise<DriverHomeDto> {
    return homeDto(await this.repository.startShift({ driverUserId: principal.userId, ...input }));
  }

  async updateShift(principal: AuthenticatedPrincipal, shiftId: string | undefined, action: "PAUSE" | "RESUME" | "END"): Promise<DriverHomeDto> {
    return homeDto(await this.repository.updateShift({ driverUserId: principal.userId, shiftId, action }));
  }

  async listOffers(principal: AuthenticatedPrincipal): Promise<DriverOfferDto[]> {
    return (await this.repository.listOffers(principal.userId)).map(offerDto);
  }

  async getOffer(principal: AuthenticatedPrincipal, offerId: string): Promise<DriverOfferDto> {
    const offer = await this.repository.findOffer(principal.userId, offerId);
    if (!offer) throw ApiError.notFound("Delivery offer not found");
    return offerDto(offer);
  }

  acceptOffer(
    principal: AuthenticatedPrincipal,
    offerId: string,
    input: OfferActionInput,
    idempotencyKey: string,
  ): Promise<DriverDeliveryDto> {
    return this.idempotency.execute(
      `driver:${principal.userId}:offer:${offerId}:accept`,
      idempotencyKey,
      input,
      async () => deliveryDto(await this.repository.acceptOffer({
        driverUserId: principal.userId,
        offerId,
        expectedOfferVersion: input.expectedOfferVersion,
        idempotencyKey,
      })),
    );
  }

  rejectOffer(
    principal: AuthenticatedPrincipal,
    offerId: string,
    input: OfferActionInput,
    idempotencyKey: string,
  ): Promise<{ accepted: boolean }> {
    return this.idempotency.execute(
      `driver:${principal.userId}:offer:${offerId}:reject`,
      idempotencyKey,
      input,
      () => this.repository.rejectOffer({
        driverUserId: principal.userId,
        offerId,
        expectedOfferVersion: input.expectedOfferVersion,
        reason: input.reason,
      }),
    );
  }

  async activeDelivery(principal: AuthenticatedPrincipal): Promise<DriverDeliveryDto | null> {
    const delivery = await this.repository.findActiveDelivery(principal.userId);
    return delivery ? deliveryDto(delivery) : null;
  }

  async getDelivery(principal: AuthenticatedPrincipal, deliveryIdOrReference: string): Promise<DriverDeliveryDto> {
    const delivery = await this.repository.findDelivery(principal.userId, deliveryIdOrReference);
    if (!delivery) throw ApiError.notFound("Delivery not found");
    return deliveryDto(delivery);
  }

  transitionDelivery(
    principal: AuthenticatedPrincipal,
    deliveryId: string,
    endpointAction: DriverDeliveryAction | "FAIL" | "START_RETURN" | "COMPLETE_RETURN",
    input: DeliveryBaseTransition | PickupVerificationInput | CompletionInput | FailureInput,
    idempotencyKey: string,
  ): Promise<DriverDeliveryDto> {
    return this.idempotency.execute(
      `driver:${principal.userId}:delivery:${deliveryId}:${endpointAction}`,
      idempotencyKey,
      input,
      async () => {
        const delivery = await this.repository.findDelivery(principal.userId, deliveryId);
        if (!delivery) throw ApiError.notFound("Delivery not found");
        if (delivery.version !== input.expectedVersion) throw new ApiError("VERSION_CONFLICT", "Delivery changed", 409);
        const machineAction = this.machineAction(endpointAction);
        const evidence = this.evidenceFor(endpointAction, input);
        const reason = "reason" in input ? input.reason : undefined;
        if (endpointAction === "COMPLETE" && delivery.cashExpected && !("cashCollectedMinor" in input && input.cashCollectedMinor)) {
          throw new ApiError("DELIVERY_VERIFICATION_FAILED", "Cash collection amount is required for this delivery", 422);
        }
        const newState = deliveryMachine.transition({
          currentState: delivery.status,
          action: machineAction,
          reason,
          evidence,
        });
        return deliveryDto(await this.repository.transitionDelivery({
          driverUserId: principal.userId,
          deliveryId: delivery.id,
          expectedVersion: input.expectedVersion,
          expectedState: delivery.status,
          newState,
          action: machineAction,
          reason,
          evidence,
          idempotencyKey,
          offlineEventId: input.offlineEventId,
          cashCollectedMinor: "cashCollectedMinor" in input ? input.cashCollectedMinor : null,
          currency: "currency" in input ? input.currency : null,
        }));
      },
    );
  }

  async recordLocations(principal: AuthenticatedPrincipal, input: LocationBatchInput): Promise<{ accepted: number; duplicates: number }> {
    const now = Date.now();
    const points = input.points.map((point) => {
      const recordedAt = new Date(point.recordedAt);
      if (recordedAt.getTime() > now + 10 * 60_000) {
        throw new ApiError("VALIDATION_FAILED", "Location recordedAt cannot be in the future", 400);
      }
      return {
        deliveryId: point.deliveryId,
        latitude: point.latitude.toFixed(7),
        longitude: point.longitude.toFixed(7),
        accuracyMetres: point.accuracyMetres?.toFixed(2),
        headingDegrees: point.headingDegrees?.toFixed(2),
        speedMetresSecond: point.speedMetresSecond?.toFixed(3),
        recordedAt,
        offlineEventId: point.offlineEventId,
        source: point.source,
      };
    });
    return this.repository.recordLocations({ driverUserId: principal.userId, points });
  }

  async cash(principal: AuthenticatedPrincipal): Promise<{ liability: MoneyDto }> {
    const result = await this.repository.readCash(principal.userId);
    return { liability: toMoneyDto(result.liability) };
  }

  async cashTransactions(principal: AuthenticatedPrincipal, query: unknown): Promise<PageResult<{
    id: string;
    type: string;
    amount: MoneyDto;
    status: string;
    createdAt: string;
  }>> {
    const page = await this.repository.listCashTransactions(principal.userId, CursorPaginationSchema.parse(query));
    return {
      ...page,
      items: page.items.map((item) => ({ ...item, amount: toMoneyDto(item.amount) })),
    };
  }

  recordCashDeposit(
    principal: AuthenticatedPrincipal,
    input: CashDepositInput,
    idempotencyKey: string,
  ): Promise<{ id: string; status: string; amount: MoneyDto }> {
    return this.idempotency.execute(
      `driver:${principal.userId}:cash:deposit`,
      idempotencyKey,
      input,
      async () => {
        const result = await this.repository.recordCashDeposit({ driverUserId: principal.userId, ...input, idempotencyKey });
        return { ...result, amount: toMoneyDto(result.amount) };
      },
    );
  }

  disputeCash(principal: AuthenticatedPrincipal, input: CashDisputeInput): Promise<{ id: string; status: string }> {
    return this.repository.disputeCashTransaction({ driverUserId: principal.userId, ...input });
  }

  async earnings(principal: AuthenticatedPrincipal) {
    return earningsDto(await this.repository.readEarnings(principal.userId));
  }

  safetyIncident(principal: AuthenticatedPrincipal, input: SafetyIncidentInput): Promise<{ id: string; status: string }> {
    return this.repository.reportSafetyIncident({
      driverUserId: principal.userId,
      ...input,
      latitude: input.latitude?.toFixed(7),
      longitude: input.longitude?.toFixed(7),
    });
  }

  emergency(principal: AuthenticatedPrincipal, input: EmergencyInput): Promise<{ id: string; status: string }> {
    return this.repository.reportEmergency({
      driverUserId: principal.userId,
      ...input,
      latitude: input.latitude?.toFixed(7),
      longitude: input.longitude?.toFixed(7),
    });
  }

  payouts(): { items: unknown[]; pagination: { nextCursor: null; hasMore: false; limit: number } } {
    return { items: [], pagination: { nextCursor: null, hasMore: false, limit: 20 } };
  }

  requestPayout(): never {
    throw new ApiError("PAYOUT_NOT_ELIGIBLE", "Driver payouts require ledger-backed eligibility and are not enabled yet", 422);
  }

  private machineAction(endpointAction: DriverDeliveryAction | "FAIL" | "START_RETURN" | "COMPLETE_RETURN"): DeliveryAction {
    const map = {
      TRAVELLING_TO_PICKUP: "TRAVEL_TO_PICKUP",
      ARRIVED_AT_PICKUP: "ARRIVE_PICKUP",
      VERIFY_PICKUP: "VERIFY_PICKUP",
      START_TRANSIT: "START_TRANSIT",
      ARRIVED_AT_CUSTOMER: "ARRIVE_CUSTOMER",
      COMPLETE: "COMPLETE",
      FAIL: "FAIL",
      START_RETURN: "START_RETURN",
      COMPLETE_RETURN: "COMPLETE_RETURN",
    } as const;
    return map[endpointAction];
  }

  private evidenceFor(
    endpointAction: DriverDeliveryAction | "FAIL" | "START_RETURN" | "COMPLETE_RETURN",
    input: DeliveryBaseTransition | PickupVerificationInput | CompletionInput | FailureInput,
  ): Record<string, unknown> | undefined {
    if (endpointAction === "VERIFY_PICKUP") {
      const pickup = PickupVerificationSchema.parse(input);
      return {
        pickupCode: pickup.pickupCode,
        packageCount: pickup.packageCount,
        qrValue: pickup.qrValue,
        evidenceFileIds: pickup.evidenceFileIds,
        latitude: pickup.latitude,
        longitude: pickup.longitude,
        recordedAt: pickup.recordedAt,
      };
    }
    if (endpointAction === "COMPLETE") {
      const completion = CompletionSchema.parse(input);
      return {
        deliveryCode: completion.deliveryCode,
        recipientName: completion.recipientName,
        signatureFileId: completion.signatureFileId,
        photoFileIds: completion.photoFileIds,
        cashCollectedMinor: completion.cashCollectedMinor,
        latitude: completion.latitude,
        longitude: completion.longitude,
        recordedAt: completion.recordedAt,
      };
    }
    if (endpointAction === "COMPLETE_RETURN") return { completedReturn: true, ...input };
    return undefined;
  }
}

@ApiTags("Driver operations")
@ApiBearerAuth()
@Controller("api/v1/driver")
export class DriverOperationsController {
  constructor(@Inject(DriverOperationsService) private readonly driver: DriverOperationsService) {}

  @Get("home")
  @RequirePermissions("driver.delivery.offer.read")
  @ApiOperation({ summary: "Read driver home state" })
  home(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<DriverHomeDto> {
    return this.driver.home(principal);
  }

  @Post("shifts")
  @RequirePermissions("driver.delivery.update")
  @ApiOperation({ summary: "Start a driver shift" })
  startShift(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(StartShiftSchema)) input: StartShiftInput,
  ): Promise<DriverHomeDto> {
    return this.driver.startShift(principal, input);
  }

  @Post("shifts/current/end")
  @RequirePermissions("driver.delivery.update")
  @ApiOperation({ summary: "End the current driver shift" })
  endCurrentShift(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<DriverHomeDto> {
    return this.driver.updateShift(principal, undefined, "END");
  }

  @Post("shifts/:shiftId/pause")
  @RequirePermissions("driver.delivery.update")
  pauseShift(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("shiftId", ParseUUIDPipe) shiftId: string,
  ): Promise<DriverHomeDto> {
    return this.driver.updateShift(principal, shiftId, "PAUSE");
  }

  @Post("shifts/:shiftId/resume")
  @RequirePermissions("driver.delivery.update")
  resumeShift(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("shiftId", ParseUUIDPipe) shiftId: string,
  ): Promise<DriverHomeDto> {
    return this.driver.updateShift(principal, shiftId, "RESUME");
  }

  @Post("shifts/:shiftId/end")
  @RequirePermissions("driver.delivery.update")
  endShift(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("shiftId", ParseUUIDPipe) shiftId: string,
  ): Promise<DriverHomeDto> {
    return this.driver.updateShift(principal, shiftId, "END");
  }

  @Get("delivery-offers")
  @RequirePermissions("driver.delivery.offer.read")
  listOffers(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<DriverOfferDto[]> {
    return this.driver.listOffers(principal);
  }

  @Get("delivery-offers/:offerId")
  @RequirePermissions("driver.delivery.offer.read")
  getOffer(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("offerId", ParseUUIDPipe) offerId: string,
  ): Promise<DriverOfferDto> {
    return this.driver.getOffer(principal, offerId);
  }

  @Post("delivery-offers/:offerId/accept")
  @RequirePermissions("driver.delivery.offer.accept")
  @ApiHeader({ name: "idempotency-key", required: true })
  acceptOffer(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("offerId", ParseUUIDPipe) offerId: string,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(OfferActionSchema)) input: OfferActionInput,
  ): Promise<DriverDeliveryDto> {
    return this.driver.acceptOffer(principal, offerId, input, requireIdempotencyKey(idempotencyKey));
  }

  @Post("delivery-offers/:offerId/reject")
  @RequirePermissions("driver.delivery.update")
  @ApiHeader({ name: "idempotency-key", required: true })
  rejectOffer(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("offerId", ParseUUIDPipe) offerId: string,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(OfferActionSchema)) input: OfferActionInput,
  ): Promise<{ accepted: boolean }> {
    return this.driver.rejectOffer(principal, offerId, input, requireIdempotencyKey(idempotencyKey));
  }

  @Get("deliveries/active")
  @RequirePermissions("driver.delivery.offer.read")
  activeDelivery(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<DriverDeliveryDto | null> {
    return this.driver.activeDelivery(principal);
  }

  @Get("deliveries/history")
  @ListEnvelope()
  @RequirePermissions("driver.delivery.offer.read")
  deliveryHistory(@Query(new ZodValidationPipe(CursorPaginationSchema)) query: unknown): PageResult<never> {
    const page = CursorPaginationSchema.parse(query);
    return { items: [], pagination: { nextCursor: null, hasMore: false, limit: page.limit } };
  }

  @Get("deliveries/:deliveryReference")
  @RequirePermissions("driver.delivery.offer.read")
  getDelivery(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("deliveryReference") deliveryReference: string,
  ): Promise<DriverDeliveryDto> {
    return this.driver.getDelivery(principal, deliveryReference);
  }

  @Post("deliveries/:deliveryId/travelling-to-pickup")
  @RequirePermissions("driver.delivery.update")
  @ApiHeader({ name: "idempotency-key", required: true })
  travellingToPickup(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("deliveryId", ParseUUIDPipe) deliveryId: string,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(DeliveryBaseTransitionSchema)) input: DeliveryBaseTransition,
  ): Promise<DriverDeliveryDto> {
    return this.driver.transitionDelivery(principal, deliveryId, "TRAVELLING_TO_PICKUP", input, requireIdempotencyKey(idempotencyKey));
  }

  @Post("deliveries/:deliveryId/arrived-at-pickup")
  @RequirePermissions("driver.delivery.update")
  @ApiHeader({ name: "idempotency-key", required: true })
  arrivedAtPickup(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("deliveryId", ParseUUIDPipe) deliveryId: string,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(DeliveryBaseTransitionSchema)) input: DeliveryBaseTransition,
  ): Promise<DriverDeliveryDto> {
    return this.driver.transitionDelivery(principal, deliveryId, "ARRIVED_AT_PICKUP", input, requireIdempotencyKey(idempotencyKey));
  }

  @Post("deliveries/:deliveryId/verify-pickup")
  @RequirePermissions("driver.delivery.update")
  @ApiHeader({ name: "idempotency-key", required: true })
  verifyPickup(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("deliveryId", ParseUUIDPipe) deliveryId: string,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(PickupVerificationSchema)) input: PickupVerificationInput,
  ): Promise<DriverDeliveryDto> {
    return this.driver.transitionDelivery(principal, deliveryId, "VERIFY_PICKUP", input, requireIdempotencyKey(idempotencyKey));
  }

  @Post("deliveries/:deliveryId/start-transit")
  @RequirePermissions("driver.delivery.update")
  @ApiHeader({ name: "idempotency-key", required: true })
  startTransit(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("deliveryId", ParseUUIDPipe) deliveryId: string,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(DeliveryBaseTransitionSchema)) input: DeliveryBaseTransition,
  ): Promise<DriverDeliveryDto> {
    return this.driver.transitionDelivery(principal, deliveryId, "START_TRANSIT", input, requireIdempotencyKey(idempotencyKey));
  }

  @Post("deliveries/:deliveryId/arrived-at-customer")
  @RequirePermissions("driver.delivery.update")
  @ApiHeader({ name: "idempotency-key", required: true })
  arrivedAtCustomer(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("deliveryId", ParseUUIDPipe) deliveryId: string,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(DeliveryBaseTransitionSchema)) input: DeliveryBaseTransition,
  ): Promise<DriverDeliveryDto> {
    return this.driver.transitionDelivery(principal, deliveryId, "ARRIVED_AT_CUSTOMER", input, requireIdempotencyKey(idempotencyKey));
  }

  @Post("deliveries/:deliveryId/complete")
  @RequirePermissions("driver.delivery.complete")
  @ApiHeader({ name: "idempotency-key", required: true })
  completeDelivery(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("deliveryId", ParseUUIDPipe) deliveryId: string,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(CompletionSchema)) input: CompletionInput,
  ): Promise<DriverDeliveryDto> {
    return this.driver.transitionDelivery(principal, deliveryId, "COMPLETE", input, requireIdempotencyKey(idempotencyKey));
  }

  @Post("deliveries/:deliveryId/fail")
  @RequirePermissions("driver.delivery.update")
  @ApiHeader({ name: "idempotency-key", required: true })
  failDelivery(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("deliveryId", ParseUUIDPipe) deliveryId: string,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(FailureSchema)) input: FailureInput,
  ): Promise<DriverDeliveryDto> {
    return this.driver.transitionDelivery(principal, deliveryId, "FAIL", input, requireIdempotencyKey(idempotencyKey));
  }

  @Post("deliveries/:deliveryId/start-return")
  @RequirePermissions("driver.delivery.update")
  @ApiHeader({ name: "idempotency-key", required: true })
  startReturn(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("deliveryId", ParseUUIDPipe) deliveryId: string,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(DeliveryBaseTransitionSchema)) input: DeliveryBaseTransition,
  ): Promise<DriverDeliveryDto> {
    return this.driver.transitionDelivery(principal, deliveryId, "START_RETURN", input, requireIdempotencyKey(idempotencyKey));
  }

  @Post("deliveries/:deliveryId/complete-return")
  @RequirePermissions("driver.delivery.complete")
  @ApiHeader({ name: "idempotency-key", required: true })
  completeReturn(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("deliveryId", ParseUUIDPipe) deliveryId: string,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(DeliveryBaseTransitionSchema)) input: DeliveryBaseTransition,
  ): Promise<DriverDeliveryDto> {
    return this.driver.transitionDelivery(principal, deliveryId, "COMPLETE_RETURN", input, requireIdempotencyKey(idempotencyKey));
  }

  @Post("location-batches")
  @RequirePermissions("driver.delivery.update")
  recordLocations(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(LocationBatchSchema)) input: LocationBatchInput,
  ): Promise<{ accepted: number; duplicates: number }> {
    return this.driver.recordLocations(principal, input);
  }

  @Get("cash")
  @RequirePermissions("driver.earnings.read")
  cash(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<{ liability: MoneyDto }> {
    return this.driver.cash(principal);
  }

  @Post("cash/deposits")
  @RequirePermissions("driver.cash.record")
  @ApiHeader({ name: "idempotency-key", required: true })
  depositCash(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(CashDepositSchema)) input: CashDepositInput,
  ): Promise<{ id: string; status: string; amount: MoneyDto }> {
    return this.driver.recordCashDeposit(principal, input, requireIdempotencyKey(idempotencyKey));
  }

  @Get("cash/transactions")
  @ListEnvelope()
  @RequirePermissions("driver.earnings.read")
  cashTransactions(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query(new ZodValidationPipe(CursorPaginationSchema)) query: unknown,
  ): Promise<PageResult<{ id: string; type: string; amount: MoneyDto; status: string; createdAt: string }>> {
    return this.driver.cashTransactions(principal, query);
  }

  @Post("cash/disputes")
  @RequirePermissions("driver.cash.record")
  disputeCash(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(CashDisputeSchema)) input: CashDisputeInput,
  ): Promise<{ id: string; status: string }> {
    return this.driver.disputeCash(principal, input);
  }

  @Get("earnings/summary")
  @RequirePermissions("driver.earnings.read")
  earnings(@CurrentPrincipal() principal: AuthenticatedPrincipal): ReturnType<DriverOperationsService["earnings"]> {
    return this.driver.earnings(principal);
  }

  @Get("earnings/transactions")
  @ListEnvelope()
  @RequirePermissions("driver.earnings.read")
  earningTransactions(@Query(new ZodValidationPipe(CursorPaginationSchema)) query: unknown): PageResult<never> {
    const page = CursorPaginationSchema.parse(query);
    return { items: [], pagination: { nextCursor: null, hasMore: false, limit: page.limit } };
  }

  @Get("payouts")
  @ListEnvelope()
  @RequirePermissions("driver.earnings.read")
  payouts(): ReturnType<DriverOperationsService["payouts"]> {
    return this.driver.payouts();
  }

  @Post("payouts")
  @RequirePermissions("driver.earnings.read")
  requestPayout(): never {
    return this.driver.requestPayout();
  }

  @Get("performance")
  @RequirePermissions("driver.earnings.read")
  performance(): { acceptanceRate: number; completionRate: number; onTimeRate: number } {
    return { acceptanceRate: 0, completionRate: 0, onTimeRate: 0 };
  }

  @Post("safety-incidents")
  @RequirePermissions("driver.delivery.update")
  safetyIncident(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(SafetyIncidentSchema)) input: SafetyIncidentInput,
  ): Promise<{ id: string; status: string }> {
    return this.driver.safetyIncident(principal, input);
  }

  @Post("emergencies")
  @RequirePermissions("driver.delivery.update")
  emergency(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodValidationPipe(EmergencySchema)) input: EmergencyInput,
  ): Promise<{ id: string; status: string }> {
    return this.driver.emergency(principal, input);
  }
}

@Module({
  imports: [PersistenceModule],
  controllers: [DriverOperationsController],
  providers: [
    {
      provide: DRIVER_OPERATIONS_REPOSITORY,
      inject: [PERSISTENCE_MODE, DATABASE],
      useFactory: (mode: PersistenceMode, database: Database | null): DriverOperationsRepository =>
        mode === "postgres"
          ? new PostgresDriverOperationsRepository(requireDatabase(database))
          : new InMemoryDriverOperationsRepository(),
    },
    DriverOperationsService,
  ],
  exports: [DRIVER_OPERATIONS_REPOSITORY, DriverOperationsService],
})
export class DriverModule {}
