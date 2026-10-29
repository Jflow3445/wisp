import { createHash, createHmac } from "node:crypto";

// Port of commerce/pay-portal/lib/spin/flight_math.php, balanced engine v5.
// Money is integer USD cents; settlement is 1 USDT per USD. Future steps and the seed stay on the server.
export const PPM = 1_000_000;
export const MAX_BALANCE = 2_000_000_000;
export const DEFAULT_RULES = { houseEdgePpm: 64_250, zeroBps: 150, minMovePct: 10, maxMovePct: 40, steps: 8, stepMs: 1500 };
export type FlightRules = typeof DEFAULT_RULES;
export type FlightPath = { path: number[]; offsets: number[] };

export function cents(raw: unknown) {
  if (typeof raw !== "string" || !/^\d{1,8}(\.\d{1,2})?$/.test(raw.trim())) throw new Error("Enter an amount with at most two decimal places.");
  const [whole, fraction = ""] = raw.trim().split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_BALANCE) throw new Error("Amount is outside the supported range.");
  return value;
}

export function seededRandom(seed: string) {
  let counter = 0;
  return (lo: number, hi: number) => {
    const range = hi - lo + 1;
    if (!Number.isSafeInteger(range) || range < 1 || range > 2 ** 48) throw new Error("Invalid random range.");
    const ceiling = Math.floor(2 ** 48 / range) * range;
    let value: number;
    do { value = createHmac("sha256", seed).update(String(counter++)).digest().readUIntBE(0, 6); } while (value >= ceiling);
    return lo + value % range;
  };
}

export function balancedTransition(value: number, cap: number, pct: number, rules: FlightRules) {
  if (value <= 0) return { zeroBps: 10000, down: 0, up: 0, numerator: 0, denominator: 1 };
  if (value === cap) return { zeroBps: 0, down: Math.max(0, value - 1), up: Math.max(0, value - 1), numerator: 0, denominator: 1 };
  const delta = Math.max(1, Math.floor(value * pct / 100));
  const down = Math.max(0, value - delta), up = Math.min(cap, value + delta);
  const zeroBps = Math.min(rules.zeroBps, Math.floor((up - value) * 10000 / up));
  const survival = 10000 - zeroBps;
  return { zeroBps, down, up, numerator: value * 10000 - down * survival, denominator: (up - down) * survival };
}

export function generateFlight(stake: number, cap: number, rules: FlightRules, random: (lo: number, hi: number) => number): FlightPath {
  const opening = Math.min(PPM - 1, Math.floor((PPM - rules.houseEdgePpm) * 10000 / (10000 - rules.zeroBps)));
  let value = random(1, 10000) <= rules.zeroBps ? 0 : Math.floor(Math.min(stake, cap) * opening / PPM);
  const path: number[] = [], offsets: number[] = [];
  for (let index = 0; index < rules.steps; index++) {
    if (index > 0) {
      if (value === cap) value = Math.max(0, value - 1);
      else if (value > 0) {
        const move = balancedTransition(value, cap, random(rules.minMovePct, rules.maxMovePct), rules);
        value = random(1, 10000) <= move.zeroBps ? 0 : random(1, move.denominator) <= move.numerator ? move.up : move.down;
      }
    }
    path.push(value); offsets.push(index * rules.stepMs);
    if (value === 0) break;
    if (value === 2 * stake && rules.stepMs > 1000) {
      value = Math.max(0, value - 1); path.push(value); offsets.push(index * rules.stepMs + 1000);
      if (value === 0) break;
    }
  }
  return { path, offsets };
}

export function currentStep(offsets: number[], elapsed: number) {
  let index = 0;
  while (index + 1 < offsets.length && offsets[index + 1] <= elapsed) index++;
  return index;
}

export function commitment(seed: string, rules: FlightRules, stake: number, cap: number) {
  return createHash("sha256").update(JSON.stringify({ engine: 5, seed, rules, stake, cap })).digest("hex");
}

export function offerId(seed: string, index: number) {
  return createHmac("sha256", seed).update(`offer:${index}`).digest("hex").slice(0, 32);
}
