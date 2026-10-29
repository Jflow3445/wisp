import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { atomic } from "./flight-service";

async function inspect(tx: Prisma.TransactionClient | typeof prisma, actorId: string) {
  const [control, balances, active, withdrawals, funded] = await Promise.all([
    tx.flightControl.findUniqueOrThrow({ where: { id: 1 } }),
    tx.userTradingProfile.aggregate({ where: { availableFundsUsdCents: { gt: 0 } }, _sum: { availableFundsUsdCents: true }, _count: true }),
    tx.flightRound.count({ where: { status: "FLYING" } }),
    tx.flightWithdrawal.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
    tx.userTradingProfile.count({ where: { availableFundsUsdCents: { gt: 0 }, user: { paymentOrders: { some: { status: "PAID", metadataJson: { path: "$.source", equals: "flight_topup" } } } } } }),
  ]);
  const reasons: string[] = [];
  if (control.liveLaunchedAt) reasons.push("Live play has already started. The initial reset is available only once.");
  if (active) reasons.push("Wait for all current flights to settle.");
  if (withdrawals) reasons.push("Complete pending or approved withdrawals first.");
  if (funded) reasons.push("Return or withdraw confirmed customer deposits before clearing test balances.");
  if (control.launchReserveCents < control.minStakeCents * 20) reasons.push("Allocate enough opening reserve to cover the minimum stake.");
  const state = { actorId, season: control.season, revision: control.updatedAt.toISOString(), wallets: balances._count, cents: balances._sum.availableFundsUsdCents ?? 0, active, withdrawals, funded };
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("The launch control is temporarily unavailable.");
  const token = createHmac("sha256", secret).update(JSON.stringify(state)).digest("hex");
  return { alreadyLive: !!control.liveLaunchedAt, canLaunch: reasons.length === 0, reasons, walletCount: balances._count, clearedCents: state.cents, openingReserveCents: control.launchReserveCents, token, season: control.season };
}

export const launchPreview = (actorId: string) => inspect(prisma, actorId);

export async function launchLiveGame(actorId: string, confirmation: string, previewToken: string) {
  if (confirmation !== "START LIVE GAME") throw new Error("Type START LIVE GAME to confirm the initial launch.");
  return atomic(async tx => {
    await tx.$queryRaw`SELECT id FROM FlightControl WHERE id=1 FOR UPDATE`;
    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId }, select: { role: true } });
    if (actor.role !== "ADMIN") throw new Error("Administrator access required.");
    const preview = await inspect(tx, actorId);
    if (preview.alreadyLive) return { alreadyLive: true };
    if (!preview.canLaunch) throw new Error(preview.reasons[0]);
    const presented = Buffer.from(previewToken), expected = Buffer.from(preview.token);
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) throw new Error("Balances changed. Refresh the launch preview before continuing.");
    const wallets = await tx.userTradingProfile.findMany({ where: { availableFundsUsdCents: { not: 0 } }, select: { userId: true, availableFundsUsdCents: true } });
    for (const wallet of wallets) {
      const value = wallet.availableFundsUsdCents ?? 0;
      if (value) await tx.flightWalletEntry.create({ data: { userId: wallet.userId, amountCents: -value, kind: "LIVE_LAUNCH_RESET", reference: `launch:${preview.season}:${wallet.userId}` } });
    }
    await tx.userTradingProfile.updateMany({ where: { availableFundsUsdCents: { not: null } }, data: { availableFundsUsdCents: 0 } });
    await tx.flightReferralReward.updateMany({ where: { status: "PENDING" }, data: { status: "RESET" } });
    await tx.flightPlayer.updateMany({ data: { isTestAccount: false } });
    const at = new Date();
    await tx.flightControl.update({ where: { id: 1 }, data: { enabled: true, liveLaunchedAt: at, seasonStartedAt: at, season: { increment: 1 }, houseBalanceCents: preview.openingReserveCents, reservedCents: 0, feesCollectedCents: 0, insuranceBalanceCents: 0, referralsPaidCents: 0 } });
    await tx.flightAudit.create({ data: { actorId, action: "START_LIVE_GAME", subjectId: "control", details: { previousSeason: preview.season, clearedWallets: preview.walletCount, clearedCents: preview.clearedCents, openingReserveCents: preview.openingReserveCents, retained: "Accounts, deposits, withdrawal history and audit records" } } });
    return { launched: true, clearedWallets: preview.walletCount, clearedCents: preview.clearedCents };
  });
}
