const { execFileSync } = require("node:child_process");
const database = new URL(process.env.DATABASE_URL || "");
if (database.pathname !== "/nister_flight_test" || !["127.0.0.1", "localhost"].includes(database.hostname)) throw new Error("Schema synchronization requires the isolated loopback test database.");
execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { stdio: "inherit", env: process.env });
const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs");
const prisma = new PrismaClient();
(async () => {
  const constraints = await prisma.$queryRaw`SELECT CONSTRAINT_NAME AS name FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()`;
  const existing = new Set(constraints.map(c => c.name));
  const sql = fs.readFileSync("prisma/migrations/202610290003_flight_integrity/migration.sql", "utf8");
  for (const statement of sql.split(";")) {
    const name = statement.match(/ADD CONSTRAINT `([^`]+)`/);
    if (name && !existing.has(name[1])) await prisma.$executeRawUnsafe(statement);
  }
})().finally(() => prisma.$disconnect());
