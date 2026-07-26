import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./environment.js";

describe("environment validation", () => {
  it("provides safe local defaults", () => {
    const environment = validateEnvironment({ NODE_ENV: "test" });
    expect(environment).toMatchObject({ AUTH_MODE: "development", PORT: 4100, PERSISTENCE_MODE: "memory" });
  });

  it("refuses development auth and memory persistence in production", () => {
    expect(() => validateEnvironment({ NODE_ENV: "production" })).toThrow();
  });

  it("requires a PostgreSQL URL when postgres persistence is selected", () => {
    expect(() => validateEnvironment({ NODE_ENV: "test", PERSISTENCE_MODE: "postgres" })).toThrow();
    expect(validateEnvironment({
      NODE_ENV: "test",
      PERSISTENCE_MODE: "postgres",
      DATABASE_URL: "postgresql://commerce:secret@localhost:5432/commerce",
    })).toMatchObject({ PERSISTENCE_MODE: "postgres" });
  });

  it("accepts only postgres persistence with production credentials", () => {
    const production = {
      NODE_ENV: "production",
      AUTH_MODE: "auth0",
      AUTH0_ISSUER_BASE_URL: "https://identity.example.test",
      AUTH0_AUDIENCE: "commerce-api",
      PAYSTACK_MODE: "live",
      PAYSTACK_SECRET_KEY: "paystack-secret",
      DATABASE_URL: "postgresql://commerce:secret@db.example.test:5432/commerce",
    } as const;
    expect(() => validateEnvironment({ ...production, PERSISTENCE_MODE: "memory" })).toThrow();
    expect(validateEnvironment({ ...production, PERSISTENCE_MODE: "postgres" })).toMatchObject({
      NODE_ENV: "production",
      PERSISTENCE_MODE: "postgres",
    });
  });
});
