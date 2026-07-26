import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const MarketplaceEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4100),
    DATABASE_URL: z.url().startsWith("postgresql://"),
    REDIS_URL: z.url().startsWith("redis://"),
    AUTH_MODE: z.enum(["development", "auth0"]).default("development"),
    AUTH0_ISSUER_BASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
    AUTH0_AUDIENCE: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    PAYSTACK_MODE: z.enum(["sandbox", "live"]).default("sandbox"),
    PAYSTACK_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
    PAYSTACK_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
    STOREFRONT_ORIGIN: z.url(),
    VENDOR_ORIGIN: z.url(),
    ADMIN_ORIGIN: z.url(),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === "production" && environment.AUTH_MODE !== "auth0") {
      context.addIssue({ code: "custom", path: ["AUTH_MODE"], message: "Production requires Auth0 authentication" });
    }
    if (environment.AUTH_MODE === "auth0" && (!environment.AUTH0_ISSUER_BASE_URL || !environment.AUTH0_AUDIENCE)) {
      context.addIssue({ code: "custom", path: ["AUTH0_ISSUER_BASE_URL"], message: "Auth0 issuer and audience are required" });
    }
    if (environment.NODE_ENV === "production" && (!environment.PAYSTACK_SECRET_KEY || !environment.PAYSTACK_WEBHOOK_SECRET)) {
      context.addIssue({ code: "custom", path: ["PAYSTACK_SECRET_KEY"], message: "Production Paystack credentials are required" });
    }
  });

export type MarketplaceEnvironment = z.infer<typeof MarketplaceEnvironmentSchema>;

export function parseMarketplaceEnvironment(input: NodeJS.ProcessEnv): MarketplaceEnvironment {
  return MarketplaceEnvironmentSchema.parse(input);
}
