import { Prisma, type FlightControl, type FlightRound } from "@prisma/client";
import { MAX_BALANCE } from "./flight-math";
import { canonicalReferralEmail, referralCharge } from "./flight-economy";

type Tx = Prisma.TransactionClient;

export type ReferralAllocation = { userId: string; level: number; rateBps: number; amountCents: number };
export function referralRates(control: Pick<FlightControl, "referralBps" | "referralLevel2Bps" | "referralLevel3Bps">) {
  return [control.referralBps, control.referralLevel2Bps, control.referralLevel3Bps];
}
export async function qualifiedReferrals(tx: Tx, userId: string, stake: number, fee: number, control: FlightControl, startedAt: Date): Promise<ReferralAllocation[]> {
  const rates = referralRates(control);
  if (!control.referralsEnabled || !rates.some(Boolean) || !control.liveLaunchedAt) return [];
  if (rates.some(rate => !Number.isInteger(rate) || rate < 0) || rates.reduce((a,b) => a+b,0) > 300) throw new Error("Referral rates exceed their funded fee allocation.");
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, referredById: true, flightPlayer: { select: { isTestAccount: true } } } });
  if (!user.referredById || user.flightPlayer?.isTestAccount) return [];
  const deposit = await tx.processedTransfer.findFirst({ where: { creditStatus: "CREDITED", blockTimestamp: { lte: startedAt }, order: { userId, status: "PAID", paidAt: { lte: startedAt }, metadataJson: { path: "$.source", equals: "flight_topup" } } }, select: { id: true } });
  if (!deposit) return [];
  const ancestry = await tx.$queryRaw<Array<{ roots: number | bigint | null }>>`WITH RECURSIVE ancestors AS (
    SELECT id, referredById FROM User WHERE id=${userId}
    UNION DISTINCT SELECT parent.id, parent.referredById FROM User parent JOIN ancestors a ON parent.id=a.referredById
  ) SELECT SUM(CASE WHEN referredById IS NULL THEN 1 ELSE 0 END) AS roots FROM ancestors`;
  if (!Number(ancestry[0]?.roots)) return [];
  const seen = new Set([userId]), emails = new Set([canonicalReferralEmail(user.email)]), plan: ReferralAllocation[] = [];
  let parentId: string | null = user.referredById;
  for (let index = 0; index < 3 && parentId; index++) {
    if (seen.has(parentId)) return [];
    const parent: { id: string; email: string; referredById: string | null; tradingProfile: { accountState: string } | null } | null = await tx.user.findUnique({ where: { id: parentId }, select: { id: true, email: true, referredById: true, tradingProfile: { select: { accountState: true } } } });
    if (!parent) break;
    const email = canonicalReferralEmail(parent.email);
    if (emails.has(email)) return [];
    seen.add(parent.id); emails.add(email);
    const amountCents = referralCharge(stake, rates[index], fee);
    if (amountCents) plan.push({ userId: parent.id, level: index + 1, rateBps: rates[index], amountCents });
    parentId = parent.referredById;
  }
  return plan;
}

// Caller holds the singleton finance lock. Capacity or account restrictions defer
// this reward without preventing the referred player's round from settling.
export async function tryPayReferral(tx: Tx, id: string) {
  const reward = await tx.flightReferralReward.findUniqueOrThrow({ where: { id }, include: { round: { select: { season: true, status: true } }, recipient: { select: { emailVerifiedAt: true, role: true, tradingProfile: true } } } });
  if (reward.status !== "PENDING" || !["SETTLED", "LANDED", "COLLECTED"].includes(reward.round.status)) return false;
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
  await tx.flightWalletEntry.create({ data: { userId: reward.userId, amountCents: reward.amountCents, kind: "REFERRAL_REWARD", reference: reward.level === 1 ? `referral:${reward.roundId}` : `referral:${reward.roundId}:level:${reward.level}` } });
  await tx.flightReferralReward.update({ where: { id }, data: { status: "PAID", paidAt: new Date() } });
  await tx.flightControl.update({ where: { id: 1 }, data: { insuranceBalanceCents: { decrement: reward.amountCents }, referralsPaidCents: { increment: reward.amountCents } } });
  return true;
}

export async function settleRoundReferral(tx: Tx, round: FlightRound) {
  const plan: ReferralAllocation[] = Array.isArray(round.referralPlanJson)
    ? round.referralPlanJson as unknown as ReferralAllocation[]
    : round.referralUserId && round.referralCents ? [{ userId: round.referralUserId, level: 1, rateBps: 0, amountCents: round.referralCents }] : [];
  if (plan.reduce((total, allocation) => total + allocation.amountCents, 0) > round.feeCents) throw new Error("Referral allocation exceeds the recorded play fee.");
  for (const allocation of plan) {
    const reward = await tx.flightReferralReward.upsert({ where: { roundId_level: { roundId: round.id, level: allocation.level } }, create: { roundId: round.id, userId: allocation.userId, referredUserId: round.userId, level: allocation.level, rateBps: allocation.rateBps, amountCents: allocation.amountCents }, update: {} });
    await tryPayReferral(tx, reward.id);
  }
}
