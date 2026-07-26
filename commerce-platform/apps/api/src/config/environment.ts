import { z } from "zod";

const OptionalUrlSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);

export const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4100),
    STOREFRONT_ORIGIN: z.url().default("http://localhost:4200"),
    VENDOR_ORIGIN: z.url().default("http://localhost:4201"),
    ADMIN_ORIGIN: z.url().default("http://localhost:4202"),
    AUTH_MODE: z.enum(["development", "auth0"]).default("development"),
    AUTH0_ISSUER_BASE_URL: OptionalUrlSchema,
    AUTH0_AUDIENCE: z.string().min(1).optional(),
    PAYSTACK_MODE: z.enum(["sandbox", "live"]).default("sandbox"),
    PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
    PAYSTACK_WEBHOOK_SECRET: z.string().min(1).optional(),
    PERSISTENCE_MODE: z.enum(["memory", "postgres"]).default("memory"),
    DATABASE_URL: OptionalUrlSchema,
  })
  .superRefine((environment, context) => {
    if (environment.AUTH_MODE === "auth0") {
      if (!environment.AUTH0_ISSUER_BASE_URL) {
        context.addIssue({ code: "custom", path: ["AUTH0_ISSUER_BASE_URL"], message: "Required for Auth0" });
      }
      if (!environment.AUTH0_AUDIENCE) {
        context.addIssue({ code: "custom", path: ["AUTH0_AUDIENCE"], message: "Required for Auth0" });
      }
    }

    if (environment.NODE_ENV === "production") {
      if (environment.AUTH_MODE !== "auth0") {
        context.addIssue({ code: "custom", path: ["AUTH_MODE"], message: "Production requires Auth0" });
      }
      if (environment.PERSISTENCE_MODE === "memory") {
        context.addIssue({
          code: "custom",
          path: ["PERSISTENCE_MODE"],
          message: "Production requires PostgreSQL persistence",
        });
      }
      if (environment.PAYSTACK_MODE !== "live" || !environment.PAYSTACK_SECRET_KEY) {
        context.addIssue({
          code: "custom",
          path: ["PAYSTACK_SECRET_KEY"],
          message: "Production requires live Paystack credentials",
        });
      }
    }

    if (environment.PERSISTENCE_MODE === "postgres") {
      if (!environment.DATABASE_URL || !/^postgres(?:ql)?:\/\//.test(environment.DATABASE_URL)) {
        context.addIssue({
          code: "custom",
          path: ["DATABASE_URL"],
          message: "PostgreSQL persistence requires a postgresql:// or postgres:// DATABASE_URL",
        });
      }
    }
  });

export type Environment = z.infer<typeof EnvironmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  return EnvironmentSchema.parse(input);
}
