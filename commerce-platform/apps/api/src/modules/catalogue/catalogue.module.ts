import { Controller, Get, Inject, Injectable, Module, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { CursorPaginationSchema, ProductSummarySchema, type ProductSummary } from "@nister/contracts";
import { PostgresCatalogueRepository, type Database } from "@nister/database";
import type { Money } from "@nister/money";
import { Public } from "../../common/auth.js";
import { ApiError } from "../../common/errors.js";
import { ListEnvelope, type PageResult, ZodValidationPipe } from "../../common/http.js";
import {
  DATABASE,
  PERSISTENCE_MODE,
  PersistenceModule,
  requireDatabase,
  type PersistenceMode,
} from "../../persistence/persistence.module.js";

export interface CatalogueOffer {
  id: string;
  productName: string;
  vendorId: string;
  price: Money;
  availableQuantity: string;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "PREORDER";
}

export interface CatalogueRepository {
  listProducts(query: { cursor?: string; limit: number }): Promise<PageResult<ProductSummary>>;
  findProductBySlug(slug: string): Promise<ProductSummary | null>;
  findOfferById(offerId: string): Promise<CatalogueOffer | null>;
}

export const CATALOGUE_REPOSITORY = Symbol("CATALOGUE_REPOSITORY");

@Injectable()
export class InMemoryCatalogueRepository implements CatalogueRepository {
  private readonly products: ProductSummary[] = [];

  async listProducts(query: { cursor?: string; limit: number }): Promise<PageResult<ProductSummary>> {
    const start = query.cursor ? Number.parseInt(Buffer.from(query.cursor, "base64url").toString("utf8"), 10) : 0;
    const safeStart = Number.isInteger(start) && start >= 0 ? start : 0;
    const items = this.products.slice(safeStart, safeStart + query.limit);
    const nextIndex = safeStart + items.length;
    const hasMore = nextIndex < this.products.length;
    return {
      items: items.map((item) => ProductSummarySchema.parse(item)),
      pagination: {
        nextCursor: hasMore ? Buffer.from(String(nextIndex)).toString("base64url") : null,
        hasMore,
        limit: query.limit,
      },
    };
  }

  async findProductBySlug(slug: string): Promise<ProductSummary | null> {
    return this.products.find((product) => product.slug === slug) ?? null;
  }

  async findOfferById(offerId: string): Promise<CatalogueOffer | null> {
    const product = this.products.find((candidate) => candidate.offer.id === offerId);
    if (!product) return null;
    return {
      id: product.offer.id,
      productName: product.name,
      vendorId: product.offer.vendorId,
      price: { amountMinor: BigInt(product.offer.price.amountMinor), currency: product.offer.price.currency },
      availableQuantity: product.offer.availableQuantity,
      stockStatus: product.offer.stockStatus,
    };
  }
}

@Injectable()
export class CatalogueService {
  constructor(@Inject(CATALOGUE_REPOSITORY) private readonly repository: CatalogueRepository) {}

  list(query: unknown): Promise<PageResult<ProductSummary>> {
    return this.repository.listProducts(CursorPaginationSchema.parse(query));
  }

  async bySlug(slug: string): Promise<ProductSummary> {
    const product = await this.repository.findProductBySlug(slug);
    if (!product) throw ApiError.notFound("Product not found");
    return product;
  }
}

@ApiTags("Public catalogue")
@Public()
@Controller("api/v1/public/catalogue/products")
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get()
  @ListEnvelope()
  @ApiOperation({ summary: "Browse approved marketplace products" })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({ name: "limit", required: false, type: Number })
  list(@Query(new ZodValidationPipe(CursorPaginationSchema)) query: unknown): Promise<PageResult<ProductSummary>> {
    return this.catalogue.list(query);
  }

  @Get(":slug")
  @ApiOperation({ summary: "Read a public product by slug" })
  bySlug(@Param("slug") slug: string): Promise<ProductSummary> {
    return this.catalogue.bySlug(slug);
  }
}

@Module({
  imports: [PersistenceModule],
  controllers: [CatalogueController],
  providers: [
    {
      provide: CATALOGUE_REPOSITORY,
      inject: [PERSISTENCE_MODE, DATABASE],
      useFactory: (mode: PersistenceMode, database: Database | null): CatalogueRepository =>
        mode === "postgres"
          ? new PostgresCatalogueRepository(requireDatabase(database))
          : new InMemoryCatalogueRepository(),
    },
    CatalogueService,
  ],
  exports: [CATALOGUE_REPOSITORY, CatalogueService],
})
export class CatalogueModule {}
