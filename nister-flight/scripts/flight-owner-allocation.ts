// Run explicitly during this owner-authorized deployment, never on app startup.
import { prisma } from "../src/lib/prisma";
import { atomic } from "../src/lib/flight-service";
const database = new URL(process.env.DATABASE_URL || "");
if (database.pathname !== "/nister_ai" || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Unexpected owner-allocation database.");
async function main() {
  const testUserId = process.env.FLIGHT_OWNER_TEST_USER_ID;
  if (!testUserId || !/^[A-Za-z0-9_-]{1,64}$/.test(testUserId)) throw new Error("An explicit private owner test-account configuration is required.");
  await atomic(async tx => {
    await tx.$queryRaw`SELECT id FROM FlightControl WHERE id=1 FOR UPDATE`;
    const control = await tx.flightControl.findUniqueOrThrow({ where: { id: 1 } });
    const account = await tx.user.findUniqueOrThrow({ where: { id: testUserId }, select: { id: true } });
    const actor = await tx.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    const reserveId = "owner-reserve-allocation-usd100-20261029";
    if (!await tx.flightAudit.findUnique({ where: { id: reserveId } })) {
      if (control.liveLaunchedAt) throw new Error("Owner test allocation is prelaunch only.");
      await tx.flightControl.update({ where: { id: 1 }, data: { enabled: true, houseBalanceCents: { increment: 10000 }, launchReserveCents: { increment: 10000 } } });
      await tx.flightAudit.create({ data: { id: reserveId, actorId: actor.id, action: "OWNER_RESERVE_ALLOCATION", subjectId: "control", details: { cents: 10000, currency: "USD", instruction: "Owner explicitly authorized the internal allocation without further funding verification; no cryptocurrency transfer performed." } } });
    }
    const reference = "owner-test-credit-usd100-20261029";
    const recorded = await tx.flightWalletEntry.findUnique({ where: { reference } });
    if (!recorded) {
      if (control.liveLaunchedAt) throw new Error("Owner test credit is prelaunch only.");
      if (await tx.paymentOrder.count({ where: { userId: account.id, status: "PAID", metadataJson: { path: "$.source", equals: "flight_topup" } } })) throw new Error("Separate funded member balances before designating this test account.");
      // SQL NULL + 10000 stays NULL. Initialize legacy, unfunded wallets first.
      await tx.userTradingProfile.updateMany({ where: { userId: account.id, availableFundsUsdCents: null }, data: { availableFundsUsdCents: 0 } });
      await tx.userTradingProfile.upsert({ where: { userId: account.id }, create: { userId: account.id, availableFundsUsdCents: 10000 }, update: { availableFundsUsdCents: { increment: 10000 } } });
      await tx.flightWalletEntry.create({ data: { userId: account.id, reference, amountCents: 10000, kind: "TEST_CREDIT" } });
      await tx.flightPlayer.upsert({ where: { userId: account.id }, create: { userId: account.id, isTestAccount: true, verifiedAt: new Date(), verifiedBy: actor.id }, update: { isTestAccount: true, verifiedAt: new Date(), verifiedBy: actor.id } });
      await tx.flightAudit.create({ data: { id: reference, actorId: actor.id, action: "OWNER_TEST_CREDIT", subjectId: account.id, details: { cents: 10000, currency: "USD", withdrawable: false, clearedAtInitialLaunch: true, instruction: "Owner requested $100 to test the game; account role and credentials retained." } } });
    } else {
      if (recorded.userId !== account.id || recorded.amountCents !== 10000) throw new Error("The recorded test allocation belongs to a different target.");
      const profile = await tx.userTradingProfile.findUniqueOrThrow({ where: { userId: account.id } });
      if (profile.availableFundsUsdCents === null) {
        const [ledger, active, withdrawals] = await Promise.all([
          tx.flightWalletEntry.aggregate({ where: { userId: account.id }, _sum: { amountCents: true } }),
          tx.flightRound.count({ where: { userId: account.id, status: "FLYING" } }),
          tx.flightWithdrawal.count({ where: { userId: account.id, status: { in: ["PENDING", "APPROVED"] } } }),
        ]);
        if (control.liveLaunchedAt || ledger._sum.amountCents !== 10000 || active || withdrawals) throw new Error("The nullable test balance needs a manual ledger review.");
        await tx.userTradingProfile.update({ where: { userId: account.id }, data: { availableFundsUsdCents: ledger._sum.amountCents } });
        await tx.flightAudit.create({ data: { id: "owner-test-null-balance-repair-20261029", actorId: actor.id, action: "RECONCILE_OWNER_TEST_BALANCE", subjectId: account.id, details: { previousAvailableCents: null, availableCents: 10000, existingCreditReference: reference, additionalCreditCents: 0 } } });
      }
    }
  });
  console.log(JSON.stringify({ ownerReserveAllocation: "recorded once", testCredit: "recorded once", currency: "USD" }));
}
main().finally(() => prisma.$disconnect());
