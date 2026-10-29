import assert from "node:assert/strict";
import test from "node:test";
import { advanceMission, initialMission, MISSION, missionScore, TRAINING_COURSE, type MissionState } from "../flight-mission";
import { canonicalJson, combinedMissionSeed, missionCommitment, missionEngineFault, missionRules, missionWind, replayMission, weatherForReserve } from "../flight-mission-server";
import { contestOutcome, missionPrice } from "../flight-mission-economy";
import { effectiveStakeLimit } from "../flight-economy";

const calm = () => ({ x: 0, y: 0 });
function landed(scoreOffset = 0): MissionState { const state = initialMission(); return { ...state, stop: "LANDED", gate: 3, gateAccuracy: [7000 + scoreOffset, 7000, 7000], aircraft: { ...state.aircraft, x: 6300, y: 0, vy: -1, grounded: "LANDED" } }; }

test("a mission can pay a winning prize only after a physical landing", () => {
  const price = missionPrice(500, 64250);
  assert.equal(price.prizes.soloCents, 625); assert.equal(price.charge.totalCents, 515);
  assert.ok(price.prizes.soloCents > price.charge.totalCents);
  const state = initialMission(); assert.equal(missionScore(state), 0);
  assert.ok(missionScore(landed()) > 0);
  const timed = advanceMission(state, MISSION.durationMs, TRAINING_COURSE, calm);
  assert.notEqual(timed.stop, "LANDED");
});
test("missed checkpoint and off-runway contact have explicit physical causes", () => {
  const state = initialMission();
  state.aircraft = { ...state.aircraft, x: 1199, y: 400 };
  assert.equal(advanceMission(state, 20, TRAINING_COURSE, calm).stop, "MISSED_GATE");
  state.aircraft = { ...state.aircraft, x: 6000, y: .001, vy: -1, pitch: .02 };
  state.gate = 3;
  assert.equal(advanceMission(state, 20, TRAINING_COURSE, calm).stop, "LANDED");
  state.aircraft.x = 5200;
  assert.equal(advanceMission(state, 20, TRAINING_COURSE, calm).stop, "OFF_RUNWAY");
});
test("engine failure removes thrust without inventing a crash or financial loss", () => {
  const normal = advanceMission(initialMission(), 1000, TRAINING_COURSE, calm);
  const failed = advanceMission(initialMission(), 1000, TRAINING_COURSE, calm, 20);
  assert.equal(failed.engineOut, true); assert.equal(failed.aircraft.forces.thrust.x, 0);
  assert.ok(normal.aircraft.forces.thrust.x > 0);
  assert.equal(failed.stop, null); assert.equal(failed.aircraft.grounded, "AIRBORNE");
});
test("paired contests use qualifying landings, score, exact draws and funded prizes", () => {
  const a = landed(1000), b = landed(), failed = { ...initialMission(), stop: "CRASHED" as const };
  assert.deepEqual(contestOutcome(a, b, 500, 936), { a: 936, b: 0, aResult: "WIN", bResult: "LOSS", refundAllocation: false });
  assert.equal(contestOutcome(b, failed, 500, 936).a, 936);
  assert.deepEqual(contestOutcome(b, b, 500, 936), { a: 500, b: 500, aResult: "DRAW", bResult: "DRAW", refundAllocation: true });
  assert.equal(contestOutcome(failed, failed, 500, 936).a + contestOutcome(failed, failed, 500, 936).b, 0);
  assert.throws(() => contestOutcome(initialMission(), b, 500, 936));
});
test("prizes never exceed their funded caps or label a net loss as a win", () => {
  for (const stake of [2, 3, 5, 99, 100, 500, 10000, 1000000]) for (const ppm of [0, 64250, 200000, 500000]) {
    const p = missionPrice(stake, ppm);
    assert.ok(p.retainedCents >= 0 && p.retainedCents <= stake);
    assert.ok(p.prizes.soloCents > p.charge.totalCents && p.prizes.soloCents <= 2 * stake);
    if (p.prizes.contestCents !== null) assert.ok(p.prizes.contestCents > p.charge.totalCents && p.prizes.contestCents <= 2 * (stake - p.retainedCents));
  }
  assert.throws(() => missionPrice(1, 64250));
});
test("even a perfect pilot cannot spend protected operating revenue", () => {
  let treasury = 10000, protectedCents = 0, paid = 0;
  const p = missionPrice(100, 64250);
  for (let n = 0; n < 10000; n++) {
    if (effectiveStakeLimit({ houseBalanceCents: treasury, protectedHouseCents: protectedCents, reservedCents: 0, maxStakeCents: 10000 }) < 100) break;
    treasury += 100; protectedCents += p.retainedCents;
    assert.ok(treasury - protectedCents >= 200);
    treasury -= p.prizes.soloCents; paid += p.prizes.soloCents;
    assert.ok(treasury >= protectedCents);
  }
  assert.ok(paid > 0 && protectedCents > 0);
  assert.equal(effectiveStakeLimit({ houseBalanceCents: treasury, protectedHouseCents: protectedCents, reservedCents: 0, maxStakeCents: 10000 }) < 100, true);
});
test("contests cannot drain prize capital for any winning or tying policy", () => {
  const p = missionPrice(500, 64250), stake = 500;
  for (const [a, b] of [[landed(1000), landed()], [landed(), landed()], [landed(), { ...initialMission(), stop: "CRASHED" as const }], [{ ...initialMission(), stop: "CRASHED" as const }, { ...initialMission(), stop: "CRASHED" as const }]]) {
    const result = contestOutcome(a, b, stake, p.prizes.contestCents!);
    const held = result.refundAllocation ? 0 : 2 * p.retainedCents;
    assert.ok(2 * stake - result.a - result.b >= held);
  }
});
test("commitments and combined weather are stable under JSON and contribution ordering", () => {
  const rules = missionRules(500, 64250), reversed = Object.fromEntries(Object.entries(rules).reverse());
  assert.equal(missionCommitment("secret", rules, 500, 1000), missionCommitment("secret", reversed, 500, 1000));
  assert.notEqual(missionCommitment("secret", rules, 500, 1000), missionCommitment("different", rules, 500, 1000));
  const a = { serverSeed: "a", clientNonce: "one", commitment: "123" }, b = { serverSeed: "b", clientNonce: "two", commitment: "456" };
  assert.equal(combinedMissionSeed([a, b]), combinedMissionSeed([b, a]));
  assert.notEqual(combinedMissionSeed([a]), combinedMissionSeed([{ ...a, clientNonce: "different" }]));
  assert.equal(canonicalJson(rules), canonicalJson(reversed));
});
test("adaptive conditions are fixed through the committed rules and replay", () => {
  const normal = weatherForReserve({ houseBalanceCents: 10000, protectedHouseCents: 0, reservedCents: 0, launchReserveCents: 10000 });
  const hard = weatherForReserve({ houseBalanceCents: 10000, protectedHouseCents: 6000, reservedCents: 0, launchReserveCents: 10000 });
  assert.ok(hard.horizontal > normal.horizontal && hard.faultPerMille > normal.faultPerMille);
  const inputs: Array<[number, number, number]> = [[1, 500, 200], [50, 400, -200], [100, 400, 0]];
  const replay = replayMission("replay-mission", TRAINING_COURSE, inputs, 5000, normal);
  assert.deepEqual(replay, replayMission("replay-mission", TRAINING_COURSE, inputs, 5000, normal));
  assert.equal(missionEngineFault("same-seed", normal), missionEngineFault("same-seed", normal));
  assert.deepEqual(missionWind("same-seed", 1000, normal), missionWind("same-seed", 1000, normal));
});
