import {
  Controller,
  Headers,
  Inject,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { PaymentStatus } from "@nister/contracts";
import { PostgresPaymentRepository, type Database } from "@nister/database";
import { paymentMachine, type PaymentAction } from "@nister/state-machines";
import type { FastifyRequest } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Public, RequirePermissions, type AuthenticatedPrincipal } from "../../common/auth.js";
import { ApiError } from "../../common/errors.js";
import { IdempotencyService, requireIdempotencyKey } from "../../common/idempotency.js";
import { CurrentPrincipal } from "../../common/principal.js";
import {
  DATABASE,
  PERSISTENCE_MODE,
  PersistenceModule,
  requireDatabase,
  type PersistenceMode,
} from "../../persistence/persistence.module.js";
import {
  CHECKOUT_REPOSITORY,
  CheckoutModule,
  type CheckoutRecord,
  type CheckoutRepository,
} from "../checkout/checkout.module.js";
import {
  PaystackProvider,
  PaystackSignatureVerifier,
  type PaymentInitializationResult,
  type PaymentProvider,
} from "./paystack.provider.js";

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
export const PAYSTACK_SIGNATURE_VERIFIER = Symbol("PAYSTACK_SIGNATURE_VERIFIER");
export const PAYMENT_REPOSITORY = Symbol("PAYMENT_REPOSITORY");

interface PaymentAttempt {
  id: string;
  checkoutId: string;
  buyerId: string;
  reference: string;
  status: PaymentStatus;
  version: number;
  amount: CheckoutRecord["total"];
  currency: string;
}

export interface VerifiedPaymentEvent {
  eventId: string;
  eventType: string;
  reference: string;
  action: PaymentAction | null;
  reason?: string;
  amountMinor?: string;
  currency?: string;
  evidence: Record<string, unknown>;
  providerPayload: Record<string, unknown>;
}

export interface PaymentEventResult {
  duplicate: boolean;
  outcome: "applied" | "unmatched" | "ignored";
}

export interface PaymentRepository {
  /** Reuse the reference and transition checkout to PAYMENT_PENDING in one transaction. */
  prepareInitialization(input: { buyerId: string; checkoutId: string; idempotencyKey: string }): Promise<PaymentAttempt>;
  recordInitialized(reference: string, result: PaymentInitializationResult): Promise<PaymentAttempt>;
  /** Insert the provider event, transition payment, audit and enqueue effects in one transaction. */
  applyVerifiedEvent(event: VerifiedPaymentEvent): Promise<PaymentEventResult>;
}

