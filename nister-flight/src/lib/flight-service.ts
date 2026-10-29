import { AIRCRAFT } from "./flight-physics";
import { advancePilot, initialPilot, PILOT_ENGINE, pilotCollectId, pilotCommitment, pilotValue, pilotView, type PilotLog, type PilotState } from "./flight-pilot";
import { ensureUserReferralCode } from "./referrals";
import { depositReceiveAddress } from "./tron-payments";
import { playCharge, effectiveStakeLimit } from "@/lib/flight-economy";
import { qualifiedReferral, settleRoundReferral, tryPayReferral } from "@/lib/flight-referral";
import { randomBytes } from "node:crypto";
import { Prisma, type FlightRound } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentStep, DEFAULT_RULES, generateFlight, MAX_BALANCE, offerId, seededRandom, type FlightPath, type FlightRules } from "@/lib/flight-math";

type Tx = Prisma.TransactionClient;
export const FLIGHT_TERMS = "flight-pilot-2026-10-29-v3";

export async function atomic<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 15000 }); }
    catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt >= 4 || (code !== "P2034" && code !== "P2002")) throw error;
      await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1) + Math.random() * 50));
    }
  }
}

export async function controls(tx: Tx = prisma) {
  return tx.flightControl.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

async function lock(tx: Tx) {
  await tx.$queryRaw`SELECT id FROM FlightControl WHERE id = 1 FOR UPDATE`;
  return tx.flightControl.findUniqueOrThrow({ where: { id: 1 } });
}

async function now(tx: Tx) {
  const rows = await tx.$queryRaw<Array<{ currentTime: Date }>>`SELECT UTC_TIMESTAMP(3) AS currentTime`;
  return rows[0].currentTime;
}

async function playerAllowed(tx: Tx, userId: string) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, emailVerifiedAt: true, tradingProfile: true, flightPlayer: true } });
  if (["SUSPENDED", "CLOSED"].includes(user.tradingProfile?.accountState || "")) throw new Error("Your account is restricted. Contact support.");
  return user;
}

export async function entry(tx: Tx, userId: string, amountCents: number, kind: string, reference: string) {
  await tx.flightWalletEntry.create({ data: { userId, amountCents, kind, reference } });
}

async function addBalance(tx: Tx, userId: string, amount: number) {
  const changed = await tx.userTradingProfile.updateMany({ where: { userId, availableFundsUsdCents: { lte: MAX_BALANCE - amount } }, data: { availableFundsUsdCents: { increment: amount } } });
  if (changed.count !== 1) throw new Error("Wallet capacity exceeded. Contact support.");
}

async function debit(tx: Tx, userId: string, amount: number) {
  const changed = await tx.userTradingProfile.updateMany({ where: { userId, availableFundsUsdCents: { gte: amount } }, data: { availableFundsUsdCents: { decrement: amount } } });
  if (changed.count !== 1) throw new Error("Insufficient available balance.");
}

async function evolve(tx: Tx, round: FlightRound, time: Date) {
  if (round.status !== "FLYING" || round.engineVersion !== PILOT_ENGINE) return round;
  const previous = round.pilotStateJson as unknown as PilotState;
  if (!previous || previous.version !== 1) throw new Error("This flight needs a recovery check. Contact support.");
  const state = advancePilot(previous, time.getTime() - round.startedAt.getTime(), round.endsAt.getTime() - round.startedAt.getTime(), round.pathJson as unknown as FlightPath, round.seed);
  if (state.tick === previous.tick && state.stop === previous.stop) return round;
  return tx.flightRound.update({ where: { id: round.id }, data: { pilotStateJson: state as unknown as Prisma.InputJsonValue } });
}

