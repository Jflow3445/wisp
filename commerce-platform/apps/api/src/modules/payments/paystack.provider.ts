import { Injectable } from "@nestjs/common";
import type { Money } from "@nister/money";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "../../common/errors.js";

export interface PaymentInitializationInput {
  reference: string;
  customerEmail: string;
  amount: Money;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}

export interface PaymentInitializationResult {
  provider: "paystack";
  reference: string;
  accessCode: string;
  authorizationUrl: string;
  status: "pending";
}

export interface PaymentVerificationResult {
  reference: string;
  status: "success" | "failed" | "pending" | "reversed";
  amountMinor: string;
  currency: string;
  providerPayload: Record<string, unknown>;
}

export interface PaymentProvider {
  initialize(input: PaymentInitializationInput): Promise<PaymentInitializationResult>;
  verify(reference: string): Promise<PaymentVerificationResult>;
}

const PaystackEnvelopeSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  data: z.record(z.string(), z.unknown()).nullable(),
});

@Injectable()
export class PaystackProvider implements PaymentProvider {
  constructor(
    private readonly secretKey: string | undefined,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async initialize(input: PaymentInitializationInput): Promise<PaymentInitializationResult> {
    const secretKey = this.requireCredentials();
    if (input.amount.currency !== "GHS") throw new ApiError("PAYMENT_INITIALISATION_FAILED", "Paystack requires GHS", 409);
    const amount = Number(input.amount.amountMinor);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new ApiError("PAYMENT_INITIALISATION_FAILED", "Payment amount is outside the supported range", 409);
    }

    const envelope = await this.request("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: input.customerEmail,
        amount,
        currency: input.amount.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    }, secretKey);
    const accessCode = envelope.data?.access_code;
    const authorizationUrl = envelope.data?.authorization_url;
    const reference = envelope.data?.reference;
    if (typeof accessCode !== "string" || typeof authorizationUrl !== "string" || typeof reference !== "string") {
      throw new ApiError("PAYMENT_INITIALISATION_FAILED", "Paystack returned an incomplete initialization response", 502);
    }
    return { provider: "paystack", reference, accessCode, authorizationUrl, status: "pending" };
  }

  async verify(reference: string): Promise<PaymentVerificationResult> {
    const secretKey = this.requireCredentials();
    const envelope = await this.request(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" }, secretKey);
    const data = envelope.data;
    const status = data?.status;
    const amount = data?.amount;
    const currency = data?.currency;
    const providerReference = data?.reference;
    if (
      !["success", "failed", "pending", "reversed"].includes(String(status)) ||
      (typeof amount !== "number" && typeof amount !== "string") ||
      typeof currency !== "string" ||
      typeof providerReference !== "string"
    ) {
      throw new ApiError("PROVIDER_UNAVAILABLE", "Paystack returned an invalid verification response", 502);
    }
    return {
      reference: providerReference,
      status: status as PaymentVerificationResult["status"],
      amountMinor: String(amount),
      currency,
      providerPayload: data!,
    };
  }

  private requireCredentials(): string {
    if (!this.secretKey) throw new ApiError("PROVIDER_UNAVAILABLE", "Paystack credentials are not configured", 503);
    return this.secretKey;
  }

  private async request(path: string, init: RequestInit, secretKey: string): Promise<z.infer<typeof PaystackEnvelopeSchema>> {
    let response: Response;
    try {
      response = await this.fetchImplementation(`https://api.paystack.co${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      });
    } catch {
      throw new ApiError("PROVIDER_UNAVAILABLE", "Paystack could not be reached", 503);
    }
    const parsed = PaystackEnvelopeSchema.safeParse(await response.json());
    if (!response.ok || !parsed.success || !parsed.data.status) {
      throw new ApiError("PROVIDER_UNAVAILABLE", "Paystack rejected the provider request", 502);
    }
    return parsed.data;
  }
}

export class PaystackSignatureVerifier {
  constructor(private readonly secret: string | undefined) {}

  verify(rawBody: Buffer, signature: string | undefined): boolean {
    if (!this.secret || !signature || !/^[a-f\d]{128}$/i.test(signature)) return false;
    const expected = createHmac("sha512", this.secret).update(rawBody).digest();
    const supplied = Buffer.from(signature, "hex");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }
}
