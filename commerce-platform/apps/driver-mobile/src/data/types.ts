import { DeliveryStatusSchema, DriverStatusSchema, MoneySchema } from "@nister/contracts";
import { z } from "zod";

export const DriverSessionSchema = z.object({ accessToken: z.string().min(1), displayName: z.string().min(1), email: z.email() });
export const DriverHomeSchema = z.object({
  driverStatus: DriverStatusSchema,
  onlineStatus: z.enum(["ONLINE", "OFFLINE", "PAUSED"]),
  currentShiftId: z.string().nullable(), currentVehicle: z.string(), currentZone: z.string(), activeDeliveryId: z.uuid().nullable(),
  cashLiability: MoneySchema, todayEarnings: MoneySchema, todayDeliveries: z.number().int().nonnegative(), eligibilityBlocks: z.array(z.string()), alerts: z.array(z.string()),
});
export const DeliveryOfferSchema = z.object({
  id: z.uuid(), version: z.number().int().positive(), expiresAt: z.iso.datetime(), pickupArea: z.string(), dropoffArea: z.string(), estimatedDistanceKm: z.number().nonnegative(), estimatedDurationMinutes: z.number().int().nonnegative(), packageSize: z.string(), vehicleRequirement: z.string(), expectedEarnings: MoneySchema, cashOnDelivery: MoneySchema.nullable(), pickupCount: z.number().int().positive(), dropoffCount: z.number().int().positive(),
});
export const DeliveryStopSchema = z.object({ id: z.string(), kind: z.enum(["PICKUP", "DROPOFF"]), name: z.string(), area: z.string(), address: z.string(), instructions: z.string().nullable(), packageCount: z.number().int().positive(), complete: z.boolean() });
export const DriverDeliverySchema = z.object({
  id: z.uuid(), reference: z.string(), status: DeliveryStatusSchema, version: z.number().int().positive(), nextAction: z.enum(["TRAVELLING_TO_PICKUP", "ARRIVED_AT_PICKUP", "VERIFY_PICKUP", "START_TRANSIT", "ARRIVED_AT_CUSTOMER", "COMPLETE"]).nullable(), pickupCodeRequired: z.boolean(), deliveryCodeRequired: z.boolean(), cashExpected: MoneySchema.nullable(), earnings: MoneySchema, stops: z.array(DeliveryStopSchema),
});
export const EarningsSchema = z.object({ today: MoneySchema, thisWeek: MoneySchema, pending: MoneySchema, available: MoneySchema, paid: MoneySchema, bonuses: MoneySchema, adjustments: MoneySchema, cashLiability: MoneySchema, transactions: z.array(z.object({ id: z.string(), reference: z.string(), kind: z.enum(["DELIVERY", "BONUS", "ADJUSTMENT", "PAYOUT", "CASH"]), amount: MoneySchema, status: z.string(), occurredAt: z.iso.datetime() })) });

export const OfflineEventSchema = z.object({
  id: z.uuid(), kind: z.enum(["DELIVERY_ACTION", "LOCATION_BATCH", "DELIVERY_NOTE", "PROOF_METADATA"]), entityId: z.string(), expectedVersion: z.number().int().positive().nullable(), payload: z.record(z.string(), z.unknown()), createdAt: z.iso.datetime(), attempts: z.number().int().nonnegative(), status: z.enum(["PENDING", "SYNCING", "CONFLICT", "FAILED"]), lastError: z.string().nullable(),
});

export type DriverSession = z.infer<typeof DriverSessionSchema>;
export type DriverHome = z.infer<typeof DriverHomeSchema>;
export type DeliveryOffer = z.infer<typeof DeliveryOfferSchema>;
export type DriverDelivery = z.infer<typeof DriverDeliverySchema>;
export type OfflineEvent = z.infer<typeof OfflineEventSchema>;
export type DeliveryAction = NonNullable<DriverDelivery["nextAction"]>;

export interface DriverDataSource {
  signIn(input: { identifier: string; password: string }): Promise<DriverSession>;
  home(): Promise<DriverHome>;
  setOnline(online: boolean): Promise<DriverHome>;
  listOffers(): Promise<DeliveryOffer[]>;
  getOffer(id: string): Promise<DeliveryOffer>;
  acceptOffer(input: { offerId: string; expectedOfferVersion: number; idempotencyKey: string }): Promise<DriverDelivery>;
  rejectOffer(input: { offerId: string; expectedOfferVersion: number; reason?: string; idempotencyKey: string }): Promise<void>;
  getActiveDelivery(): Promise<DriverDelivery | null>;
  getDelivery(id: string): Promise<DriverDelivery>;
  transitionDelivery(input: { deliveryId: string; action: DeliveryAction; expectedVersion: number; offlineEventId: string; idempotencyKey: string; evidence?: Record<string, unknown> }): Promise<DriverDelivery>;
  earnings(): Promise<z.infer<typeof EarningsSchema>>;
  syncEvent(event: OfflineEvent): Promise<void>;
}