async function settle(tx: Tx, round: FlightRound, time: Date, collect: boolean, expectedOffer?: string) {
  if (round.status !== "FLYING") return round;
  round = await evolve(tx, round, time);
  const flight = round.pathJson as unknown as FlightPath;
  const index = currentStep(flight.offsets, time.getTime() - round.startedAt.getTime());
  const pilot = round.engineVersion === PILOT_ENGINE ? round.pilotStateJson as unknown as PilotState : null;
  const terminal = pilot ? !!pilot.stop : time >= round.endsAt || flight.path[index] === 0;
  if (!collect && !terminal) return round;
  const token = pilot ? pilotCollectId(round.seed, round.id) : offerId(round.seed, index);
  if (collect && !terminal && expectedOffer !== token) throw new Error("The offer changed. Refresh your flight before collecting again.");
  const payout = pilot ? pilotValue(pilot, flight) : terminal && time >= round.endsAt ? flight.path.at(-1)! : flight.path[index];
  const settledAt = pilot?.stop ? new Date(round.startedAt.getTime() + pilot.tick * AIRCRAFT.realStepMs) : time;
  const changed = await tx.flightRound.updateMany({ where: { id: round.id, status: "FLYING" }, data: { status: collect && !terminal ? "COLLECTED" : "LANDED", activeUserId: null, payoutCents: payout, settledAt } });
  if (changed.count !== 1) return tx.flightRound.findUniqueOrThrow({ where: { id: round.id } });
  if (payout > 0) await addBalance(tx, round.userId, payout);
  await entry(tx, round.userId, payout, "FLIGHT_RETURN", `flight:${round.id}:return`);
  await tx.flightControl.update({ where: { id: 1 }, data: { houseBalanceCents: { decrement: payout }, reservedCents: { decrement: round.capCents } } });
  await settleRoundReferral(tx, round);
  return tx.flightRound.findUniqueOrThrow({ where: { id: round.id } });
}

function view(round: FlightRound, time: Date) {
  const flight = round.pathJson as unknown as FlightPath;
  const index = currentStep(flight.offsets, time.getTime() - round.startedAt.getTime());
  const complete = round.status !== "FLYING";
  const pilot = round.engineVersion === PILOT_ENGINE ? round.pilotStateJson as unknown as PilotState : null;
  const inputs = (round.pilotInputsJson ?? []) as unknown as PilotLog;
  return {
    id: round.id, requestKey: round.requestKey, status: round.status, stakeCents: round.stakeCents,
    capCents: round.capCents, feeCents: round.feeCents, totalCostCents: round.stakeCents + round.feeCents, payoutCents: round.payoutCents, commitment: round.commitment,
    engine: round.engineVersion, pilot: pilot ? pilotView(pilot, inputs.length) : null, settledAt: round.settledAt?.toISOString() ?? null,
    startedAt: round.startedAt.toISOString(), endsAt: round.endsAt.toISOString(), serverNow: time.toISOString(),
    offerId: complete ? null : pilot ? pilotCollectId(round.seed, round.id) : offerId(round.seed, index), currentCents: complete ? round.payoutCents! : pilot ? pilotValue(pilot, flight) : flight.path[index],
    points: complete ? flight.path : flight.path.slice(0, index + 1),
    ...(complete ? { proof: { seed: round.seed, rules: round.rulesJson, engine: round.engineVersion, ...(pilot ? { aircraft: AIRCRAFT, inputs, finalState: pilot, basePath: flight } : {}) } } : {}),
  };
}

