import { createHmac } from "node:crypto";
import { prisma } from "./prisma";

export type PublicFlightSummary = { referral: { enabled: boolean; bps: number; ratesBps?: number[] }; wins: Array<{ alias: string; profitCents: number; minute: string }> };
let cache: { until: number; data: PublicFlightSummary } | null = null;
let pending: Promise<PublicFlightSummary> | null = null;

export function publicWinnerAlias(roundId: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Public statistics are unavailable.");
  return `Pilot ${createHmac("sha256", secret).update(`public-win:${roundId}`).digest("hex").slice(0, 5).toUpperCase()}`;
}

export async function publicFlightSummary(): Promise<PublicFlightSummary> {
  if (cache && cache.until > Date.now()) return cache.data;
  if (pending) return pending;
  pending = (async () => {
    const control = await prisma.flightControl.findUniqueOrThrow({ where: { id: 1 }, select: { liveLaunchedAt: true, season: true, referralsEnabled: true, referralBps: true, referralLevel2Bps: true, referralLevel3Bps: true } });
    const rows = control.liveLaunchedAt ? await prisma.$queryRaw<Array<{ id: string; profitCents: number | bigint; settledAt: Date }>>`
      SELECT id, payoutCents-stakeCents-feeCents AS profitCents, settledAt
      FROM FlightRound
      WHERE season=${control.season} AND status IN ('LANDED','COLLECTED','SETTLED')
      AND settledAt >= UTC_TIMESTAMP(3) - INTERVAL 30 MINUTE
      AND payoutCents > stakeCents+feeCents
      ORDER BY settledAt DESC LIMIT 12` : [];
    const data = { referral: { enabled: control.referralsEnabled && control.referralBps + control.referralLevel2Bps + control.referralLevel3Bps > 0, bps: control.referralBps, ratesBps: [control.referralBps, control.referralLevel2Bps, control.referralLevel3Bps] }, wins: rows.map(row => ({ alias: publicWinnerAlias(row.id), profitCents: Number(row.profitCents), minute: row.settledAt.toISOString().slice(0, 16) + ":00.000Z" })) };
    cache = { until: Date.now() + 10000, data };
    return data;
  })();
  try { return await pending; } finally { pending = null; }
}

export function clearPublicFlightCache() { cache = null; }
