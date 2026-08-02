import { DeliveryOfferSchema, DriverDeliverySchema, DriverHomeSchema, DriverSessionSchema, EarningsSchema, type DeliveryAction, type DeliveryOffer, type DriverDataSource, type DriverDelivery, type DriverHome } from "./types";

const now = Date.now();
const money = (amountMinor: string) => ({ amountMinor, currency: "GHS" as const, formatted: `GH\u20b5 ${(Number(amountMinor) / 100).toFixed(2)}` });
let home: DriverHome = DriverHomeSchema.parse({ driverStatus: "ACTIVE", onlineStatus: "OFFLINE", currentShiftId: null, currentVehicle: "Motorbike · GT 4821-24", currentZone: "Accra Central", activeDeliveryId: null, cashLiability: money("18600"), todayEarnings: money("7420"), todayDeliveries: 4, eligibilityBlocks: [], alerts: ["Vehicle inspection expires in 21 days"] });
let offers: DeliveryOffer[] = [DeliveryOfferSchema.parse({ id: "8aa321cd-762b-4cf7-8ca2-b4b0331662ad", version: 1, expiresAt: new Date(now + 12 * 60_000).toISOString(), pickupArea: "Osu", dropoffArea: "Labone", estimatedDistanceKm: 5.4, estimatedDurationMinutes: 26, packageSize: "2 medium bags", vehicleRequirement: "Motorbike or car", expectedEarnings: money("1850"), cashOnDelivery: money("12800"), pickupCount: 1, dropoffCount: 1 })];
let active: DriverDelivery | null = null;
const pause = () => new Promise((resolve) => setTimeout(resolve, 140));

function currentDelivery(): DriverDelivery { if (!active) throw new Error("Delivery not found"); return active; }
const progression: Record<DeliveryAction, { from: DriverDelivery["status"]; to: DriverDelivery["status"]; next: DeliveryAction | null }> = {
  TRAVELLING_TO_PICKUP: { from: "DRIVER_ACCEPTED", to: "TRAVELLING_TO_PICKUP", next: "ARRIVED_AT_PICKUP" },
  ARRIVED_AT_PICKUP: { from: "TRAVELLING_TO_PICKUP", to: "ARRIVED_AT_PICKUP", next: "VERIFY_PICKUP" },
  VERIFY_PICKUP: { from: "ARRIVED_AT_PICKUP", to: "PICKUP_VERIFIED", next: "START_TRANSIT" },
  START_TRANSIT: { from: "PICKUP_VERIFIED", to: "IN_TRANSIT", next: "ARRIVED_AT_CUSTOMER" },
  ARRIVED_AT_CUSTOMER: { from: "IN_TRANSIT", to: "ARRIVED_AT_CUSTOMER", next: "COMPLETE" },
  COMPLETE: { from: "ARRIVED_AT_CUSTOMER", to: "COMPLETED", next: null },
};

