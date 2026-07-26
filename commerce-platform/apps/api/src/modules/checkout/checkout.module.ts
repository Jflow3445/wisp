import { Body, Controller, Headers, Inject, Injectable, Module, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CreateCheckoutSchema, type CheckoutStatus, type CreateCheckout, type MoneyDto } from "@nister/contracts";
import { PostgresCheckoutRepository, type Database } from "@nister/database";
import type { Money } from "@nister/money";
import { checkoutMachine } from "@nister/state-machines";
import { randomUUID } from "node:crypto";
import { RequirePermissions, type AuthenticatedPrincipal } from "../../common/auth.js";
import { ApiError } from "../../common/errors.js";
import { ZodValidationPipe } from "../../common/http.js";
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
import { CART_REPOSITORY, CartModule, type Cart, type CartRepository } from "../cart/cart.module.js";

export interface CheckoutRecord {
  id: string;
  buyerId: string;
  cartId: string;
  cartVersion: number;
  version: number;
  status: CheckoutStatus;
  currency: string;
  total: Money;
  expiresAt: string;
}

export interface CheckoutDto {
  id: string;
  cartId: string;
  cartVersion: number;
  version: number;
  status: CheckoutStatus;
  currency: string;
  total: MoneyDto;
  expiresAt: string;
}

export interface CheckoutRepository {
  /** Implementations must re-read the cart, reserve inventory and create READY atomically. */
  createReady(input: { buyerId: string; cartId: string; expectedCartVersion: number; currency: string; idempotencyKey: string }): Promise<CheckoutRecord>;
  findPayableByBuyer(checkoutId: string, buyerId: string): Promise<CheckoutRecord | null>;
  beginPayment(checkoutId: string, buyerId: string): Promise<CheckoutRecord>;
  applyPaymentOutcome(checkoutId: string, outcome: "success" | "failure"): Promise<CheckoutRecord>;
}

export const CHECKOUT_REPOSITORY = Symbol("CHECKOUT_REPOSITORY");

function checkoutDto(checkout: CheckoutRecord): CheckoutDto {
  return { ...checkout, total: moneyDto(checkout.total) };
}

@Injectable()
export class InMemoryCheckoutRepository implements CheckoutRepository {
  private readonly checkouts = new Map<string, CheckoutRecord>();
  private readonly operationCheckouts = new Map<string, { cartId: string; cartVersion: number; checkoutId: string }>();

  constructor(@Inject(CART_REPOSITORY) private readonly carts: CartRepository) {}

