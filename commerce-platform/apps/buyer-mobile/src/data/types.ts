import { MoneySchema, ParentOrderStatusSchema, ProductSummarySchema } from "@nister/contracts";
import { z } from "zod";

export const BuyerSessionSchema = z.object({
  accessToken: z.string().min(1),
  displayName: z.string().min(1),
  phone: z.string().min(1),
});

export const ProductSchema = ProductSummarySchema.extend({
  description: z.string(),
  highlights: z.array(z.string()),
});

export const OrderTimelineItemSchema = z.object({
  status: z.string(),
  label: z.string(),
  occurredAt: z.iso.datetime().nullable(),
  complete: z.boolean(),
});

export const BuyerOrderSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  status: ParentOrderStatusSchema,
  placedAt: z.iso.datetime(),
  itemCount: z.number().int().positive(),
  total: MoneySchema,
  deliveryAddress: z.string(),
  eta: z.string().nullable(),
  timeline: z.array(OrderTimelineItemSchema),
});

export interface CheckoutPayload {
  lines: { offerId: string; quantity: number }[];
  delivery: {
    recipientName: string;
    phone: string;
    city: string;
    landmark: string;
    instructions: string;
  };
  paymentMethod: "MOBILE_MONEY" | "CARD" | "CASH_ON_DELIVERY";
  idempotencyKey: string;
}

export interface BuyerDataSource {
  signIn(input: { phone: string; password: string }): Promise<z.infer<typeof BuyerSessionSchema>>;
  listProducts(search?: string): Promise<z.infer<typeof ProductSchema>[]>;
  getProduct(id: string): Promise<z.infer<typeof ProductSchema>>;
  listOrders(): Promise<z.infer<typeof BuyerOrderSchema>[]>;
  getOrder(id: string): Promise<z.infer<typeof BuyerOrderSchema>>;
  placeOrder(payload: CheckoutPayload): Promise<z.infer<typeof BuyerOrderSchema>>;
}

export type BuyerOrder = z.infer<typeof BuyerOrderSchema>;
export type Product = z.infer<typeof ProductSchema>;
