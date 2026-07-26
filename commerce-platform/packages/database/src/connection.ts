import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;
export type PostgresClient = ReturnType<typeof postgres>;

export interface DatabaseConnectionOptions {
  url: string;
  maxConnections?: number;
  idleTimeoutSeconds?: number;
  connectTimeoutSeconds?: number;
  applicationName?: string;
  ssl?: boolean | "prefer" | "require" | "verify-full";
  prepare?: boolean;
}

export interface DatabaseHandle {
  db: Database;
  client: PostgresClient;
  close: () => Promise<void>;
}

const positiveInteger = (value: string | undefined, fallback: number, name: string): number => {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

const parseSsl = (value: string | undefined): DatabaseConnectionOptions["ssl"] => {
  if (value === undefined || value === "" || value === "false" || value === "disable") {
    return false;
  }
  if (value === "true") {
    return "require";
  }
  if (value === "prefer" || value === "require" || value === "verify-full") {
    return value;
  }
  throw new Error("DATABASE_SSL must be disable, prefer, require, or verify-full");
};

export const databaseOptionsFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConnectionOptions => {
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (parsedUrl.protocol !== "postgresql:" && parsedUrl.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use the postgresql: or postgres: protocol");
  }

  return {
    url,
    maxConnections: positiveInteger(env.DATABASE_POOL_MAX, env.NODE_ENV === "production" ? 20 : 10, "DATABASE_POOL_MAX"),
    idleTimeoutSeconds: positiveInteger(env.DATABASE_IDLE_TIMEOUT_SECONDS, 20, "DATABASE_IDLE_TIMEOUT_SECONDS"),
    connectTimeoutSeconds: positiveInteger(
      env.DATABASE_CONNECT_TIMEOUT_SECONDS,
      10,
      "DATABASE_CONNECT_TIMEOUT_SECONDS",
    ),
    applicationName: env.DATABASE_APPLICATION_NAME?.trim() || "nister-commerce",
    ssl: parseSsl(env.DATABASE_SSL),
    prepare: env.DATABASE_PREPARE_STATEMENTS !== "false",
  };
};

export const createDatabase = (options: DatabaseConnectionOptions): DatabaseHandle => {
  const client = postgres(options.url, {
    max: options.maxConnections ?? 10,
    idle_timeout: options.idleTimeoutSeconds ?? 20,
    connect_timeout: options.connectTimeoutSeconds ?? 10,
    ssl: options.ssl ?? false,
    prepare: options.prepare ?? true,
    connection: {
      application_name: options.applicationName ?? "nister-commerce",
    },
  });
  const db = drizzle(client, { schema });

  return {
    db,
    client,
    close: async () => client.end({ timeout: 5 }),
  };
};

export const createDatabaseFromEnv = (env: NodeJS.ProcessEnv = process.env): DatabaseHandle =>
  createDatabase(databaseOptionsFromEnv(env));
