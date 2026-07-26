import type { ProductSummary } from "@nister/contracts";
import { and, asc, eq, gt, isNull, lte, or, sql, type SQL } from "drizzle-orm";

import type { Database } from "../connection.js";
import {
  brands,
  categories,
  products,
  productVariants,
  stores,
  vendorOffers,
  vendors,
} from "../schema.js";
import { decodeCursor, encodeCursor, formatMinor } from "./shared.js";

export interface CatalogueOfferRecord {
  id: string;
  productName: string;
  vendorId: string;
  price: { amountMinor: bigint; currency: string };
  availableQuantity: string;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "PREORDER";
}

export interface CataloguePageResult<T> {
  items: T[];
  pagination: { nextCursor: string | null; hasMore: boolean; limit: number };
}

const availableQuantity = sql<string>`greatest(coalesce((
  select sum(ii.physical_quantity - ii.reserved_quantity - ii.damaged_quantity - ii.safety_quantity)
  from inventory_items ii
  inner join stock_locations sl on sl.id = ii.stock_location_id and sl.status = 'ACTIVE'
  where ii.vendor_offer_id = ${vendorOffers.id}
), 0), 0)::numeric(18, 6)::text`;

const primaryImage = sql<string | null>`(
  select pm.storage_key
  from product_media pm
  where pm.product_id = ${products.id} and pm.media_type = 'IMAGE'
  order by pm.is_primary desc, pm.sort_order asc, pm.id asc
  limit 1
)`;

const activeCatalogueCondition = (now: Date): SQL =>
  and(
    eq(products.status, "APPROVED"),
    eq(categories.status, "ACTIVE"),
    eq(productVariants.status, "ACTIVE"),
    eq(vendorOffers.status, "ACTIVE"),
    eq(vendors.status, "APPROVED"),
    eq(stores.status, "ACTIVE"),
    or(isNull(vendorOffers.availableFrom), lte(vendorOffers.availableFrom, now)),
    or(isNull(vendorOffers.availableUntil), gt(vendorOffers.availableUntil, now)),
  )!;

const selectProductRows = (db: Database, condition: SQL, limit: number) =>
  db
    .selectDistinctOn([products.id], {
      id: products.id,
      publicReference: products.publicReference,
      slug: products.slug,
      name: products.name,
      imageStorageKey: primaryImage,
      brandId: brands.id,
      brandName: brands.name,
      categoryId: categories.id,
      categoryName: categories.name,
      offerId: vendorOffers.id,
      vendorId: vendors.id,
      vendorName: vendors.tradingName,
      priceMinor: vendorOffers.priceMinor,
      previousPriceMinor: vendorOffers.previousPriceMinor,
      currency: vendorOffers.currency,
      fulfilmentMinutes: vendorOffers.fulfilmentMinutes,
      availableQuantity,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .innerJoin(vendorOffers, eq(vendorOffers.productVariantId, productVariants.id))
    .innerJoin(vendors, eq(vendors.id, vendorOffers.vendorId))
    .innerJoin(stores, eq(stores.id, vendorOffers.storeId))
    .where(condition)
    .orderBy(asc(products.id), asc(vendorOffers.priceMinor), asc(vendorOffers.id))
    .limit(limit);

type ProductRow = Awaited<ReturnType<typeof selectProductRows>>[number];

const stockStatus = (quantity: string): CatalogueOfferRecord["stockStatus"] => {
  const numeric = Number(quantity);
  if (numeric <= 0) return "OUT_OF_STOCK";
  return numeric <= 5 ? "LOW_STOCK" : "IN_STOCK";
};

const imageUrl = (storageKey: string | null): string | null => {
  if (!storageKey) return null;
  try {
    return new URL(storageKey).toString();
  } catch {
    return null;
  }
};

const toProductSummary = (row: ProductRow): ProductSummary => {
  const previousPrice = row.previousPriceMinor === null
    ? null
    : {
        amountMinor: row.previousPriceMinor.toString(),
        currency: row.currency,
        formatted: formatMinor(row.previousPriceMinor, row.currency),
      };
  const discountPercentage = row.previousPriceMinor && row.previousPriceMinor > 0n
    ? Math.max(0, Math.min(100, Number(((row.previousPriceMinor - row.priceMinor) * 10_000n) / row.previousPriceMinor) / 100))
    : 0;

  return {
    id: row.id,
    publicReference: row.publicReference,
    slug: row.slug,
    name: row.name,
    primaryImageUrl: imageUrl(row.imageStorageKey),
    brand: row.brandId && row.brandName ? { id: row.brandId, name: row.brandName } : null,
    category: { id: row.categoryId, name: row.categoryName },
    offer: {
      id: row.offerId,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      price: {
        amountMinor: row.priceMinor.toString(),
        currency: row.currency,
        formatted: formatMinor(row.priceMinor, row.currency),
      },
      previousPrice,
      discountPercentage,
      availableQuantity: row.availableQuantity,
      stockStatus: stockStatus(row.availableQuantity),
      estimatedPreparationMinutes: row.fulfilmentMinutes,
    },
    rating: { average: 0, count: 0 },
  };
};

export class PostgresCatalogueRepository {
  constructor(private readonly db: Database) {}

  async listProducts(query: { cursor?: string; limit: number }): Promise<CataloguePageResult<ProductSummary>> {
    const cursor = decodeCursor(query.cursor);
    const condition = and(activeCatalogueCondition(new Date()), cursor ? gt(products.id, cursor) : undefined)!;
    const rows = await selectProductRows(this.db, condition, query.limit + 1);
    const hasMore = rows.length > query.limit;
    const selected = rows.slice(0, query.limit);
    return {
      items: selected.map(toProductSummary),
      pagination: {
        nextCursor: hasMore && selected.length ? encodeCursor(selected[selected.length - 1]!.id) : null,
        hasMore,
        limit: query.limit,
      },
    };
  }

  async findProductBySlug(slug: string): Promise<ProductSummary | null> {
    const rows = await selectProductRows(
      this.db,
      and(activeCatalogueCondition(new Date()), eq(products.slug, slug))!,
      1,
    );
    return rows[0] ? toProductSummary(rows[0]) : null;
  }

  async findOfferById(offerId: string): Promise<CatalogueOfferRecord | null> {
    const now = new Date();
    const rows = await this.db
      .select({
        id: vendorOffers.id,
        productName: products.name,
        vendorId: vendorOffers.vendorId,
        priceMinor: vendorOffers.priceMinor,
        currency: vendorOffers.currency,
        availableQuantity,
      })
      .from(vendorOffers)
      .innerJoin(productVariants, eq(productVariants.id, vendorOffers.productVariantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(vendors, eq(vendors.id, vendorOffers.vendorId))
      .innerJoin(stores, eq(stores.id, vendorOffers.storeId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(and(eq(vendorOffers.id, offerId), activeCatalogueCondition(now)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      productName: row.productName,
      vendorId: row.vendorId,
      price: { amountMinor: row.priceMinor, currency: row.currency },
      availableQuantity: row.availableQuantity,
      stockStatus: stockStatus(row.availableQuantity),
    };
  }
}
