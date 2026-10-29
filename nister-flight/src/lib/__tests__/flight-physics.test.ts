import assert from "node:assert/strict";
import { test } from "node:test";
import { AIRCRAFT, aircraftForces, airDensity, conditionBps, conditionedReturn, initialAircraft, stepAircraft } from "../flight-physics";
import { advancePilot, initialPilot, pilotCommitment, pilotValue, replayPilot, type PilotLog } from "../flight-pilot";
import { DEFAULT_RULES, generateFlight, seededRandom, type FlightPath } from "../flight-math";

const path: FlightPath = { path: Array(9).fill(500), offsets: Array.from({ length: 9 }, (_, n) => n * 3000) };
test("aerodynamic forces follow relative airflow, pitch and gravity", () => {
  const state = initialAircraft(), input = { throttle: .4, elevator: 0 }, wind = { x: 7, y: 2 };
  const { forces } = aircraftForces(state, input, wind), ax = state.vx - wind.x, ay = state.vy - wind.y;
  assert.ok(Math.abs(forces.lift.x * ax + forces.lift.y * ay) < 1e-7);
  assert.ok(forces.drag.x * ax + forces.drag.y * ay < 0);
  assert.equal(forces.weight.y, -AIRCRAFT.mass * AIRCRAFT.gravity);
  assert.equal(forces.weight.x, 0);
  assert.ok(Math.abs(Math.atan2(forces.thrust.y, forces.thrust.x) - state.pitch) < 1e-10);
  assert.ok(airDensity(3000) < airDensity(0));
  assert.ok(aircraftForces(state, { ...input, throttle: 1 }, wind).forces.thrust.x > forces.thrust.x);
});
test("stall reduces useful lift, increases drag and damages condition", () => {
  const state = { ...initialAircraft(), pitch: .55 }, input = { throttle: .4, elevator: 1 }, wind = { x: 0, y: 0 };
  const normal = aircraftForces(initialAircraft(), input, wind), stalled = aircraftForces(state, input, wind);
  assert.ok(stalled.stalled);
  assert.ok(Math.hypot(stalled.forces.drag.x, stalled.forces.drag.y) > Math.hypot(normal.forces.drag.x, normal.forces.drag.y));
  const next = stepAircraft(state, input, wind);
  assert.ok(next.integrityBp < state.integrityBp && conditionBps(next) < conditionBps(state));
});
test("piloting changes real motion and the cash condition factor", () => {
  const fly = (elevator: number) => {
    let state = initialPilot();
    for (let ms = 0; ms < 12000 && !state.stop; ms += 300) {
      state = advancePilot(state, ms, 24000, path, "probe-seed");
      state.elevator = elevator; state.lastInputTick = state.tick;
    }
    return advancePilot(state, 12000, 24000, path, "probe-seed");
  };
  const neutral = fly(0), climb = fly(.35), dive = fly(-.35);
  assert.ok(climb.aircraft.y > neutral.aircraft.y + 100);
  assert.notEqual(pilotValue(neutral, path), pilotValue(climb, path));
  assert.equal(dive.stop, "CRASHED"); assert.equal(pilotValue(dive, path), 0);
});
test("server-timestamped controls replay exactly regardless of polling partitions", () => {
  const log: PilotLog = [[10, 600, 350], [30, 500, -350], [50, 400, 0], [72, 350, 200]];
  let state = initialPilot();
  for (const [tick, throttle, elevator] of log) {
    for (let ms = state.tick * 20; ms < tick * 20; ms += 40) state = advancePilot(state, ms, 24000, path, "replay");
    state = advancePilot(state, tick * 20, 24000, path, "replay");
    state.throttle = throttle / 1000; state.elevator = elevator / 1000; state.lastInputTick = state.tick;
  }
  state = advancePilot(state, 24000, 24000, path, "replay");
  assert.deepEqual(replayPilot("replay", 24000, path, log), state);
  assert.equal(pilotCommitment("replay", DEFAULT_RULES, 500, 1000), pilotCommitment("replay", DEFAULT_RULES, 500, 1000));
  assert.notEqual(pilotCommitment("replay", DEFAULT_RULES, 500, 1000), pilotCommitment("other", DEFAULT_RULES, 500, 1000));
});
test("missing control heartbeat returns elevator to neutral after one second", () => {
  const a = initialPilot(); a.elevator = .35;
  let neutral = advancePilot(a, 1000, 24000, path, "heartbeat");
  neutral.elevator = 0;
  assert.deepEqual(advancePilot(a, 3000, 24000, path, "heartbeat").aircraft, advancePilot(neutral, 3000, 24000, path, "heartbeat").aircraft);
});

test("all persisted physics values survive database JSON precision exactly", () => {
  const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "number" ? Number(item.toPrecision(15)) : item));
  assert.deepEqual(roundTrip(initialPilot()), initialPilot());
  const state = advancePilot(initialPilot(), 5800, 24000, path, "json-precision");
  assert.deepEqual(roundTrip(state), state);
  assert.deepEqual(advancePilot(roundTrip(state), 10000, 24000, path, "json-precision"), advancePilot(state, 10000, 24000, path, "json-precision"));
});
test("safe contact lands, a hard impact crashes, and ground state stays terminal", () => {
  const state = { ...initialAircraft(), y: .001, vy: -1, pitch: .02 };
  const landed = stepAircraft(state, { throttle: 0, elevator: 0 }, { x: 0, y: 0 });
  const crashed = stepAircraft({ ...state, vy: -20 }, { throttle: 0, elevator: 0 }, { x: 0, y: 0 });
  assert.equal(landed.grounded, "LANDED"); assert.equal(crashed.grounded, "CRASHED");
  assert.equal(conditionedReturn(500, crashed), 0);
  assert.deepEqual(stepAircraft(crashed, { throttle: 1, elevator: 1 }, { x: 4, y: 3 }), crashed);
});
test("all control extremes stay finite and cannot exceed the funded random return", () => {
  for (let seed = 0; seed < 32; seed++) for (const elevator of [-1, 0, 1]) {
    const rules = { ...DEFAULT_RULES, stepMs: 3000 }, randomPath = generateFlight(500, 1000, rules, seededRandom(String(seed)));
    const log: PilotLog = Array.from({ length: 70 }, (_, n) => [n * 15, seed % 2 ? 1000 : 0, elevator * 1000]);
    const state = replayPilot(String(seed), 24000, randomPath, log);
    const payout = pilotValue(state, randomPath);
    assert.ok(Number.isFinite(state.aircraft.y) && Number.isInteger(payout) && payout >= 0 && payout <= 1000);
    assert.ok(conditionBps(state.aircraft) <= 10000);
    assert.ok(conditionedReturn(1000, state.aircraft) <= 1000);
  }
  assert.throws(() => stepAircraft(initialAircraft(), { throttle: NaN, elevator: 0 }, { x: 0, y: 0 }));
});