export const demoDriverDataSource: DriverDataSource = {
  async signIn() { await pause(); return DriverSessionSchema.parse({ accessToken: "demo-driver-token", displayName: "Ama Boateng", email: "driver@example.com" }); },
  async home() { await pause(); return home; },
  async setOnline(online) { await pause(); if (online && home.eligibilityBlocks.length) throw new Error("DRIVER_NOT_ELIGIBLE"); home = DriverHomeSchema.parse({ ...home, onlineStatus: online ? "ONLINE" : "OFFLINE", currentShiftId: online ? home.currentShiftId ?? "demo-shift" : null }); return home; },
  async listOffers() { await pause(); return offers; },
  async getOffer(id) { await pause(); const offer = offers.find((value) => value.id === id); if (!offer) throw new Error("Offer not found"); return offer; },
  async acceptOffer(input) { await pause(); const offer = offers.find((value) => value.id === input.offerId); if (!offer) throw new Error("DELIVERY_OFFER_EXPIRED"); if (offer.version !== input.expectedOfferVersion) throw new Error("VERSION_CONFLICT"); active = DriverDeliverySchema.parse({ id: "650b0bf6-3291-4640-a674-80d32006248e", reference: "DEL-20481", status: "DRIVER_ACCEPTED", version: 1, nextAction: "TRAVELLING_TO_PICKUP", pickupCodeRequired: true, deliveryCodeRequired: true, cashExpected: offer.cashOnDelivery, earnings: offer.expectedEarnings, stops: [{ id: "pickup-1", kind: "PICKUP", name: "Makola Foods · Osu", area: offer.pickupArea, address: "Oxford Street, Osu", instructions: "Use the collection desk and provide the pickup code.", packageCount: 2, complete: false }, { id: "dropoff-1", kind: "DROPOFF", name: "Customer", area: offer.dropoffArea, address: "Full address available after pickup verification", instructions: "Call on arrival.", packageCount: 2, complete: false }] }); offers = offers.filter((value) => value.id !== input.offerId); home = DriverHomeSchema.parse({ ...home, activeDeliveryId: active.id }); return active; },
  async rejectOffer(input) { await pause(); const offer = offers.find((value) => value.id === input.offerId); if (!offer || offer.version !== input.expectedOfferVersion) throw new Error("DELIVERY_OFFER_EXPIRED"); offers = offers.filter((value) => value.id !== input.offerId); },
  async getActiveDelivery() { await pause(); return active; },
  async getDelivery(id) { await pause(); const delivery = currentDelivery(); if (delivery.id !== id) throw new Error("Delivery not found"); return delivery; },
  async transitionDelivery(input) {
    await pause(); const delivery = currentDelivery(); if (delivery.id !== input.deliveryId) throw new Error("Delivery not found"); if (delivery.version !== input.expectedVersion) throw new Error("VERSION_CONFLICT"); const step = progression[input.action]; if (step.from !== delivery.status) throw new Error("INVALID_STATE_TRANSITION");
    if (input.action === "VERIFY_PICKUP" && (!input.evidence?.pickupCode || !input.evidence?.packageCount)) throw new Error("DELIVERY_VERIFICATION_FAILED");
    if (input.action === "COMPLETE" && (!input.evidence?.deliveryCode || (delivery.cashExpected && !input.evidence?.cashCollectedMinor))) throw new Error("DELIVERY_VERIFICATION_FAILED");
    const stops = delivery.stops.map((stop) => input.action === "VERIFY_PICKUP" && stop.kind === "PICKUP" ? { ...stop, complete: true } : input.action === "COMPLETE" && stop.kind === "DROPOFF" ? { ...stop, complete: true } : stop);
    active = DriverDeliverySchema.parse({ ...delivery, status: step.to, nextAction: step.next, version: delivery.version + 1, stops });
    if (step.to === "COMPLETED") home = DriverHomeSchema.parse({ ...home, activeDeliveryId: null, todayDeliveries: home.todayDeliveries + 1, todayEarnings: money(String(Number(home.todayEarnings.amountMinor) + Number(delivery.earnings.amountMinor))), cashLiability: delivery.cashExpected ? money(String(Number(home.cashLiability.amountMinor) + Number(delivery.cashExpected.amountMinor))) : home.cashLiability });
    return active;
  },
  async earnings() { await pause(); return EarningsSchema.parse({ today: home.todayEarnings, thisWeek: money("38450"), pending: money("12400"), available: money("26050"), paid: money("84900"), bonuses: money("2500"), adjustments: money("-500"), cashLiability: home.cashLiability, transactions: [{ id: "txn-1", reference: "DEL-20472", kind: "DELIVERY", amount: money("1850"), status: "EARNED", occurredAt: new Date(now - 45 * 60_000).toISOString() }, { id: "txn-2", reference: "PAY-3018", kind: "PAYOUT", amount: money("15200"), status: "PAID", occurredAt: new Date(now - 2 * 24 * 60 * 60_000).toISOString() }] }); },
  async syncEvent() { await pause(); },
};
