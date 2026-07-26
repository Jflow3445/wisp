export const queryKeys = {
  categories: ["categories"] as const,
  vendors: ["vendors"] as const,
  vendor: (slug: string) => ["vendor", slug] as const,
  products: (filters: Record<string, string | undefined>) => ["products", filters] as const,
  product: (slug: string) => ["product", slug] as const,
  orders: ["orders"] as const,
  order: (id: string) => ["order", id] as const,
};
