import { Body, Controller, Get, Headers, Inject, Injectable, Module, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AddCartItemSchema, type AddCartItem, type MoneyDto } from "@nister/contracts";
import { PostgresCartRepository, type Database } from "@nister/database";
import { add, money, type Money } from "@nister/money";
import { randomUUID } from "node:crypto";
import { RequirePermissions, type AuthenticatedPrincipal } from "../../common/auth.js";
import { ApiError } from "../../common/errors.js";
import { IdempotencyService, requireIdempotencyKey } from "../../common/idempotency.js";
import { moneyDto, multiplyByQuantity } from "../../common/money.js";
import { ZodValidationPipe } from "../../common/http.js";
import { CurrentPrincipal } from "../../common/principal.js";
import {
  DATABASE,
  PERSISTENCE_MODE,
  PersistenceModule,
  requireDatabase,
  type PersistenceMode,
} from "../../persistence/persistence.module.js";
import {
  CATALOGUE_REPOSITORY,
  CatalogueModule,
  type CatalogueOffer,
  type CatalogueRepository,
} from "../catalogue/catalogue.module.js";

export interface CartLine {
  id: string;
  offerId: string;
  vendorId: string;
  productName: string;
  quantity: string;
  unitPrice: Money;
  lineTotal: Money;
}

export interface Cart {
  id: string;
  buyerId: string;
  version: number;
  currency: string;
  items: CartLine[];
  total: Money;
}

export interface CartDto {
  id: string;
  version: number;
  currency: string;
  items: Array<{
    id: string;
    offerId: string;
    vendorId: string;
    productName: string;
    quantity: string;
    unitPrice: MoneyDto;
    lineTotal: MoneyDto;
  }>;
  total: MoneyDto;
}

export interface CartRepository {
  getOrCreateForBuyer(buyerId: string): Promise<Cart>;
  findByIdForBuyer(cartId: string, buyerId: string): Promise<Cart | null>;
  /** Durable adapters must deduplicate key plus payload in the same transaction as the cart mutation. */
  addItem(buyerId: string, offer: CatalogueOffer, quantity: string, idempotencyKey: string): Promise<Cart>;
}

export const CART_REPOSITORY = Symbol("CART_REPOSITORY");

function copyCart(cart: Cart): Cart {
  return { ...cart, items: cart.items.map((item) => ({ ...item })) };
}

function toCartDto(cart: Cart): CartDto {
  return {
    id: cart.id,
    version: cart.version,
    currency: cart.currency,
    items: cart.items.map((item) => ({
      id: item.id,
      offerId: item.offerId,
      vendorId: item.vendorId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: moneyDto(item.unitPrice),
      lineTotal: moneyDto(item.lineTotal),
    })),
    total: moneyDto(cart.total),
  };
}

@Injectable()
export class InMemoryCartRepository implements CartRepository {
  private readonly carts = new Map<string, Cart>();

  async getOrCreateForBuyer(buyerId: string): Promise<Cart> {
    const existing = this.carts.get(buyerId);
    if (existing) return copyCart(existing);
    const created: Cart = { id: randomUUID(), buyerId, version: 1, currency: "GHS", items: [], total: money(0n) };
    this.carts.set(buyerId, created);
    return copyCart(created);
  }

  async findByIdForBuyer(cartId: string, buyerId: string): Promise<Cart | null> {
    const cart = this.carts.get(buyerId);
    return cart?.id === cartId ? copyCart(cart) : null;
  }

  async addItem(buyerId: string, offer: CatalogueOffer, quantity: string, _idempotencyKey: string): Promise<Cart> {
    const cart = await this.getOrCreateForBuyer(buyerId);
    if (offer.stockStatus === "OUT_OF_STOCK") throw new ApiError("PRODUCT_UNAVAILABLE", "Offer is out of stock", 409);
    const lineTotal = multiplyByQuantity(offer.price, quantity);
    const updated: Cart = {
      ...cart,
      version: cart.version + 1,
      items: [...cart.items, { id: randomUUID(), offerId: offer.id, vendorId: offer.vendorId, productName: offer.productName, quantity, unitPrice: offer.price, lineTotal }],
      total: add(cart.total, lineTotal),
    };
    this.carts.set(buyerId, updated);
    return copyCart(updated);
  }
}

@Injectable()
export class CartService {
  constructor(
    @Inject(CART_REPOSITORY) private readonly carts: CartRepository,
    @Inject(CATALOGUE_REPOSITORY) private readonly catalogue: CatalogueRepository,
    private readonly idempotency: IdempotencyService,
  ) {}

  async get(principal: AuthenticatedPrincipal): Promise<CartDto> {
    return toCartDto(await this.carts.getOrCreateForBuyer(principal.userId));
  }

  async add(principal: AuthenticatedPrincipal, input: AddCartItem, idempotencyKey: string): Promise<CartDto> {
    return this.idempotency.execute(
      `buyer:${principal.userId}:cart:add-item`,
      idempotencyKey,
      input,
      async () => {
        const offer = await this.catalogue.findOfferById(input.offerId);
        if (!offer) throw ApiError.notFound("Offer not found");
        return toCartDto(await this.carts.addItem(principal.userId, offer, input.quantity, idempotencyKey));
      },
    );
  }
}

@ApiTags("Cart")
@ApiBearerAuth()
@Controller("api/v1/cart")
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @RequirePermissions("cart:read")
  @ApiOperation({ summary: "Read the current buyer cart" })
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<CartDto> {
    return this.cart.get(principal);
  }

  @Post("items")
  @RequirePermissions("cart:write")
  @ApiHeader({ name: "idempotency-key", required: true })
  @ApiOperation({ summary: "Add an offer to the current buyer cart" })
  add(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(AddCartItemSchema)) input: AddCartItem,
  ): Promise<CartDto> {
    return this.cart.add(principal, input, requireIdempotencyKey(idempotencyKey));
  }
}

@Module({
  imports: [CatalogueModule, PersistenceModule],
  controllers: [CartController],
  providers: [
    {
      provide: CART_REPOSITORY,
      inject: [PERSISTENCE_MODE, DATABASE],
      useFactory: (mode: PersistenceMode, database: Database | null): CartRepository =>
        mode === "postgres"
          ? new PostgresCartRepository(requireDatabase(database))
          : new InMemoryCartRepository(),
    },
    CartService,
  ],
  exports: [CART_REPOSITORY, CartService],
})
export class CartModule {}
