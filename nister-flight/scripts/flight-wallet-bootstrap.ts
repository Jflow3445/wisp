import { prisma } from "../src/lib/prisma";
import { bootstrapReceivingWallet } from "../src/lib/flight-receiving-wallets";
if (new URL(process.env.DATABASE_URL || "").pathname !== "/nister_ai") throw new Error("Wallet bootstrap requires the intended production database.");
async function main() { await prisma.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM FlightControl WHERE id=1 FOR UPDATE`; await bootstrapReceivingWallet(tx); }); console.log("Existing receiving wallet retained; wallet management is ready."); }
main().finally(() => prisma.$disconnect());
