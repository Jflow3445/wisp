import { createHash, createHmac } from "node:crypto";
import { canonicalJson } from "./flight-mission-server";
import { playCharge } from "./flight-economy";

export const DRAW_ENGINE = 9;
export const LEGACY_DRAW_ENGINE = 8;
export const DRAW_DURATION_MS = 8000;
export type DrawRules = { version: 1 | 2; poolPayoutBps?: number; kind: "DRAW"; prizeCents: number; winPpm: number; durationMs: number };
export function drawPrice(stake: number, operatorPpm: number) {
  if (!Number.isSafeInteger(stake) || stake < 2 || !Number.isInteger(operatorPpm) || operatorPpm < 0 || operatorPpm > 500000) throw new Error("Choose a valid stake.");
  const rules: DrawRules = { version: 2, poolPayoutBps: 1000, kind: "DRAW", prizeCents: 2 * stake, winPpm: Math.floor((1000000 - operatorPpm) / 2), durationMs: DRAW_DURATION_MS };
  return { rules, retainedCents: 0, charge: playCharge(stake) };
}
export const drawConfigurationHash = (rules: DrawRules) => createHash("sha256").update(canonicalJson(rules)).digest("hex");
export function drawCommitment(seed: string, rules: DrawRules, stake: number) {
  return createHash("sha256").update(canonicalJson({ engine: DRAW_ENGINE, seed, configuration: drawConfigurationHash(rules), stake })).digest("hex");
}
export function drawResult(seed: string, nonce: string, rules: DrawRules) {
  // Rejection sampling avoids modulo bias. No clock, identity, reserve or controls
  // enter this function; each accepted entry keeps its frozen configuration.
  const ceiling = Math.floor(0x100000000 / 1000000) * 1000000;
  for (let attempt = 0; ; attempt++) {
    const digest = createHmac("sha256", seed).update(`flight-draw:v1:${nonce}:${attempt}`).digest();
    const value = digest.readUInt32BE(0);
    if (value >= ceiling) continue;
    return { payoutCents: value % 1000000 < rules.winPpm ? rules.prizeCents : 0, digest: digest.toString("hex") };
  }
}

export function poolDrawResult(seed: string, nonce: string, rules: DrawRules, availablePoolCents: number) {
  const draw = drawResult(seed, nonce, rules), allowanceCents = Math.floor(Math.max(0, availablePoolCents) / 10);
  const limited = draw.payoutCents > allowanceCents;
  return { payoutCents: limited ? 0 : draw.payoutCents, reason: limited ? "POOL_LIMIT" : draw.payoutCents ? "WIN" : "DRAW_LOSS", allowanceCents };
}
