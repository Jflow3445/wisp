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
import { CursorPaginationSchema, type VendorOrderStatus } from "@nister/contracts";
import { PostgresVendorOperationsRepository, type Database } from "@nister/database";
import { vendorOrderMachine, type VendorOrderAction } from "@nister/state-machines";
import { z } from "zod";
import { RequirePermissions, VendorScoped, type AuthenticatedPrincipal } from "../../common/auth.js";
import { addDecimals } from "../../common/decimal.js";
import { ApiError } from "../../common/errors.js";
import { ListEnvelope, type PageResult, ZodValidationPipe } from "../../common/http.js";
import { IdempotencyService, requireIdempotencyKey } from "../../common/idempotency.js";
import { CurrentPrincipal } from "../../common/principal.js";
import {
  DATABASE,
  PERSISTENCE_MODE,
  PersistenceModule,
  requireDatabase,
  type PersistenceMode,
} from "../../persistence/persistence.module.js";

const VendorOrderTransitionSchema = z.object({
  action: z.enum([
    "ACCEPT",
    "REJECT",
    "START_PREPARATION",
    "MARK_READY",
    "HAND_OVER",
    "START_DELIVERY",
    "COMPLETE_DELIVERY",
    "CANCEL",
    "REQUEST_RETURN",
    "RECEIVE_RETURN",
    "PARTIAL_REFUND",
    "FULL_REFUND",
  ]),
  expectedVersion: z.number().int().positive(),
  reason: z.string().min(1).max(2_000).nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).nullable().optional(),
});

const InventoryAdjustmentSchema = z.object({
  expectedVersion: z.number().int().positive(),
  delta: z.string().regex(/^-?\d+(\.\d{1,6})?$/).refine((value) => !/^[-]?0(?:\.0+)?$/.test(value), "Delta cannot be zero"),
  reason: z.string().min(3).max(500),
});

export type VendorOrderTransition = z.infer<typeof VendorOrderTransitionSchema>;
export type InventoryAdjustment = z.infer<typeof InventoryAdjustmentSchema>;

export interface VendorOrderSummary {
  id: string;
  publicReference: string;
  status: VendorOrderStatus;
  version: number;
  itemCount: number;
  totalAmountMinor: string;
  currency: string;
}

export interface InventoryItem {
  offerId: string;
  productName: string;
  availableQuantity: string;
  reservedQuantity: string;
  version: number;
}

