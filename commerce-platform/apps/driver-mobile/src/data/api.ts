import { createCommerceClient } from "@nister/api-client";
import { z } from "zod";

import { useSessionStore } from "@/lib/session-store";
import { DeliveryOfferSchema, DriverDeliverySchema, DriverHomeSchema, EarningsSchema, type DriverDataSource } from "./types";

const client = createCommerceClient({ baseUrl: process.env.EXPO_PUBLIC_API_URL ?? "https://market-api.nister.org", getAccessToken: async () => useSessionStore.getState().session?.accessToken ?? null });
const actionPath = { TRAVELLING_TO_PICKUP: "travelling-to-pickup", ARRIVED_AT_PICKUP: "arrived-at-pickup", VERIFY_PICKUP: "verify-pickup", START_TRANSIT: "start-transit", ARRIVED_AT_CUSTOMER: "arrived-at-customer", COMPLETE: "complete" } as const;

export const apiDriverDataSource: DriverDataSource = {
  async signIn() { throw new Error("AUTH0_CONFIGURATION_REQUIRED"); },
  home: () => client.object("/api/v1/driver/home", DriverHomeSchema),
  setOnline: (online) => client.object(online ? "/api/v1/driver/shifts" : "/api/v1/driver/shifts/current/end", DriverHomeSchema, { method: "POST", body: JSON.stringify(online ? { startCheckData: {} } : {}) }),
  listOffers: () => client.object("/api/v1/driver/delivery-offers", z.array(DeliveryOfferSchema)),
  getOffer: (id) => client.object(`/api/v1/driver/delivery-offers/${encodeURIComponent(id)}`, DeliveryOfferSchema),
  acceptOffer: (input) => client.object(`/api/v1/driver/delivery-offers/${encodeURIComponent(input.offerId)}/accept`, DriverDeliverySchema, { method: "POST", body: JSON.stringify({ expectedOfferVersion: input.expectedOfferVersion }), idempotencyKey: input.idempotencyKey }),
  async rejectOffer(input) { await client.object(`/api/v1/driver/delivery-offers/${encodeURIComponent(input.offerId)}/reject`, z.object({ accepted: z.boolean() }), { method: "POST", body: JSON.stringify({ expectedOfferVersion: input.expectedOfferVersion, reason: input.reason }), idempotencyKey: input.idempotencyKey }); },
  getActiveDelivery: () => client.object("/api/v1/driver/deliveries/active", DriverDeliverySchema.nullable()),
  getDelivery: (id) => client.object(`/api/v1/driver/deliveries/${encodeURIComponent(id)}`, DriverDeliverySchema),
  transitionDelivery: (input) => client.object(`/api/v1/driver/deliveries/${encodeURIComponent(input.deliveryId)}/${actionPath[input.action]}`, DriverDeliverySchema, { method: "POST", body: JSON.stringify({ expectedVersion: input.expectedVersion, offlineEventId: input.offlineEventId, ...input.evidence }), idempotencyKey: input.idempotencyKey }),
  earnings: () => client.object("/api/v1/driver/earnings/summary", EarningsSchema),
  async syncEvent(event) { if (event.kind !== "DELIVERY_ACTION") throw new Error("OFFLINE_EVENT_ENDPOINT_NOT_IMPLEMENTED"); const payload = event.payload as { action?: keyof typeof actionPath; evidence?: Record<string, unknown>; idempotencyKey?: string }; if (!payload.action || !event.expectedVersion) throw new Error("INVALID_OFFLINE_EVENT"); await this.transitionDelivery({ deliveryId: event.entityId, action: payload.action, expectedVersion: event.expectedVersion, offlineEventId: event.id, idempotencyKey: payload.idempotencyKey ?? event.id, evidence: payload.evidence }); },
};
