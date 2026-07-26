import { describe, expect, it } from "vitest";
import { MarketplaceEnvironmentSchema } from "./index.js";

const base = {
  DATABASE_URL: "postgresql://nister:nister@localhost:55432/nister_commerce",
  REDIS_URL: "redis://localhost:56379",
  STOREFRONT_ORIGIN: "http://localhost:4200",
  VENDOR_ORIGIN: "http://localhost:4201",
  ADMIN_ORIGIN: "http://localhost:4202",
};

describe("environment contract", () => {
  it("allows explicit local adapters in development", () => {
    expect(MarketplaceEnvironmentSchema.parse(base).AUTH_MODE).toBe("development");
  });

  it("forbids development auth in production", () => {
    expect(() => MarketplaceEnvironmentSchema.parse({ ...base, NODE_ENV: "production" })).toThrow(/Production requires Auth0/);
  });
});