export async function startFlight(userId: string, stakeCents: number, requestKey: string, rulesVersion = FLIGHT_TERMS) {
  return atomic(async tx => {
    let control = await lock(tx);
    const time = await now(tx);
    const previous = await tx.flightRound.findUnique({ where: { userId_requestKey: { userId, requestKey } } });
    if (previous) {
      if (previous.stakeCents !== stakeCents) throw new Error("This request key belongs to a different stake.");
      return view(await settle(tx, previous, time, false), time);
    }
    if (rulesVersion !== FLIGHT_TERMS) throw new Error("Reload this page to review the updated piloting rules before a new flight.");
    const user = await playerAllowed(tx, userId);
    if (user.flightPlayer?.blocked) throw new Error("New flights are restricted. Contact support.");
    if (!control.enabled) throw new Error("Flights are paused. Your wallet remains available.");
    if (user.role !== "ADMIN" && (!user.emailVerifiedAt || !user.flightPlayer?.verifiedAt)) throw new Error("An administrator must verify your eligibility before your first flight.");
    if (user.flightPlayer?.termsVersion !== FLIGHT_TERMS) throw new Error("Accept the Flight rules before playing.");
    if (!Number.isSafeInteger(stakeCents) || stakeCents < control.minStakeCents || stakeCents > control.maxStakeCents) throw new Error("Choose a stake within the current limits.");
    if (!control.liveLaunchedAt && user.role !== "ADMIN" && !user.flightPlayer?.isTestAccount) throw new Error("Flight is preparing for launch. Your wallet remains available.");
    const active = await tx.flightRound.findUnique({ where: { activeUserId: userId } });
    if (active && (await settle(tx, active, time, false)).status === "FLYING") throw new Error("You already have a flight in progress.");
    control = await tx.flightControl.findUniqueOrThrow({ where: { id: 1 } });
    const cap = 2 * stakeCents;
    if (Math.floor(control.houseBalanceCents / 10) - control.reservedCents < cap) throw new Error("The flight reserve is currently full. Try again later.");
    const profile = await tx.userTradingProfile.findUnique({ where: { userId }, select: { availableFundsUsdCents: true } });
    const pendingWithdrawals = await tx.flightWithdrawal.aggregate({ where: { userId, status: { in: ["PENDING", "APPROVED"] } }, _sum: { amountCents: true } });
    const balance = profile?.availableFundsUsdCents ?? 0;
    const charge = playCharge(stakeCents);
    if (control.insuranceBalanceCents + charge.feeCents > MAX_BALANCE || control.feesCollectedCents + charge.feeCents > MAX_BALANCE) throw new Error("Flights are temporarily paused for an account review.");
    if (balance - charge.totalCents + cap + (pendingWithdrawals._sum.amountCents ?? 0) > MAX_BALANCE || control.houseBalanceCents + stakeCents > MAX_BALANCE) throw new Error("Wallet capacity exceeded.");
    const rules: FlightRules = { ...DEFAULT_RULES, stepMs: 3000, houseEdgePpm: control.houseEdgePpm };
    const seed = randomBytes(32).toString("hex"), path = generateFlight(stakeCents, cap, rules, seededRandom(seed));
    const referral = await qualifiedReferral(tx, userId, stakeCents, charge.feeCents, control, time);
    await debit(tx, userId, charge.totalCents);
    const round = await tx.flightRound.create({ data: { userId, activeUserId: userId, requestKey, engineVersion: PILOT_ENGINE, pilotStateJson: initialPilot() as unknown as Prisma.InputJsonValue, pilotInputsJson: [], season: control.season, feeCents: charge.feeCents, referralUserId: referral?.userId, referralCents: referral?.amountCents ?? 0, stakeCents, capCents: cap, seed, commitment: pilotCommitment(seed, rules, stakeCents, cap), rulesJson: rules, pathJson: path as unknown as Prisma.InputJsonValue, startedAt: time, endsAt: new Date(time.getTime() + rules.steps * rules.stepMs) } });
    await tx.flightControl.update({ where: { id: 1 }, data: { houseBalanceCents: { increment: stakeCents }, reservedCents: { increment: cap }, insuranceBalanceCents: { increment: charge.feeCents }, feesCollectedCents: { increment: charge.feeCents } } });
    await entry(tx, userId, -stakeCents, "FLIGHT_STAKE", `flight:${round.id}:stake`);
    await entry(tx, userId, -charge.feeCents, "PLAY_FEE", `flight:${round.id}:fee`);
    return view(await settle(tx, round, time, false), time);
  });
}

export async function collectFlight(userId: string, id: string, expectedOffer: string) {
  return atomic(async tx => {
    await lock(tx);
    const round = await tx.flightRound.findFirst({ where: { id, userId } });
    if (!round) throw new Error("Flight not found.");
    const time = await now(tx);
    return view(await settle(tx, round, time, true, expectedOffer), time);
  });
}

export async function recoverFlight(userId: string, id: string) {
  return atomic(async tx => {
    await lock(tx);
    const round = await tx.flightRound.findFirst({ where: { id, userId } });
    if (!round) throw new Error("Flight not found.");
    const time = await now(tx);
    return view(await settle(tx, round, time, false), time);
  });
}

export async function pilotFlight(userId: string, id: string, seq: number, throttle: number, elevator: number) {
  if (!Number.isInteger(seq) || seq < 1 || seq > 100 || !Number.isInteger(throttle) || throttle < 0 || throttle > 1000 || !Number.isInteger(elevator) || Math.abs(elevator) > 1000) throw new Error("Choose valid flight controls.");
  return atomic(async tx => {
    await lock(tx);
    let round = await tx.flightRound.findFirst({ where: { id, userId } });
    if (!round) throw new Error("Flight not found.");
    const time = await now(tx);
    if (round.engineVersion !== PILOT_ENGINE) throw new Error("Piloting controls open on your next flight.");
    const log = (round.pilotInputsJson ?? []) as unknown as PilotLog;
    if (seq <= log.length) {
      if (log[seq - 1][1] !== throttle || log[seq - 1][2] !== elevator) throw new Error("Flight controls changed. Refresh to synchronize them.");
      return view(await settle(tx, round, time, false), time);
    }
    if (seq !== log.length + 1) throw new Error("Flight controls changed. Refresh to synchronize them.");
    round = await settle(tx, round, time, false);
    if (round.status !== "FLYING") return view(round, time);
    const state = round.pilotStateJson as unknown as PilotState;
    const next = { ...state, throttle: throttle / 1000, elevator: elevator / 1000, lastInputTick: state.tick };
    const updated = await tx.flightRound.update({ where: { id }, data: { pilotStateJson: next as unknown as Prisma.InputJsonValue, pilotInputsJson: [...log, [state.tick, throttle, elevator]] as Prisma.InputJsonValue } });
    return view(updated, time);
  });
}

