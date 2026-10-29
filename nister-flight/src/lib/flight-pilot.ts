import { createHash, createHmac } from "node:crypto";
import { AIRCRAFT, clamp, conditionBps, conditionedReturn, initialAircraft, stepAircraft, type AircraftState, type PilotInput } from "./flight-physics";
import { currentStep, type FlightPath, type FlightRules } from "./flight-math";

export const PILOT_ENGINE = 6;
export type PilotLog = Array<[number, number, number]>; // server tick, throttle/1000, elevator/1000; sequence is index+1
export type PilotState = { version: 1; tick: number; lastInputTick: number; throttle: number; elevator: number; aircraft: AircraftState; stop: null | "LANDED" | "CRASHED" | "TURBULENCE" | "COMPLETE" };
export function initialPilot(): PilotState { return { version: 1, tick: 0, lastInputTick: 0, throttle: .4, elevator: 0, aircraft: initialAircraft(), stop: null }; }
export function pilotCommitment(seed: string, rules: FlightRules, stake: number, cap: number) {
  return createHash("sha256").update(JSON.stringify({ engine: PILOT_ENGINE, seed, rules, stake, cap, aircraft: AIRCRAFT })).digest("hex");
}
export function pilotCollectId(seed: string, roundId: string) { return createHmac("sha256", seed).update(`pilot-collect:v1:${roundId}`).digest("hex").slice(0, 32); }
export function pilotWind(seed: string, elapsedMs: number) {
  const bucket = Math.floor(elapsedMs / 1500), fraction = (elapsedMs % 1500) / 1500, blend = fraction * fraction * (3 - 2 * fraction);
  const value = (n: number) => {
    const hash = createHmac("sha256", seed).update(`air:v1:${n}`).digest();
    return { x: (hash.readUInt16BE(0) / 65535 - .5) * 14, y: (hash.readUInt16BE(2) / 65535 - .5) * 5 };
  };
  const a = value(bucket), b = value(bucket + 1);
  return { x: a.x + (b.x - a.x) * blend, y: a.y + (b.y - a.y) * blend };
}
export function advancePilot(previous: PilotState, elapsedMs: number, durationMs: number, path: FlightPath, seed: string): PilotState {
  const state: PilotState = { ...previous };
  const target = Math.floor(clamp(elapsedMs, 0, durationMs) / AIRCRAFT.realStepMs);
  const substeps = Math.round(AIRCRAFT.realStepMs / 1000 * AIRCRAFT.timeScale / AIRCRAFT.integrationStep);
  while (state.tick < target && !state.stop) {
    state.tick++;
    const ms = state.tick * AIRCRAFT.realStepMs;
    if (path.path[currentStep(path.offsets, ms)] === 0) { state.stop = "TURBULENCE"; break; }
    const wind = pilotWind(seed, ms);
    const input: PilotInput = { throttle: state.throttle, elevator: (state.tick - state.lastInputTick) * AIRCRAFT.realStepMs <= AIRCRAFT.inputHoldMs ? state.elevator : 0 };
    for (let n = 0; n < substeps; n++) {
      state.aircraft = stepAircraft(state.aircraft, input, wind);
      if (state.aircraft.grounded !== "AIRBORNE") { state.stop = state.aircraft.grounded; break; }
    }
  }
  if (!state.stop && path.path[currentStep(path.offsets, Math.max(0, elapsedMs))] === 0) state.stop = "TURBULENCE";
  if (!state.stop && elapsedMs >= durationMs) state.stop = "COMPLETE";
  return state;
}
export function pilotValue(state: PilotState, path: FlightPath) {
  if (state.stop === "TURBULENCE" || state.stop === "CRASHED") return 0;
  return conditionedReturn(path.path[currentStep(path.offsets, state.tick * AIRCRAFT.realStepMs)], state.aircraft);
}
export function pilotView(state: PilotState, sequence: number) {
  return { ...state.aircraft, tick: state.tick, conditionBps: conditionBps(state.aircraft), throttle: state.throttle, elevator: state.elevator, lastSeq: sequence, stop: state.stop, timeScale: AIRCRAFT.timeScale };
}
export function replayPilot(seed: string, durationMs: number, path: FlightPath, log: PilotLog, untilMs = durationMs) {
  let state = initialPilot();
  for (const [tick, throttle, elevator] of log) {
    if (tick * AIRCRAFT.realStepMs > untilMs) break;
    state = advancePilot(state, tick * AIRCRAFT.realStepMs, durationMs, path, seed);
    if (state.stop) break;
    state.throttle = throttle / 1000; state.elevator = elevator / 1000; state.lastInputTick = state.tick;
  }
  return advancePilot(state, untilMs, durationMs, path, seed);
}