export interface VendorOperationsRepository {
  listOrders(vendorId: string, query: { cursor?: string; limit: number }): Promise<PageResult<VendorOrderSummary>>;
  findOrder(vendorId: string, orderId: string): Promise<VendorOrderSummary | null>;
  /** Compare-and-set state and version in the same transaction as audit/outbox writes. */
  transitionOrder(input: {
    vendorId: string;
    orderId: string;
    expectedVersion: number;
    expectedState: VendorOrderStatus;
    newState: VendorOrderStatus;
    actorUserId: string;
    reason?: string | null;
    evidence?: Record<string, unknown> | null;
    idempotencyKey: string;
  }): Promise<VendorOrderSummary>;
  listInventory(vendorId: string): Promise<InventoryItem[]>;
  /** Persist an immutable movement and update the stock projection atomically. */
  adjustInventory(input: {
    vendorId: string;
    offerId: string;
    expectedVersion: number;
    delta: string;
    reason: string;
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<InventoryItem>;
}

export const VENDOR_OPERATIONS_REPOSITORY = Symbol("VENDOR_OPERATIONS_REPOSITORY");

@Injectable()
export class InMemoryVendorOperationsRepository implements VendorOperationsRepository {
  private readonly orders = new Map<string, VendorOrderSummary>();
  private readonly inventory = new Map<string, InventoryItem>();

  async listOrders(vendorId: string, query: { cursor?: string; limit: number }): Promise<PageResult<VendorOrderSummary>> {
    const all = [...this.orders.entries()].filter(([key]) => key.startsWith(`${vendorId}:`)).map(([, order]) => order);
    const items = all.slice(0, query.limit).map((order) => ({ ...order }));
    return { items, pagination: { nextCursor: null, hasMore: false, limit: query.limit } };
  }

  async findOrder(vendorId: string, orderId: string): Promise<VendorOrderSummary | null> {
    const order = this.orders.get(`${vendorId}:${orderId}`);
    return order ? { ...order } : null;
  }

  async transitionOrder(input: {
    vendorId: string;
    orderId: string;
    expectedVersion: number;
    expectedState: VendorOrderStatus;
    newState: VendorOrderStatus;
  }): Promise<VendorOrderSummary> {
    const key = `${input.vendorId}:${input.orderId}`;
    const order = this.orders.get(key);
    if (!order) throw ApiError.notFound("Vendor order not found");
    if (order.version !== input.expectedVersion || order.status !== input.expectedState) {
      throw new ApiError("VERSION_CONFLICT", "Vendor order changed before the transition was applied", 409);
    }
    const updated = { ...order, status: input.newState, version: order.version + 1 };
    this.orders.set(key, updated);
    return { ...updated };
  }

  async listInventory(vendorId: string): Promise<InventoryItem[]> {
    return [...this.inventory.entries()]
      .filter(([key]) => key.startsWith(`${vendorId}:`))
      .map(([, item]) => ({ ...item }));
  }

  async adjustInventory(input: {
    vendorId: string;
    offerId: string;
    expectedVersion: number;
    delta: string;
  }): Promise<InventoryItem> {
    const key = `${input.vendorId}:${input.offerId}`;
    const item = this.inventory.get(key);
    if (!item) throw ApiError.notFound("Inventory offer not found");
    if (item.version !== input.expectedVersion) throw new ApiError("VERSION_CONFLICT", "Inventory changed", 409);
    const nextQuantity = addDecimals(item.availableQuantity, input.delta);
    if (nextQuantity.startsWith("-")) throw new ApiError("INSUFFICIENT_STOCK", "Adjustment would make stock negative", 409);
    const updated = { ...item, availableQuantity: nextQuantity, version: item.version + 1 };
    this.inventory.set(key, updated);
    return { ...updated };
  }
}

@Injectable()
export class VendorOperationsService {
  constructor(
    @Inject(VENDOR_OPERATIONS_REPOSITORY) private readonly repository: VendorOperationsRepository,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  listOrders(vendorId: string, query: unknown): Promise<PageResult<VendorOrderSummary>> {
    return this.repository.listOrders(vendorId, CursorPaginationSchema.parse(query));
  }

  async transitionOrder(
    principal: AuthenticatedPrincipal,
    vendorId: string,
    orderId: string,
    command: VendorOrderTransition,
    idempotencyKey: string,
  ): Promise<VendorOrderSummary> {
    return this.idempotency.execute(`vendor:${vendorId}:order:${orderId}:transition`, idempotencyKey, command, async () => {
      const current = await this.repository.findOrder(vendorId, orderId);
      if (!current) throw ApiError.notFound("Vendor order not found");
      if (current.version !== command.expectedVersion) throw new ApiError("VERSION_CONFLICT", "Vendor order changed", 409);
      const newState = vendorOrderMachine.transition({
        currentState: current.status,
        action: command.action as VendorOrderAction,
        reason: command.reason,
        evidence: command.evidence,
      });
      return this.repository.transitionOrder({
        vendorId,
        orderId,
        expectedVersion: command.expectedVersion,
        expectedState: current.status,
        newState,
        actorUserId: principal.userId,
        reason: command.reason,
        evidence: command.evidence,
        idempotencyKey,
      });
    });
  }

  listInventory(vendorId: string): Promise<InventoryItem[]> {
    return this.repository.listInventory(vendorId);
  }

  adjustInventory(
    principal: AuthenticatedPrincipal,
    vendorId: string,
    offerId: string,
    adjustment: InventoryAdjustment,
    idempotencyKey: string,
  ): Promise<InventoryItem> {
    return this.idempotency.execute(`vendor:${vendorId}:inventory:${offerId}:adjust`, idempotencyKey, adjustment, () =>
      this.repository.adjustInventory({ vendorId, offerId, actorUserId: principal.userId, idempotencyKey, ...adjustment }),
    );
  }
}

@ApiTags("Vendor operations")
@ApiBearerAuth()
@VendorScoped()
@Controller("api/v1/vendors/:vendorId")
export class VendorOperationsController {
  constructor(@Inject(VendorOperationsService) private readonly operations: VendorOperationsService) {}

  @Get("orders")
  @ListEnvelope()
  @RequirePermissions("vendor:orders:read")
  @ApiOperation({ summary: "List orders belonging to the scoped vendor" })
  orders(
    @Param("vendorId", ParseUUIDPipe) vendorId: string,
    @Query(new ZodValidationPipe(CursorPaginationSchema)) query: unknown,
  ): Promise<PageResult<VendorOrderSummary>> {
    return this.operations.listOrders(vendorId, query);
  }

  @Post("orders/:orderId/transitions")
  @RequirePermissions("vendor:orders:write")
  @ApiHeader({ name: "idempotency-key", required: true })
  @ApiOperation({ summary: "Apply a named vendor-order transition" })
  transitionOrder(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("vendorId", ParseUUIDPipe) vendorId: string,
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(VendorOrderTransitionSchema)) command: VendorOrderTransition,
  ): Promise<VendorOrderSummary> {
    return this.operations.transitionOrder(principal, vendorId, orderId, command, requireIdempotencyKey(idempotencyKey));
  }

  @Get("inventory")
  @RequirePermissions("vendor:inventory:read")
  @ApiOperation({ summary: "List the vendor inventory projection" })
  inventory(@Param("vendorId", ParseUUIDPipe) vendorId: string): Promise<InventoryItem[]> {
    return this.operations.listInventory(vendorId);
  }

  @Post("inventory/:offerId/adjustments")
  @RequirePermissions("vendor:inventory:write")
  @ApiHeader({ name: "idempotency-key", required: true })
  @ApiOperation({ summary: "Record an immutable inventory adjustment" })
  adjustInventory(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param("vendorId", ParseUUIDPipe) vendorId: string,
    @Param("offerId", ParseUUIDPipe) offerId: string,
    @Headers("idempotency-key") idempotencyKey: unknown,
    @Body(new ZodValidationPipe(InventoryAdjustmentSchema)) adjustment: InventoryAdjustment,
  ): Promise<InventoryItem> {
    return this.operations.adjustInventory(principal, vendorId, offerId, adjustment, requireIdempotencyKey(idempotencyKey));
  }
}

@Module({
  imports: [PersistenceModule],
  controllers: [VendorOperationsController],
  providers: [
    {
      provide: VENDOR_OPERATIONS_REPOSITORY,
      inject: [PERSISTENCE_MODE, DATABASE],
      useFactory: (mode: PersistenceMode, database: Database | null): VendorOperationsRepository =>
        mode === "postgres"
          ? new PostgresVendorOperationsRepository(requireDatabase(database))
          : new InMemoryVendorOperationsRepository(),
    },
    VendorOperationsService,
  ],
  exports: [VENDOR_OPERATIONS_REPOSITORY, VendorOperationsService],
})
export class VendorModule {}