export async function flightSnapshot(userId: string) {
  const identity = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, referralCode: true } });
  if (!identity.referralCode) await ensureUserReferralCode(userId, identity.name, null);
  const active = await prisma.flightRound.findUnique({ where: { activeUserId: userId } });
  if (active) {
    const time = new Date();
    const flight = active.pathJson as unknown as FlightPath;
    if (active.engineVersion === PILOT_ENGINE || time >= active.endsAt || flight.path[currentStep(flight.offsets, time.getTime() - active.startedAt.getTime())] === 0) await atomic(async tx => {
      await lock(tx);
      const fresh = await tx.flightRound.findUniqueOrThrow({ where: { id: active.id } });
      await settle(tx, fresh, await now(tx), false);
    });
  }
  const receiveAddress = await depositReceiveAddress();
  return prisma.$transaction(async tx => {
    const time = await now(tx);
    const control = await tx.flightControl.findUniqueOrThrow({ where: { id: 1 } });
    const [user, rounds, withdrawals, entries, deposits, held, rewards, pending, totalRounds] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, role: true, emailVerifiedAt: true, referralCode: true, tradingProfile: { select: { availableFundsUsdCents: true, accountState: true } }, flightPlayer: true } }),
      tx.flightRound.findMany({ where: { userId }, orderBy: { startedAt: "desc" }, take: 20 }),
      tx.flightWithdrawal.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
      tx.flightWalletEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
      tx.paymentOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20, select: { reference: true, status: true, invoiceAmountMicros: true, createdAt: true } }),
      tx.flightWithdrawal.aggregate({ where: { userId, status: { in: ["PENDING", "APPROVED"] } }, _sum: { amountCents: true } }),
      tx.flightReferralReward.aggregate({ where: { userId, status: "PAID", round: { season: control.season } }, _sum: { amountCents: true } }),
      tx.flightReferralReward.aggregate({ where: { userId, status: "PENDING" }, _sum: { amountCents: true } }),
      tx.flightRound.count({ where: { userId } }),
    ]);
    const allowed = (user.role === "ADMIN" || (!!user.emailVerifiedAt && !!user.flightPlayer?.verifiedAt)) && !user.flightPlayer?.blocked && !["SUSPENDED", "CLOSED"].includes(user.tradingProfile?.accountState ?? "");
    const testingAccess = !!control.liveLaunchedAt || user.role === "ADMIN" || !!user.flightPlayer?.isTestAccount;
    return { currency: "USD" as const, settlementCurrency: "USDT" as const, network: "TRC20" as const, usdPerUsdt: "1.00", user: { name: user.name, email: user.email, role: user.role }, availableCents: user.tradingProfile?.availableFundsUsdCents ?? 0, heldCents: held._sum.amountCents ?? 0,
      depositReceiveAddress: receiveAddress, eligible: allowed && testingAccess, termsVersion: FLIGHT_TERMS, termsAccepted: user.flightPlayer?.termsVersion === FLIGHT_TERMS, isTestAccount: !!user.flightPlayer?.isTestAccount && !control.liveLaunchedAt,
      referral: { enabled: control.referralsEnabled, bps: control.referralBps, code: user.referralCode, earnedCents: rewards._sum.amountCents ?? 0, pendingCents: pending._sum.amountCents ?? 0 }, totalRounds,
      control: { enabled: control.enabled, depositsEnabled: control.depositsEnabled, withdrawalsEnabled: control.withdrawalsEnabled, minStakeCents: control.minStakeCents, maxStakeCents: effectiveStakeLimit(control), minWithdrawalCents: control.minWithdrawalCents, feeBps: 300, isLive: !!control.liveLaunchedAt },
      rounds: rounds.map(r => view(r, time)), withdrawals, entries, deposits: deposits.map(d => ({ ...d, invoiceAmountMicros: d.invoiceAmountMicros.toString() })), serverNow: time.toISOString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
}

export async function acceptFlightRules(userId: string) {
  return atomic(async tx => {
    await playerAllowed(tx, userId);
    await tx.flightPlayer.upsert({ where: { userId }, update: { consentAt: new Date(), termsVersion: FLIGHT_TERMS }, create: { userId, consentAt: new Date(), termsVersion: FLIGHT_TERMS } });
    await tx.flightAudit.create({ data: { actorId: userId, action: "ACCEPT_FLIGHT_RULES", subjectId: userId, details: { version: FLIGHT_TERMS } } });
  });
}

