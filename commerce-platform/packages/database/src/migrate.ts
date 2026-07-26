import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDatabaseFromEnv } from "./connection.js";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
const connection = createDatabaseFromEnv();

try {
  await migrate(connection.db, { migrationsFolder });
} finally {
  await connection.close();
}