@Injectable()
export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly attempts = new Map<string, PaymentAttempt>();
  private readonly operationReferences = new Map<string, string>();
  private readonly eventIds = new Set<string>();

  constructor(@Inject(CHECKOUT_REPOSITORY) private readonly checkouts: CheckoutRepository) {}

  async prepareInitialization(input: {
    buyerId: string;
    checkoutId: string;
    idempotencyKey: string;
  }): Promise<PaymentAttempt> {
    const operation = `${input.buyerId}:${input.checkoutId}:${input.idempotencyKey}`;
    const existingReference = this.operationReferences.get(operation);
    if (existingReference) return { ...this.attempts.get(existingReference)! };
    const checkout = await this.checkouts.beginPayment(input.checkoutId, input.buyerId);
    const attempt: PaymentAttempt = {
      id: randomUUID(),
      checkoutId: checkout.id,
      buyerId: input.buyerId,
      reference: `nister_${randomUUID().replaceAll("-", "")}`,
      status: "CREATED",
      version: 1,
      amount: checkout.total,
      currency: checkout.currency,
    };
    this.operationReferences.set(operation, attempt.reference);
    this.attempts.set(attempt.reference, attempt);
    return { ...attempt };
  }

  async recordInitialized(reference: string, result: PaymentInitializationResult): Promise<PaymentAttempt> {
    const attempt = this.attempts.get(reference);
    if (!attempt) throw ApiError.notFound("Payment attempt not found");
    if (result.reference !== reference) {
      throw new ApiError("PAYMENT_RECONCILIATION_REQUIRED", "Provider reference did not match the prepared payment", 409);
    }
    let status = attempt.status;
    if (status === "CREATED") status = paymentMachine.transition({ currentState: status, action: "INITIALISE" });
    if (status === "INITIALISED") status = paymentMachine.transition({ currentState: status, action: "MARK_PENDING" });
    const updated = { ...attempt, status, version: attempt.version + 2 };
    this.attempts.set(reference, updated);
    return { ...updated };
  }

  async applyVerifiedEvent(event: VerifiedPaymentEvent): Promise<PaymentEventResult> {
    if (this.eventIds.has(event.eventId)) return { duplicate: true, outcome: "ignored" };
    if (!event.action) {
      this.eventIds.add(event.eventId);
      return { duplicate: false, outcome: "ignored" };
    }
    const attempt = this.attempts.get(event.reference);
    if (!attempt) {
      this.eventIds.add(event.eventId);
      return { duplicate: false, outcome: "unmatched" };
    }
    if (
      event.action === "CONFIRM_SUCCESS" &&
      (event.amountMinor !== attempt.amount.amountMinor.toString() || event.currency !== attempt.currency)
    ) {
      throw new ApiError(
        "PAYMENT_RECONCILIATION_REQUIRED",
        "Verified payment amount or currency did not match the checkout",
        409,
      );
    }
    const status = paymentMachine.transition({
      currentState: attempt.status,
      action: event.action,
      reason: event.reason,
      evidence: event.evidence,
    });
    if (event.action === "CONFIRM_SUCCESS") await this.checkouts.applyPaymentOutcome(attempt.checkoutId, "success");
    if (event.action === "FAIL") await this.checkouts.applyPaymentOutcome(attempt.checkoutId, "failure");
    this.attempts.set(event.reference, { ...attempt, status, version: attempt.version + 1 });
    this.eventIds.add(event.eventId);
    return { duplicate: false, outcome: "applied" };
  }
}

@Injectable()
export class PaymentService {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  initialize(
    principal: AuthenticatedPrincipal,
    checkoutId: string,
    idempotencyKey: string,
  ): Promise<PaymentInitializationResult> {
    if (!principal.email) throw new ApiError("VALIDATION_FAILED", "An email address is required for payment", 400);
    return this.idempotency.execute(
      `buyer:${principal.userId}:checkout:${checkoutId}:paystack`,
      idempotencyKey,
      { checkoutId },
      async () => {
        const attempt = await this.payments.prepareInitialization({
          buyerId: principal.userId,
          checkoutId,
          idempotencyKey,
        });
        const initialized = await this.provider.initialize({
          reference: attempt.reference,
          customerEmail: principal.email!,
          amount: attempt.amount,
          callbackUrl: `${this.config.getOrThrow<string>("STOREFRONT_ORIGIN")}/payment/callback`,
          metadata: { checkoutId, paymentId: attempt.id },
        });
        await this.payments.recordInitialized(attempt.reference, initialized);
        return initialized;
      },
    );
  }
}

const PaystackWebhookSchema = z.object({
  event: z.string().min(1),
  data: z.object({
    id: z.union([z.string(), z.number()]).optional(),
    reference: z.string().min(1),
    status: z.string().optional(),
  }).loose(),
}).loose();

type PaystackWebhook = z.infer<typeof PaystackWebhookSchema>;

function eventAction(event: PaystackWebhook): { action: PaymentAction | null; reason?: string } {
  if (event.event === "charge.success" || event.data.status === "success") return { action: "CONFIRM_SUCCESS" };
  if (event.event === "charge.failed" || event.data.status === "failed") return { action: "FAIL", reason: "Provider reported failure" };
  if (event.event === "charge.reversed" || event.data.status === "reversed") return { action: "REVERSE", reason: "Provider reported reversal" };
  return { action: null };
}

