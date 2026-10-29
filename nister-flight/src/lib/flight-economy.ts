import { MAX_BALANCE } from "./flight-math";

export const PLAY_FEE_BPS = 300;
export const MAX_REFERRAL_BPS = PLAY_FEE_BPS;

export function playCharge(stakeCents: number) {
  if (!Number.isSafeInteger(stakeCents) || stakeCents < 1 || stakeCents > MAX_BALANCE / 2) throw new Error("Choose a valid stake.");
  const feeCents = Math.ceil(stakeCents * PLAY_FEE_BPS / 10000);
  return { stakeCents, feeCents, totalCents: stakeCents + feeCents };
}

export function referralCharge(stakeCents: number, bps: number, feeCents: number) {
  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_REFERRAL_BPS) throw new Error("Referral rewards must be between 0% and 3% of the stake.");
  return Math.min(feeCents, Math.floor(stakeCents * bps / 10000));
}

export function canonicalReferralEmail(email: string) {
  const [local, rawDomain] = email.trim().toLowerCase().split("@");
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  return domain === "gmail.com" ? `${local.split("+")[0].replaceAll(".", "")}@${domain}` : `${local}@${domain}`;
}

export function effectiveStakeLimit(control: { houseBalanceCents: number; reservedCents: number; maxStakeCents: number }) {
  return Math.max(0, Math.min(control.maxStakeCents, Math.floor((Math.floor(control.houseBalanceCents / 10) - control.reservedCents) / 2)));
}
