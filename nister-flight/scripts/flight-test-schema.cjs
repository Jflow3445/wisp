const { execFileSync } = require("node:child_process");
const database = new URL(process.env.DATABASE_URL || "");
if (database.pathname !== "/nister_flight_test" || !["127.0.0.1", "localhost"].includes(database.hostname)) throw new Error("Schema synchronization requires the isolated loopback test database.");
execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate", "--accept-data-loss"], { stdio: "inherit", env: process.env });
const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs");
const prisma = new PrismaClient({ errorFormat: "minimal" });
(async () => {
  const constraints = await prisma.$queryRaw`SELECT CONSTRAINT_NAME AS name, CHECK_CLAUSE AS clause FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()`;
  const existing = new Set(constraints.map(c => c.name));
  const pilot = constraints.find(c => c.name === "FlightRound_pilot_engine_check");
  if (pilot && !pilot.clause.includes("7")) { await prisma.$executeRawUnsafe("ALTER TABLE FlightRound DROP CONSTRAINT FlightRound_pilot_engine_check"); existing.delete(pilot.name); }
  const sql = ["202610290003_flight_integrity", "202610290005_flight_missions"].map(name => fs.readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8")).join(";\n");
  for (const statement of sql.split(";")) {
    if (!/\bCHECK\s*\(/i.test(statement)) continue;
    const name = statement.match(/ADD CONSTRAINT `([^`]+)`/);
    if (name && !existing.has(name[1])) { await prisma.$executeRawUnsafe(statement); existing.add(name[1]); }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