@Injectable()
export class PaystackWebhookService {
  constructor(
    @Inject(PAYSTACK_SIGNATURE_VERIFIER) private readonly signatures: PaystackSignatureVerifier,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async receive(rawBody: Buffer, signature: string | undefined): Promise<{ received: true } & PaymentEventResult> {
    if (!this.signatures.verify(rawBody, signature)) throw ApiError.permission("Paystack webhook signature is invalid");
    let decoded: unknown;
    try {
      decoded = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new ApiError("VALIDATION_FAILED", "Webhook body is not valid JSON", 400);
    }
    const parsed = PaystackWebhookSchema.safeParse(decoded);
    if (!parsed.success) throw ApiError.validation(parsed.error);
    const event = parsed.data;
    const providerIdentity = event.data.id === undefined
      ? createHash("sha256").update(rawBody).digest("hex")
      : String(event.data.id);
    let transition = eventAction(event);
    let amountMinor: string | undefined;
    let currency: string | undefined;
    let providerPayload: Record<string, unknown> = event as Record<string, unknown>;
    const evidence: Record<string, unknown> = { providerEventId: providerIdentity, verifiedSignature: true };
    if (transition.action) {
      const verification = await this.provider.verify(event.data.reference);
      if (verification.reference !== event.data.reference) {
        throw new ApiError(
          "PAYMENT_RECONCILIATION_REQUIRED",
          "Paystack verification returned another payment reference",
          409,
        );
      }
      transition = verification.status === "success"
        ? { action: "CONFIRM_SUCCESS" }
        : verification.status === "failed"
          ? { action: "FAIL", reason: "Provider verification reported failure" }
          : verification.status === "reversed"
            ? { action: "REVERSE", reason: "Provider verification reported reversal" }
            : { action: null };
      amountMinor = verification.amountMinor;
      currency = verification.currency;
      evidence.verifiedProviderStatus = verification.status;
      providerPayload = { webhook: event, verification: verification.providerPayload };
    }
    const result = await this.payments.applyVerifiedEvent({
      eventId: `paystack:${event.event}:${providerIdentity}`,
      eventType: event.event,
      reference: event.data.reference,
      action: transition.action,
      reason: transition.reason,
      amountMinor,
      currency,
      evidence,
      providerPayload,
    });
    return { received: true, ...result };
  }
}

@ApiTags("Payments")
@Controller()
export class PaymentsController {
  constructor(
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(PaystackWebhookService) private readonly webhooks: PaystackWebhookService,
  ) {}

  @Post("api/v1/checkouts/:checkoutId/payments/paystack")
  @ApiBearerAuth()
  @RequirePermissions("checkout:pay")
  @ApiHeader({ name: "idempotency-key", required: true })
  @ApiOperation({ summary: "Initialize Paystack for a ready checkout" })
  initialize(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("checkoutId", ParseUUIDPipe) checkoutId: string,
    @Headers("idempotency-key") idempotencyKey: unknown,
  ): Promise<PaymentInitializationResult> {
    return this.payments.initialize(principal, checkoutId, requireIdempotencyKey(idempotencyKey));
  }

  @Post("webhooks/v1/payments/paystack")
  @Public()
  @ApiOperation({ summary: "Receive a signature-verified Paystack event" })
  webhook(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers("x-paystack-signature") signature: string | undefined,
  ): Promise<{ received: true } & PaymentEventResult> {
    if (!request.rawBody) throw new ApiError("VALIDATION_FAILED", "Raw webhook body is unavailable", 400);
    return this.webhooks.receive(request.rawBody, signature);
  }
}

@Module({
  imports: [CheckoutModule, PersistenceModule],
  controllers: [PaymentsController],
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentProvider => new PaystackProvider(config.get<string>("PAYSTACK_SECRET_KEY")),
    },
    {
      provide: PAYSTACK_SIGNATURE_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaystackSignatureVerifier =>
        new PaystackSignatureVerifier(config.get<string>("PAYSTACK_WEBHOOK_SECRET") ?? config.get<string>("PAYSTACK_SECRET_KEY")),
    },
    {
      provide: PAYMENT_REPOSITORY,
      inject: [PERSISTENCE_MODE, DATABASE, CHECKOUT_REPOSITORY],
      useFactory: (
        mode: PersistenceMode,
        database: Database | null,
        checkouts: CheckoutRepository,
      ): PaymentRepository =>
        mode === "postgres"
          ? new PostgresPaymentRepository(requireDatabase(database))
          : new InMemoryPaymentRepository(checkouts),
    },
    PaymentService,
    PaystackWebhookService,
  ],
  exports: [PAYMENT_PROVIDER, PAYMENT_REPOSITORY, PaystackWebhookService],
})
export class PaymentsModule {}
