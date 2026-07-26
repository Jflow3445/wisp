import { addMoney, multiplyMoney } from "./money";
import { categories, defaultAddress, orders, products, vendors } from "./demo-data";
import type { CatalogFilters, CheckoutPayload, Order, Product } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_MARKETPLACE_API_URL?.replace(/\/$/, "");
const DEMO_ENABLED = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code = "SERVICE_TEMPORARILY_UNAVAILABLE",
    readonly status = 503,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function sleep(duration = 320) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new ApiError("The marketplace API is not configured.");

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as
    | { data?: T; error?: { code?: string; message?: string } }
    | null;

  if (!response.ok) {
    throw new ApiError(
      body?.error?.message ?? "The marketplace could not complete this request.",
      body?.error?.code,
      response.status,
    );
  }

  return body?.data ?? (body as T);
}

async function withDemoFallback<T>(remote: () => Promise<T>, local: () => T): Promise<T> {
  if (!API_BASE) {
    if (!DEMO_ENABLED) throw new ApiError("The marketplace API is not configured.");
    await sleep();
    return local();
  }

  try {
    return await remote();
  } catch (error) {
    if (!DEMO_ENABLED) throw error;
    await sleep(160);
    return local();
  }
}

export const api = {
  getCategories: () => withDemoFallback(() => request<typeof categories>("/v1/catalog/categories"), () => categories),

  getVendors: () => withDemoFallback(() => request<typeof vendors>("/v1/vendors"), () => vendors),

  getVendor: (slug: string) =>
    withDemoFallback(
      () => request<(typeof vendors)[number]>(`/v1/vendors/${encodeURIComponent(slug)}`),
      () => {
        const vendor = vendors.find((item) => item.slug === slug);
        if (!vendor) throw new ApiError("Vendor not found.", "RESOURCE_NOT_FOUND", 404);
        return vendor;
      },
    ),

  getProducts: (filters: CatalogFilters = {}) =>
    withDemoFallback(
      () => request<Product[]>(`/v1/catalog/products?${new URLSearchParams(filters as Record<string, string>)}`),
      () => {
        const query = filters.query?.trim().toLocaleLowerCase();
        let result = products.filter((product) => {
          const matchesQuery = !query || `${product.name} ${product.description}`.toLocaleLowerCase().includes(query);
          return matchesQuery && (!filters.category || product.categorySlug === filters.category) && (!filters.vendor || product.vendorSlug === filters.vendor);
        });

        result = [...result].sort((a, b) => {
          if (filters.sort === "price-asc") return Number(BigInt(a.priceMinor) - BigInt(b.priceMinor));
          if (filters.sort === "price-desc") return Number(BigInt(b.priceMinor) - BigInt(a.priceMinor));
          if (filters.sort === "rating") return b.rating - a.rating;
          return Number(Boolean(b.badge)) - Number(Boolean(a.badge));
        });
        return result;
      },
    ),

  getProduct: (slug: string) =>
    withDemoFallback(
      () => request<Product>(`/v1/catalog/products/${encodeURIComponent(slug)}`),
      () => {
        const product = products.find((item) => item.slug === slug);
        if (!product) throw new ApiError("Product not found.", "RESOURCE_NOT_FOUND", 404);
        return product;
      },
    ),

  getOrders: () => withDemoFallback(() => request<Order[]>("/v1/buyer/orders"), () => orders),

  getOrder: (id: string) =>
    withDemoFallback(
      () => request<Order>(`/v1/buyer/orders/${encodeURIComponent(id)}`),
      () => {
        const order = orders.find((item) => item.id === id || item.publicReference === id);
        if (!order) throw new ApiError("Order not found.", "RESOURCE_NOT_FOUND", 404);
        return order;
      },
    ),

  signIn: async (credentials: { email: string; password: string }) => {
    if (API_BASE) return request<{ name: string; email: string }>("/v1/auth/login", { method: "POST", body: JSON.stringify(credentials) });
    if (!DEMO_ENABLED) throw new ApiError("Sign in is temporarily unavailable.");
    await sleep(500);
    return { name: "Ama Mensah", email: credentials.email };
  },

  register: async (details: { name: string; email: string; phone: string; password: string }) => {
    if (API_BASE) return request<{ name: string; email: string }>("/v1/auth/register", { method: "POST", body: JSON.stringify(details) });
    if (!DEMO_ENABLED) throw new ApiError("Registration is temporarily unavailable.");
    await sleep(650);
    return { name: details.name, email: details.email };
  },

  createCheckout: async (payload: CheckoutPayload, idempotencyKey: string): Promise<Order> => {
    if (API_BASE) {
      const cart = await request<{ id: string; version: number }>("/v1/carts", {
        method: "POST",
        headers: { "idempotency-key": `${idempotencyKey}-cart` },
        body: JSON.stringify({ items: payload.items }),
      });
      return request<Order>("/v1/checkouts", {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: JSON.stringify({
          cartId: cart.id,
          cartVersion: cart.version,
          currency: payload.currency,
          deliveryAddress: payload.deliveryAddress,
          payment: payload.payment,
        }),
      });
    }

    if (!DEMO_ENABLED) {
      throw new ApiError("Checkout needs a live marketplace connection. Your cart has not been charged.", "SERVICE_TEMPORARILY_UNAVAILABLE");
    }

    await sleep(900);
    const items = payload.items.map((line) => {
      const product = products.find((item) => item.offerId === line.offerId);
      if (!product || BigInt(line.quantity) > BigInt(product.availableQuantity)) {
        throw new ApiError("An item in your basket is no longer available.", "INSUFFICIENT_STOCK", 409);
      }
      return {
        ...line,
        productName: product.name,
        image: product.image,
        unitPriceMinor: product.priceMinor,
      };
    });
    const subtotal = addMoney(...items.map((item) => multiplyMoney(item.unitPriceMinor, item.quantity)));
    const deliveryMinor = BigInt(subtotal) >= 65000n ? "0" : "3500";
    const id = crypto.randomUUID();

    return {
      id,
      publicReference: `DEMO-${id.slice(0, 6).toUpperCase()}`,
      status: "CONFIRMED",
      placedAt: new Date().toISOString(),
      totalMinor: addMoney(subtotal, deliveryMinor),
      deliveryMinor,
      currency: "GHS",
      items,
      address: payload.deliveryAddress ?? defaultAddress,
      paymentMethod: payload.payment.method.replaceAll("_", " "),
      isDemo: true,
      timeline: [
        { label: "Demo order created", at: "Just now", complete: true },
        { label: "Payment confirmed", complete: false },
        { label: "Packed by vendors", complete: false },
        { label: "Out for delivery", complete: false },
        { label: "Delivered", complete: false },
      ],
    };
  },
};
