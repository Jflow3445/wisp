import type { CheckoutRepository } from "../checkout/checkout.module.js";
import { money } from "@nister/money";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryPaymentRepository, PaystackWebhookService } from "./payments.module.js";
import { PaystackSignatureVerifier } from "./paystack.provider.js";
import type { PaymentProvider } from "./paystack.provider.js";

describe("Paystack webhook flow", () => {
  it("applies a verified event once and deduplicates delivery retries", async () => {
    const checkoutId = "44444444-4444-4444-8444-444444444444";
    const buyerId = "11111111-1111-4111-8111-111111111111";
    const checkouts: CheckoutRepository = {
      createReady: async () => { throw new Error("not used"); },
      findPayableByBuyer: async () => ({
        id: checkoutId,
        buyerId,
        cartId: "55555555-5555-4555-8555-555555555555",
        cartVersion: 2,
        version: 3,
        status: "READY",
        currency: "GHS",
        total: money(10_500n),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      beginPayment: async () => ({
        id: checkoutId,
        buyerId,
        cartId: "55555555-5555-4555-8555-555555555555",
        cartVersion: 2,
        version: 4,
        status: "PAYMENT_PENDING",
        currency: "GHS",
        total: money(10_500n),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      applyPaymentOutcome: async (_id, outcome) => ({
        id: checkoutId,
        buyerId,
        cartId: "55555555-5555-4555-8555-555555555555",
        cartVersion: 2,
        version: 5,
        status: outcome === "success" ? "COMPLETED" : "READY",
        currency: "GHS",
        total: money(10_500n),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    };
    const repository = new InMemoryPaymentRepository(checkouts);
    const attempt = await repository.prepareInitialization({ buyerId, checkoutId, idempotencyKey: "payment-key" });
    await repository.recordInitialized(attempt.reference, {
      provider: "paystack",
      reference: attempt.reference,
      accessCode: "access",
      authorizationUrl: "https://checkout.paystack.com/access",
      status: "pending",
    });
    const body = Buffer.from(JSON.stringify({ event: "charge.success", data: { id: 99, reference: attempt.reference, status: "success" } }));
    const signature = createHmac("sha512", "secret").update(body).digest("hex");
    const provider: PaymentProvider = {
      initialize: async () => { throw new Error("not used"); },
      verify: async (reference) => ({
        reference,
        status: "success",
        amountMinor: "10500",
        currency: "GHS",
        providerPayload: { reference, status: "success", amount: 10_500, currency: "GHS" },
      }),
    };
    const service = new PaystackWebhookService(new PaystackSignatureVerifier("secret"), repository, provider);

    await expect(service.receive(body, signature)).resolves.toEqual({ received: true, duplicate: false, outcome: "applied" });
    await expect(service.receive(body, signature)).resolves.toEqual({ received: true, duplicate: true, outcome: "ignored" });
  });

  it("rejects an event before parsing when its signature is invalid", async () => {
    const repository = { applyVerifiedEvent: async () => ({ duplicate: false, outcome: "ignored" as const }) };
    const service = new PaystackWebhookService(
      new PaystackSignatureVerifier("secret"),
      repository as never,
      {} as PaymentProvider,
    );
    await expect(service.receive(Buffer.from("not-json"), "bad")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});
