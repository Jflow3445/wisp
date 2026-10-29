import { Prisma, type FlightControl, type FlightRound } from "@prisma/client";
import { MAX_BALANCE } from "./flight-math";
import { canonicalReferralEmail, referralCharge } from "./flight-economy";

type Tx = Prisma.TransactionClient;

export async function qualifiedReferral(tx: Tx, userId: string, stake: number, fee: number, control: FlightControl, startedAt: Date) {
  if (!control.referralsEnabled || !control.referralBps || !control.liveLaunchedAt) return null;
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, referredById: true, flightPlayer: { select: { isTestAccount: true } } } });
  if (!user.referredById || user.referredById === userId || user.flightPlayer?.isTestAccount) return null;
  const parent = await tx.user.findUnique({ where: { id: user.referredById }, select: { id: true, email: true, referredById: true, tradingProfile: { select: { accountState: true } } } });
  if (!parent || canonicalReferralEmail(user.email) === canonicalReferralEmail(parent.email) || ["SUSPENDED", "CLOSED"].includes(parent.tradingProfile?.accountState ?? "")) return null;
  const seen = new Set([userId, parent.id]);
  let ancestor = parent.referredById;
  for (let hops = 0; ancestor && hops < 25; hops++) {
    if (seen.has(ancestor)) return null;
    seen.add(ancestor);
    ancestor = (await tx.user.findUnique({ where: { id: ancestor }, select: { referredById: true } }))?.referredById ?? null;
  }
  if (ancestor) return null;
  // A manual test credit or an unconfirmed invoice never qualifies as a deposit.
  const deposit = await tx.processedTransfer.findFirst({ where: { creditStatus: "CREDITED", blockTimestamp: { lte: startedAt }, order: { userId, status: "PAID", paidAt: { lte: startedAt }, metadataJson: { path: "$.source", equals: "flight_topup" } } }, select: { id: true } });
  if (!deposit) return null;
  const amountCents = referralCharge(stake, control.referralBps, fee);
  return amountCents ? { userId: parent.id, amountCents } : null;
}

// Caller holds the singleton finance lock. Capacity or account restrictions defer
// this reward without preventing the referred player's round from settling.
export async function tryPayReferral(tx: Tx, id: string) {
  const reward = await tx.flightReferralReward.findUniqueOrThrow({ where: { id }, include: { round: { select: { season: true, status: true } }, recipient: { select: { emailVerifiedAt: true, role: true, tradingProfile: true } } } });
  if (reward.status !== "PENDING" || reward.round.status === "FLYING") return false;
  const control = await tx.flightControl.findUniqueOrThrow({ where: { id: 1 } });
  if (reward.round.season !== control.season) {
    await tx.flightReferralReward.update({ where: { id }, data: { status: "RESET" } });
    return false;
  }
  const recipient = reward.recipient;
  if ((!recipient.emailVerifiedAt && recipient.role !== "ADMIN") || ["SUSPENDED", "CLOSED"].includes(recipient.tradingProfile?.accountState ?? "") || control.insuranceBalanceCents < reward.amountCents) return false;
  const [active, held] = await Promise.all([
    tx.flightRound.findUnique({ where: { activeUserId: reward.userId }, select: { capCents: true } }),
    tx.flightWithdrawal.aggregate({ where: { userId: reward.userId, status: { in: ["PENDING", "APPROVED"] } }, _sum: { amountCents: true } }),
  ]);
  const balance = recipient.tradingProfile?.availableFundsUsdCents ?? 0;
  if (balance + reward.amountCents + (active?.capCents ?? 0) + (held._sum.amountCents ?? 0) > MAX_BALANCE) return false;
  await tx.userTradingProfile.upsert({ where: { userId: reward.userId }, create: { userId: reward.userId, availableFundsUsdCents: reward.amountCents, fundsState: "FUNDED" }, update: { availableFundsUsdCents: balance + reward.amountCents } });
  await tx.flightWalletEntry.create({ data: { userId: reward.userId, amountCents: reward.amountCents, kind: "REFERRAL_REWARD", reference: `referral:${reward.roundId}` } });
  await tx.flightReferralReward.update({ where: { id }, data: { status: "PAID", paidAt: new Date() } });
  await tx.flightControl.update({ where: { id: 1 }, data: { insuranceBalanceCents: { decrement: reward.amountCents }, referralsPaidCents: { increment: reward.amountCents } } });
  return true;
}

export async function settleRoundReferral(tx: Tx, round: FlightRound) {
  if (!round.referralUserId || !round.referralCents) return;
  const reward = await tx.flightReferralReward.upsert({ where: { roundId: round.id }, create: { roundId: round.id, userId: round.referralUserId, referredUserId: round.userId, amountCents: round.referralCents }, update: {} });
  await tryPayReferral(tx, reward.id);
}
