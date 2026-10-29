import { playCharge } from "./flight-economy";
import { missionScore, type MissionState } from "./flight-mission";

export type MissionPrizes = { soloCents: number; contestCents: number | null; drawCents: number };
export function missionPrice(stakeCents: number, operatorPpm: number) {
  const charge = playCharge(stakeCents);
  if (!Number.isInteger(operatorPpm) || operatorPpm < 0 || operatorPpm > 500000) throw new Error("Invalid operating allocation.");
  const retainedCents = Math.floor(stakeCents * operatorPpm / 1000000);
  const soloCents = Math.max(charge.totalCents + 1, Math.floor(stakeCents * 125 / 100));
  if (soloCents > 2 * stakeCents) throw new Error("Choose a larger stake to support a winning prize.");
  const contested = 2 * (stakeCents - retainedCents);
  return { retainedCents, charge, prizes: { soloCents, contestCents: contested > charge.totalCents ? contested : null, drawCents: stakeCents } satisfies MissionPrizes };
}
export function contestOutcome(a: MissionState, b: MissionState, stake: number, prize: number) {
  if (!a.stop || !b.stop) throw new Error("Both pilots must finish before the contest settles.");
  const aFinished = a.stop === "LANDED", bFinished = b.stop === "LANDED", aScore = missionScore(a), bScore = missionScore(b);
  if (aFinished && bFinished && aScore === bScore) return { a: stake, b: stake, aResult: "DRAW", bResult: "DRAW", refundAllocation: true };
  if (!aFinished && !bFinished) return { a: 0, b: 0, aResult: "BOTH_FAILED", bResult: "BOTH_FAILED", refundAllocation: false };
  const aWins = aFinished && (!bFinished || aScore > bScore);
  return { a: aWins ? prize : 0, b: aWins ? 0 : prize, aResult: aWins ? "WIN" : "LOSS", bResult: aWins ? "LOSS" : "WIN", refundAllocation: false };
}
