import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { InMemoryIdempotencyRepository, IdempotencyService } from "../../common/idempotency.js";
import type { AuthenticatedPrincipal } from "../../common/auth.js";
import {
  DriverOperationsService,
  InMemoryDriverOperationsRepository,
} from "./driver.module.js";

const principal: AuthenticatedPrincipal = {
  subject: "test|driver",
  userId: "00000000-0000-4000-8000-000000000001",
  permissions: [
    "driver.delivery.offer.read",
    "driver.delivery.offer.accept",
    "driver.delivery.update",
    "driver.delivery.complete",
    "driver.cash.record",
    "driver.earnings.read",
  ],
  roles: ["driver"],
  vendorIds: [],
  authenticationMode: "development",
};

const createService = () =>
  new DriverOperationsService(
    new InMemoryDriverOperationsRepository(),
    new IdempotencyService(new InMemoryIdempotencyRepository()),
  );

describe("driver operations flow", () => {
  it("accepts an offer idempotently and completes the delivery through named transitions", async () => {
    const service = createService();
    const [offer] = await service.listOffers(principal);
    expect(offer).toBeDefined();

    const accepted = await service.acceptOffer(
      principal,
      offer!.id,
      { expectedOfferVersion: offer!.version },
      "driver-accept-key",
    );
    const replay = await service.acceptOffer(
      principal,
      offer!.id,
      { expectedOfferVersion: offer!.version },
      "driver-accept-key",
    );
    expect(replay).toEqual(accepted);
    expect(accepted).toMatchObject({ status: "DRIVER_ACCEPTED", nextAction: "TRAVELLING_TO_PICKUP" });

    let delivery = accepted;
    for (const [action, body] of [
      ["TRAVELLING_TO_PICKUP", {}],
      ["ARRIVED_AT_PICKUP", {}],
      ["VERIFY_PICKUP", { pickupCode: "1234", packageCount: 1 }],
      ["START_TRANSIT", {}],
      ["ARRIVED_AT_CUSTOMER", {}],
      ["COMPLETE", { deliveryCode: "9876", recipientName: "Ama Mensah", cashCollectedMinor: "12800" }],
    ] as const) {
      delivery = await service.transitionDelivery(
        principal,
        delivery.id,
        action,
        { expectedVersion: delivery.version, offlineEventId: randomUUID(), ...body },
        `driver-${action.toLowerCase()}-key`,
      );
    }

    expect(delivery.status).toBe("COMPLETED");
    await expect(service.home(principal)).resolves.toMatchObject({
      activeDeliveryId: null,
      todayDeliveries: 1,
      cashLiability: { amountMinor: "12800" },
    });
  });

  it("rejects conflicting idempotency payloads", async () => {
    const service = createService();
    const [offer] = await service.listOffers(principal);
    await service.rejectOffer(principal, offer!.id, { expectedOfferVersion: offer!.version }, "reject-same-key");
    await expect(
      service.rejectOffer(principal, offer!.id, { expectedOfferVersion: offer!.version, reason: "changed" }, "reject-same-key"),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_PAYLOAD_MISMATCH" });
  });
});
