import { z } from "zod";

export const MoneySchema = z.object({
  amountMinor: z.string().regex(/^-?\d+$/),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  formatted: z.string(),
});

export const QuantitySchema = z.string().regex(/^\d+(\.\d{1,6})?$/);

export const AddressSchema = z.object({
  id: z.uuid().optional(),
  recipientName: z.string().min(2).max(200),
  phone: z.string().regex(/^\+233\d{9}$/),
  countryCode: z.literal("GH"),
  region: z.string().min(1).max(100),
  district: z.string().max(100).nullable().optional(),
  city: z.string().min(1).max(100),
  locality: z.string().max(150).nullable().optional(),
  streetAddress: z.string().max(255).nullable().optional(),
  building: z.string().max(150).nullable().optional(),
  unit: z.string().max(100).nullable().optional(),
  digitalAddress: z.string().max(32).nullable().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  landmark: z.string().min(3).max(500),
  deliveryInstructions: z.string().max(500).nullable().optional(),
  addressType: z.enum(["HOME", "WORK", "OTHER"]),
  isDefault: z.boolean().default(false),
});

export const ProductSummarySchema = z.object({
  id: z.uuid(),
  publicReference: z.string(),
  slug: z.string(),
  name: z.string(),
  primaryImageUrl: z.url().nullable(),
  brand: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  category: z.object({ id: z.uuid(), name: z.string() }),
  offer: z.object({
    id: z.uuid(),
    vendorId: z.uuid(),
    vendorName: z.string(),
    price: MoneySchema,
    previousPrice: MoneySchema.nullable(),
    discountPercentage: z.number().min(0).max(100),
    availableQuantity: QuantitySchema,
    stockStatus: z.enum(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "PREORDER"]),
    estimatedPreparationMinutes: z.number().int().nonnegative(),
  }),
  rating: z.object({ average: z.number().min(0).max(5), count: z.number().int().nonnegative() }),
});

export const AddCartItemSchema = z.object({
  offerId: z.uuid(),
  quantity: QuantitySchema,
});

export const CreateCheckoutSchema = z.object({
  cartId: z.uuid(),
  cartVersion: z.number().int().positive(),
  currency: z.literal("GHS"),
});

export type MoneyDto = z.infer<typeof MoneySchema>;
export type Address = z.infer<typeof AddressSchema>;
export type ProductSummary = z.infer<typeof ProductSummarySchema>;
export type AddCartItem = z.infer<typeof AddCartItemSchema>;
export type CreateCheckout = z.infer<typeof CreateCheckoutSchema>;