export async function requestWithdrawal(userId: string, amountCents: number, address: string, requestKey: string) {
  return atomic(async tx => {
    const control = await lock(tx);
    const existing = await tx.flightWithdrawal.findUnique({ where: { userId_requestKey: { userId, requestKey } } });
    if (existing) {
      if (existing.amountCents !== amountCents || existing.address !== address) throw new Error("This request key belongs to another withdrawal.");
      return existing;
    }
    const player = await playerAllowed(tx, userId);
    if (player.flightPlayer?.isTestAccount && !control.liveLaunchedAt) throw new Error("Test balances are for gameplay and cannot be withdrawn.");
    if (player.role !== "ADMIN" && !player.emailVerifiedAt) throw new Error("Verify your email before withdrawing.");
    if (!control.withdrawalsEnabled) throw new Error("New withdrawals are temporarily paused.");
    if (amountCents < control.minWithdrawalCents) throw new Error("Amount is below the withdrawal minimum.");
    if (await tx.flightWithdrawal.findFirst({ where: { userId, status: { in: ["PENDING", "APPROVED"] } } })) throw new Error("You already have a withdrawal awaiting completion.");
    await debit(tx, userId, amountCents);
    const withdrawal = await tx.flightWithdrawal.create({ data: { userId, amountCents, address, requestKey } });
    await entry(tx, userId, -amountCents, "WITHDRAWAL_HOLD", `withdrawal:${withdrawal.id}:hold`);
    return withdrawal;
  });
}

export async function decideWithdrawal(actorId: string, id: string, action: "APPROVE" | "REJECT" | "PAID", note: string, txHash?: string) {
  return atomic(async tx => {
    await lock(tx);
    if ((await tx.user.findUniqueOrThrow({ where: { id: actorId } })).role !== "ADMIN") throw new Error("Administrator access required.");
    const withdrawal = await tx.flightWithdrawal.findUniqueOrThrow({ where: { id } });
    const status = { APPROVE: "APPROVED", REJECT: "REJECTED", PAID: "PAID" }[action];
    if (withdrawal.status === status) {
      if (action === "PAID" && withdrawal.txHash !== txHash) throw new Error("This withdrawal already has a different transaction.");
      return withdrawal;
    }
    if (action === "PAID" ? withdrawal.status !== "APPROVED" : withdrawal.status !== "PENDING") throw new Error("Withdrawal state changed. Refresh before continuing.");
    if (action === "PAID" && !txHash) throw new Error("A confirmed transaction is required.");
    if (action === "REJECT") {
      await addBalance(tx, withdrawal.userId, withdrawal.amountCents);
      await entry(tx, withdrawal.userId, withdrawal.amountCents, "WITHDRAWAL_REFUND", `withdrawal:${id}:refund`);
    }
    const updated = await tx.flightWithdrawal.update({ where: { id }, data: { status, reviewedBy: actorId, reviewNote: note, ...(txHash ? { txHash } : {}) } });
    await tx.flightAudit.create({ data: { actorId, action: `WITHDRAWAL_${action}`, subjectId: id, details: { note, txHash: txHash ?? null, amountCents: withdrawal.amountCents, address: withdrawal.address } } });
    return updated;
  });
}

let referralRetryCursor = "";
export async function settleExpiredFlights() {
  const rounds = await prisma.flightRound.findMany({ where: { status: "FLYING", endsAt: { lte: new Date() } }, take: 100, select: { id: true } });
  for (const { id } of rounds) await atomic(async tx => {
    await lock(tx);
    const round = await tx.flightRound.findUniqueOrThrow({ where: { id } });
    await settle(tx, round, await now(tx), false);
  });
  let pending = await prisma.flightReferralReward.findMany({ where: { status: "PENDING", id: { gt: referralRetryCursor } }, orderBy: { id: "asc" }, take: 30, select: { id: true } });
  if (!pending.length && referralRetryCursor) {
    referralRetryCursor = "";
    pending = await prisma.flightReferralReward.findMany({ where: { status: "PENDING" }, orderBy: { id: "asc" }, take: 30, select: { id: true } });
  }
  for (const reward of pending) {
    await atomic(async tx => { await lock(tx); await tryPayReferral(tx, reward.id); });
    referralRetryCursor = reward.id;
  }
  return rounds.length;
}
