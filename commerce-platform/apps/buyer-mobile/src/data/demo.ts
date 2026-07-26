import type { Product } from "./types";
import { BuyerOrderSchema, BuyerSessionSchema, ProductSchema, type BuyerDataSource, type BuyerOrder } from "./types";

const ids = {
  categoryFood: "5c4a5a7a-8d36-4f91-aea2-fc6722a8f067",
  categoryHome: "46e66b70-05d3-4f3f-883c-d750da8991cf",
  categoryCare: "a36a9c5a-11de-4114-857b-305d533ff40c",
  productRice: "15c3a31e-0377-45cc-80e3-093b3bf5d63c",
  productSoap: "71b89cb4-ddc7-44cf-8e17-768afbc56383",
  productFan: "cb17ab61-5a86-498b-9b03-a1f1eae071be",
  offerRice: "a0b226ba-91e9-4bbf-8cd1-02f1fc183c43",
  offerSoap: "68259bb8-9c35-43e1-a91f-4ba117db1cb2",
  offerFan: "a7b22c58-824e-4caf-a969-b8bde195d9fa",
};

const products: Product[] = [
  {
    id: ids.productRice,
    publicReference: "PRD-RICE-5KG",
    slug: "ghana-rice-5kg",
    name: "Ghana rice, 5 kg",
    primaryImageUrl: null,
    brand: null,
    category: { id: ids.categoryFood, name: "Groceries" },
    offer: {
      id: ids.offerRice,
      vendorId: "f4d77a74-d91b-4cf0-b25c-36c04c2078e0",
      vendorName: "Makola Foods",
      price: { amountMinor: "8200", currency: "GHS", formatted: "GH\u20b5 82.00" },
      previousPrice: { amountMinor: "8800", currency: "GHS", formatted: "GH\u20b5 88.00" },
      discountPercentage: 7,
      availableQuantity: "24",
      stockStatus: "IN_STOCK",
      estimatedPreparationMinutes: 12,
    },
    rating: { average: 4.7, count: 83 },
    description: "Locally grown long-grain rice packed for everyday family meals.",
    highlights: ["Grown in Ghana", "5 kg sealed bag", "Same-day dispatch"],
  },
  {
    id: ids.productSoap,
    publicReference: "PRD-SOAP-4",
    slug: "shea-bathing-soap-four-pack",
    name: "Shea bathing soap, 4 pack",
    primaryImageUrl: null,
    brand: { id: "25108b77-1f05-45ff-8510-cf2a3cb5c3de", name: "Savanna Care" },
    category: { id: ids.categoryCare, name: "Personal care" },
    offer: {
      id: ids.offerSoap,
      vendorId: "f5e74f65-1ef1-4c73-8605-659dbccfa04f",
      vendorName: "Osu Essentials",
      price: { amountMinor: "3600", currency: "GHS", formatted: "GH\u20b5 36.00" },
      previousPrice: null,
      discountPercentage: 0,
      availableQuantity: "11",
      stockStatus: "LOW_STOCK",
      estimatedPreparationMinutes: 8,
    },
    rating: { average: 4.5, count: 42 },
    description: "A gentle shea-based soap set for daily skin care.",
    highlights: ["Four full-size bars", "Made with shea", "Paper outer wrap"],
  },
  {
    id: ids.productFan,
    publicReference: "PRD-FAN-18",
    slug: "rechargeable-standing-fan",
    name: "Rechargeable standing fan",
    primaryImageUrl: null,
    brand: { id: "f00e89be-82c3-42a4-8979-2bac6f4b7d46", name: "Volt Home" },
    category: { id: ids.categoryHome, name: "Home" },
    offer: {
      id: ids.offerFan,
      vendorId: "2f0a1c9e-0790-4d73-9270-8268c19e2599",
      vendorName: "Circle Appliances",
      price: { amountMinor: "64500", currency: "GHS", formatted: "GH\u20b5 645.00" },
      previousPrice: null,
      discountPercentage: 0,
      availableQuantity: "7",
      stockStatus: "IN_STOCK",
      estimatedPreparationMinutes: 25,
    },
    rating: { average: 4.3, count: 19 },
    description: "Quiet 18-inch fan with battery backup and three speed levels.",
    highlights: ["Rechargeable battery", "Three speeds", "Two-year vendor warranty"],
  },
].map((product) => ProductSchema.parse(product));

const now = new Date();
const orderId = "e8405cc0-c531-46bb-a1f1-9711320584c7";
const orders: BuyerOrder[] = [
  BuyerOrderSchema.parse({
    id: orderId,
    reference: "NMO-20481",
    status: "PROCESSING",
    placedAt: new Date(now.getTime() - 55 * 60_000).toISOString(),
    itemCount: 2,
    total: { amountMinor: "12800", currency: "GHS", formatted: "GH\u20b5 128.00" },
    deliveryAddress: "Near the Community Pharmacy, Adenta",
    eta: "Today, 4:30-5:15 PM",
    timeline: [
      { status: "CONFIRMED", label: "Payment confirmed", occurredAt: new Date(now.getTime() - 52 * 60_000).toISOString(), complete: true },
      { status: "PROCESSING", label: "Vendor is preparing your order", occurredAt: new Date(now.getTime() - 30 * 60_000).toISOString(), complete: true },
      { status: "OUT_FOR_DELIVERY", label: "Out for delivery", occurredAt: null, complete: false },
      { status: "COMPLETED", label: "Delivered", occurredAt: null, complete: false },
    ],
  }),
];

function pause() {
  return new Promise((resolve) => setTimeout(resolve, 180));
}

export const demoBuyerDataSource: BuyerDataSource = {
  async signIn(input) {
    await pause();
    return BuyerSessionSchema.parse({ accessToken: "demo-buyer-token", displayName: "Ama Mensah", phone: input.phone });
  },
  async listProducts(search) {
    await pause();
    const term = search?.trim().toLowerCase();
    return term ? products.filter((product) => `${product.name} ${product.category.name} ${product.offer.vendorName}`.toLowerCase().includes(term)) : products;
  },
  async getProduct(id) {
    await pause();
    const product = products.find((item) => item.id === id);
    if (!product) throw new Error("Product not found");
    return product;
  },
  async listOrders() {
    await pause();
    return orders;
  },
  async getOrder(id) {
    await pause();
    const order = orders.find((item) => item.id === id);
    if (!order) throw new Error("Order not found");
    return order;
  },
  async placeOrder(payload) {
    await pause();
    const created = BuyerOrderSchema.parse({
      id: "f1bf2353-25de-4ec4-9ee5-bac9c8a5b0d3",
      reference: "NMO-20507",
      status: "CONFIRMED",
      placedAt: new Date().toISOString(),
      itemCount: payload.lines.reduce((total, line) => total + line.quantity, 0),
      total: { amountMinor: "11800", currency: "GHS", formatted: "GH\u20b5 118.00" },
      deliveryAddress: `${payload.delivery.landmark}, ${payload.delivery.city}`,
      eta: "Today, 6:00-6:45 PM",
      timeline: [
        { status: "CONFIRMED", label: "Order confirmed", occurredAt: new Date().toISOString(), complete: true },
        { status: "PROCESSING", label: "Vendor preparation", occurredAt: null, complete: false },
        { status: "OUT_FOR_DELIVERY", label: "Out for delivery", occurredAt: null, complete: false },
        { status: "COMPLETED", label: "Delivered", occurredAt: null, complete: false },
      ],
    });
    orders.unshift(created);
    return created;
  },
};
