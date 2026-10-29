import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { abortMission, acceptFlightRules, atomic, controls, flightSnapshot, FLIGHT_TERMS, offerMission, pilotFlight, recoverFlight, startFlight } from "../src/lib/flight-service";
import { combinedMissionSeed, missionCommitment, replayMission, type MissionRules, type SeedContribution } from "../src/lib/flight-mission-server";
import { MISSION, type MissionInputLog, type MissionState } from "../src/lib/flight-mission";
import { creditUserAvailableFunds } from "../src/lib/wallet-funds";
import { flyMission } from "./flight-mission-fixture";

const url = new URL(process.env.DATABASE_URL || "");
if (url.pathname !== "/nister_flight_test" || !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Mission fixtures require the isolated loopback test database.");
let checks = 0;
const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; console.log(`PASS ${label}`); };
const balance = async (id: string) => (await prisma.userTradingProfile.findUniqueOrThrow({ where: { userId: id } })).availableFundsUsdCents!;
async function capital() {
  const c = await controls(), wallets = await prisma.userTradingProfile.aggregate({ _sum: { availableFundsUsdCents: true } }), held = await prisma.flightWithdrawal.aggregate({ where: { status: { in: ["PENDING", "APPROVED"] } }, _sum: { amountCents: true } });
  return c.houseBalanceCents + c.insuranceBalanceCents + (wallets._sum.availableFundsUsdCents ?? 0) + (held._sum.amountCents ?? 0);
}
async function launch(id: string, stake = 500) {
  const offer = await offerMission(id, stake), key = randomUUID();
  return { offer, key, round: await startFlight(id, stake, key, FLIGHT_TERMS, offer.id, offer.commitment) };
}
async function finishComputed(id: string) {
  const row = await prisma.flightRound.findUniqueOrThrow({ where: { id } });
  const rules = row.rulesJson as unknown as MissionRules;
  const run = flyMission(row.seed, rules, row.pilotStateJson as unknown as MissionState, row.pilotInputsJson as unknown as MissionInputLog);
  const start = new Date(Date.now() - run.state.tick * MISSION.tickMs - 1000);
  if (row.matchId) await prisma.flightRound.updateMany({ where: { matchId: row.matchId }, data: { startedAt: start, endsAt: new Date(start.getTime() + MISSION.durationMs) } });
  await prisma.flightRound.update({ where: { id }, data: { startedAt: start, endsAt: new Date(start.getTime() + MISSION.durationMs), pilotStateJson: run.state as unknown as Prisma.InputJsonValue, pilotInputsJson: run.inputs as Prisma.InputJsonValue } });
  return { run, receipt: await recoverFlight(row.userId, row.id) };
}
async function main() {
  await prisma.flightControl.update({ where: { id: 1 }, data: { houseBalanceCents: 1000000, protectedHouseCents: 0, reservedCents: 0, enabled: true, minStakeCents: 100, maxStakeCents: 10000, houseEdgePpm: 64250 } });
  const ids = ["mission-pilot-a", "mission-pilot-b", "mission-pilot-c"];
  for (const [index, id] of ids.entries()) {
    await prisma.user.create({ data: { id, name: `Mission Pilot ${index + 1}`, email: `mission-pilot-${index + 1}@example.test`, passwordHash: "isolated-fixture-only", emailVerifiedAt: new Date(), tradingProfile: { create: { availableFundsUsdCents: 0 } }, flightPlayer: { create: { verifiedAt: new Date() } } } });
    await acceptFlightRules(id);
    await atomic(tx => creditUserAvailableFunds({ tx, userId: id, creditUsdCents: 20000, reference: `mission-fixture:${id}` }));
  }
  const [a, b, c] = ids;
  const quote = await offerMission(a, 500), privateQuote = await prisma.flightOffer.findUniqueOrThrow({ where: { id: quote.id } });
  check(!["seed", "retainedCents", "houseEdgePpm", "protectedHouseCents", "weather"].some(key => key in quote), "member offer omits seeds, reserve data and operating settings");
  check(missionCommitment(privateQuote.seed, privateQuote.rulesJson, 500, 1000) === quote.commitment, "offer commitment exists before a stake and survives database JSON ordering");
  const beforeBad = await balance(a);
  await assert.rejects(() => startFlight(b, 500, randomUUID(), FLIGHT_TERMS, quote.id, quote.commitment), /Refresh the mission offer/);
  await assert.rejects(() => startFlight(a, 500, randomUUID(), FLIGHT_TERMS, quote.id, "0".repeat(64)), /Refresh the mission offer/);
  await prisma.flightOffer.update({ where: { id: quote.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(() => startFlight(a, 500, randomUUID(), FLIGHT_TERMS, quote.id, quote.commitment), /Refresh the mission offer/);
  check(await balance(a) === beforeBad, "foreign, altered and expired offers never debit a wallet");

  const solo = await launch(a), stored = await prisma.flightRound.findUniqueOrThrow({ where: { id: solo.round.id } });
  check(stored.seed === combinedMissionSeed(stored.missionSeedJson as unknown as SeedContribution[]), "mission randomness combines the precommitted server secret with the player's nonce");
  check(solo.round.engine === 7 && solo.round.mission?.mode === "SOLO" && !("proof" in solo.round), "new flights use objective missions and hide future hazards");
  await assert.rejects(() => pilotFlight(a, stored.id, 1, 400, 0), /open at takeoff/);
  check(await prisma.flightWalletEntry.count({ where: { reference: `flight:${stored.id}:stake` } }) === 1, "preflight control rejection cannot create another charge");
  const start = new Date(Date.now() - 400);
  await prisma.flightRound.update({ where: { id: stored.id }, data: { startedAt: start, endsAt: new Date(start.getTime() + MISSION.durationMs) } });
  await Promise.all(Array.from({ length: 4 }, () => pilotFlight(a, stored.id, 1, 500, 200)));
  const afterInput = await prisma.flightRound.findUniqueOrThrow({ where: { id: stored.id } });
  check((afterInput.pilotInputsJson as unknown as MissionInputLog).length === 1, "concurrent mission input retries record one authoritative input");
  const priorSoloBalance = await balance(a), priorCapital = await capital(), protectedBefore = (await controls()).protectedHouseCents;
  const completed = await finishComputed(stored.id);
  check(completed.receipt.status === "SETTLED" && completed.receipt.mission?.result === (completed.run.state.stop === "LANDED" ? "WIN" : "LOSS"), "the financial result follows the actual mission outcome");
  const expected = completed.run.state.stop === "LANDED" ? solo.offer.prizes.soloCents : 0;
  check(completed.receipt.payoutCents === expected && await balance(a) === priorSoloBalance + expected, "a solo success pays its entire quoted prize without a random monetary multiplier");
  const final = completed.receipt.proof!.finalState as MissionState;
  const replay = replayMission(completed.receipt.proof!.seed, (completed.receipt.proof!.rules as unknown as MissionRules).course, completed.receipt.proof!.inputs as MissionInputLog, final.tick * MISSION.tickMs, (completed.receipt.proof!.rules as unknown as MissionRules).weather);
  assert.deepEqual(replay, final);
  check(await capital() === priorCapital && (await controls()).protectedHouseCents === protectedBefore, "solo settlement conserves total capital and cannot spend protected allocations");
  const retries = await Promise.all(Array.from({ length: 4 }, () => recoverFlight(a, stored.id)));
  check(retries.every(r => r.payoutCents === expected) && await prisma.flightWalletEntry.count({ where: { reference: `flight:${stored.id}:return` } }) === 1, "recovery never pays the mission twice");
  check((await startFlight(a, 500, solo.key, "legacy")).id === stored.id, "a settled request remains recoverable without an unexpired offer");

  // Simultaneous matching: exactly two players share a contest; a third remains solo.
  const first = await launch(a, 300), second = await launch(b, 300), third = await launch(c, 300);
  const ra = await prisma.flightRound.findUniqueOrThrow({ where: { id: first.round.id } }), rb = await prisma.flightRound.findUniqueOrThrow({ where: { id: second.round.id } }), rc = await prisma.flightRound.findUniqueOrThrow({ where: { id: third.round.id } });
  check(!!ra.matchId && ra.matchId === rb.matchId && !rc.matchId && ra.seed === rb.seed && ra.startedAt.getTime() === rb.startedAt.getTime(), "automatic matching pairs two eligible pilots on identical conditions and start time");
  check(await prisma.flightRound.count({ where: { matchId: ra.matchId } }) === 2, "a third entry cannot join an existing two-pilot contest");
  await assert.rejects(() => startFlight(a, 300, randomUUID()), /already have a flight/);
  await abortMission(c, rc.id);
  const waiting = await abortMission(b, rb.id);
  check(waiting.status === "AWAITING_RESULT" && !("proof" in waiting) && waiting.payoutCents === null, "a finished pilot waits without leaking the shared seed or reporting a premature loss");
  await assert.rejects(() => pilotFlight(c, ra.id, 1, 400, 0), /not found/);
  let finished = await finishComputed(ra.id);
  const winner = await prisma.flightRound.findUniqueOrThrow({ where: { id: ra.id } });
  if (finished.run.state.stop === "LANDED") check(winner.payoutCents === first.offer.prizes.contestCents && winner.contestResult === "WIN", "the qualifying pilot wins the paired prize when the opponent failed");
  else check(winner.payoutCents === 0 && winner.contestResult === "BOTH_FAILED", "two failed pilots do not invent a qualifying winner");
  check((await controls()).reservedCents === 0 && (await prisma.flightMatch.findUniqueOrThrow({ where: { id: ra.matchId! } })).status === "SETTLED", "contest settlement releases both reservations and active-account slots");

  // Produce an actual, reproducible qualifying solo flight rather than a fabricated payout.
  for (let attempt = 0; attempt < 12; attempt++) {
    const entry = await launch(a, 400);
    finished = await finishComputed(entry.round.id);
    if (finished.run.state.stop === "LANDED") break;
  }
  check(finished.run.state.stop === "LANDED" && finished.receipt.payoutCents === 500, "a pilot can complete all checkpoints and win the advertised solo prize");

  // Identical legal flight transcripts prove that exact contest draws refund both stakes.
  let drawDone = false;
  for (let attempt = 0; attempt < 12 && !drawDone; attempt++) {
    const x = await launch(a, 200), y = await launch(b, 200), xr = await prisma.flightRound.findUniqueOrThrow({ where: { id: x.round.id } }), yr = await prisma.flightRound.findUniqueOrThrow({ where: { id: y.round.id } });
    assert.equal(xr.matchId, yr.matchId);
    const rules = xr.rulesJson as unknown as MissionRules, run = flyMission(xr.seed, rules);
    if (run.state.stop !== "LANDED") { await abortMission(a, xr.id); await abortMission(b, yr.id); continue; }
    const beforeX = await balance(a), beforeY = await balance(b), beforeProtected = (await controls()).protectedHouseCents, beforeTotal = await capital();
    const at = new Date(Date.now() - run.state.tick * MISSION.tickMs - 1000);
    await prisma.flightRound.updateMany({ where: { matchId: xr.matchId }, data: { startedAt: at, endsAt: new Date(at.getTime() + MISSION.durationMs), pilotStateJson: run.state as unknown as Prisma.InputJsonValue, pilotInputsJson: run.inputs as Prisma.InputJsonValue } });
    const receipts = await Promise.all(Array.from({ length: 5 }, (_, i) => recoverFlight(i % 2 ? a : b, i % 2 ? xr.id : yr.id)));
    check(receipts.every(r => r.mission?.result === "DRAW" && r.payoutCents === 200) && await balance(a) === beforeX + 200 && await balance(b) === beforeY + 200, "an exact qualifying draw returns both stakes exactly once");
    check((await controls()).protectedHouseCents === beforeProtected - xr.operatorMarginCents - yr.operatorMarginCents && await capital() === beforeTotal, "draw allocation reversal is funded and keeps all money conserved");
    check(receipts.every(r => !!r.proof?.contributions && !!r.proof?.opponent), "paired contributions and anonymous replay evidence are revealed only after settlement");
    drawDone = true;
  }
  check(drawDone, "the draw fixture uses a physically successful flight");
  const publicSnapshot = await flightSnapshot(a), serialized = JSON.stringify(publicSnapshot);
  check(!["operatorMarginCents", "protectedHouseCents", "houseEdgePpm"].some(key => serialized.includes(key)), "member snapshots and new mission proofs omit operating-margin fields");
  const control = await controls();
  await assert.rejects(() => prisma.flightControl.update({ where: { id: 1 }, data: { protectedHouseCents: control.houseBalanceCents + 1 } }));
  check(true, "the database rejects using committed or unavailable capital as protected revenue");
  // The first pilot can reserve the whole exposure without preventing a funded pair.
  await prisma.flightControl.update({ where: { id: 1 }, data: { houseBalanceCents: 2000, protectedHouseCents: 0, maxStakeCents: 100 } });
  const limitedA = await launch(a, 100), limitedOffer = await offerMission(b, 100);
  check(limitedOffer.available, "a fully reserved solo flight can still accept its funded matching pilot");
  const limitedB = await startFlight(b, 100, randomUUID(), FLIGHT_TERMS, limitedOffer.id, limitedOffer.commitment);
  const limitedRows = await prisma.flightRound.findMany({ where: { id: { in: [limitedA.round.id, limitedB.id] } } });
  check(!!limitedRows[0].matchId && limitedRows[0].matchId === limitedRows[1].matchId && (await controls()).reservedCents === 200, "paired reservations share one complete prize exposure at the available stake limit");
  await abortMission(a, limitedA.round.id); await abortMission(b, limitedB.id);
  check((await controls()).reservedCents === 0, "failed paired missions release their shared exposure without an underflow");
  console.log(`Completed ${checks} mission integration checks against isolated MariaDB.`);
}
main().finally(() => prisma.$disconnect());