  async createReady(input: {
    buyerId: string;
    cartId: string;
    expectedCartVersion: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<CheckoutRecord> {
    const operationKey = `${input.buyerId}:${input.idempotencyKey}`;
    const previous = this.operationCheckouts.get(operationKey);
    if (previous) {
      if (previous.cartId !== input.cartId || previous.cartVersion !== input.expectedCartVersion) {
        throw new ApiError("IDEMPOTENCY_PAYLOAD_MISMATCH", "Checkout key was used for another cart version", 409);
      }
      return { ...this.checkouts.get(previous.checkoutId)! };
    }
    const cart = await this.carts.findByIdForBuyer(input.cartId, input.buyerId);
    this.assertCheckoutCart(cart, input.expectedCartVersion, input.currency);
    const validating = checkoutMachine.transition({ currentState: "CREATED", action: "BEGIN_VALIDATION" });
    const ready = checkoutMachine.transition({ currentState: validating, action: "PASS_VALIDATION" });
    const checkout: CheckoutRecord = {
      id: randomUUID(),
      buyerId: input.buyerId,
      cartId: input.cartId,
      cartVersion: input.expectedCartVersion,
      version: 3,
      status: ready,
      currency: input.currency,
      total: cart!.total,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    this.checkouts.set(checkout.id, checkout);
    this.operationCheckouts.set(operationKey, { cartId: input.cartId, cartVersion: input.expectedCartVersion, checkoutId: checkout.id });
    return { ...checkout };
  }

  async findPayableByBuyer(checkoutId: string, buyerId: string): Promise<CheckoutRecord | null> {
    const checkout = this.checkouts.get(checkoutId);
    return checkout?.buyerId === buyerId && checkout.status === "READY" ? { ...checkout } : null;
  }

  async beginPayment(checkoutId: string, buyerId: string): Promise<CheckoutRecord> {
    const checkout = this.checkouts.get(checkoutId);
    if (!checkout || checkout.buyerId !== buyerId || checkout.status !== "READY") {
      throw new ApiError("PAYMENT_ALREADY_COMPLETED", "Checkout is not ready for payment", 409);
    }
    const updated = {
      ...checkout,
      status: checkoutMachine.transition({ currentState: checkout.status, action: "START_PAYMENT" }),
      version: checkout.version + 1,
    };
    this.checkouts.set(checkoutId, updated);
    return { ...updated };
  }

  async applyPaymentOutcome(checkoutId: string, outcome: "success" | "failure"): Promise<CheckoutRecord> {
    const checkout = this.checkouts.get(checkoutId);
    if (!checkout) throw ApiError.notFound("Checkout not found");
    const status = checkoutMachine.transition({
      currentState: checkout.status,
      action: outcome === "success" ? "PAYMENT_SUCCESS" : "PAYMENT_FAILED",
      reason: outcome === "failure" ? "Provider reported payment failure" : undefined,
    });
    const updated = { ...checkout, status, version: checkout.version + 1 };
    this.checkouts.set(checkoutId, updated);
    return { ...updated };
  }

  private assertCheckoutCart(cart: Cart | null, expectedVersion: number, currency: string): asserts cart is Cart {
    if (!cart) throw ApiError.notFound("Cart not found");
    if (cart.version !== expectedVersion) {
      throw new ApiError("CART_CHANGED", "The cart changed after checkout was requested", 409, undefined, {
        expectedVersion,
        actualVersion: cart.version,
      });
    }
    if (cart.items.length === 0) throw new ApiError("CART_CHANGED", "An empty cart cannot be checked out", 409);
    if (cart.currency !== currency) throw new ApiError("PRICE_CHANGED", "Cart currency does not match checkout", 409);
  }
}

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(CHECKOUT_REPOSITORY) private readonly repository: CheckoutRepository,
    private readonly idempotency: IdempotencyService,
  ) {}

  create(principal: AuthenticatedPrincipal, input: CreateCheckout, idempotencyKey: string): Promise<CheckoutDto> {
    return this.idempotency.execute(
      `buyer:${principal.userId}:checkout:create`,
      idempotencyKey,
      input,
      async () => checkoutDto(await this.repository.createReady({
        buyerId: principal.userId,
        cartId: input.cartId,
        expectedCartVersion: input.cartVersion,
        currency: input.currency,
        idempotencyKey,
      })),
    );
  }
}

@ApiTags("Checkout")
@ApiBearerAuth()
@Controller("api/v1/checkouts")
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post()
  @RequirePermissions("checkout:create")
  @ApiHeader({ name: "idempotency-key", required: true })
  @ApiOperation({ summary: "Validate a cart, reserve inventory and create a checkout" })
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(CreateCheckoutSchema)) input: CreateCheckout,
  ): Promise<CheckoutDto> {
    return this.checkout.create(principal, input, requireIdempotencyKey(idempotencyKey));
  }
}

@Module({
  imports: [CartModule, PersistenceModule],
  controllers: [CheckoutController],
  providers: [
    {
      provide: CHECKOUT_REPOSITORY,
      inject: [PERSISTENCE_MODE, DATABASE, CART_REPOSITORY],
      useFactory: (
        mode: PersistenceMode,
        database: Database | null,
        carts: CartRepository,
      ): CheckoutRepository =>
        mode === "postgres"
          ? new PostgresCheckoutRepository(requireDatabase(database))
          : new InMemoryCheckoutRepository(carts),
    },
    CheckoutService,
  ],
  exports: [CHECKOUT_REPOSITORY, CheckoutService],
})
export class CheckoutModule {}
