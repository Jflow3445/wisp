import { AIRCRAFT, clamp, initialAircraft, stepAircraft, type AircraftState, type PilotInput, type Wind } from "./flight-physics";

export const MISSION_ENGINE = 7;
export const MISSION = { version: 1, tickMs: 20, timeScale: 2, durationMs: 60000, maxInputs: 220, inputHoldMs: 1000, engineFaultPerMille: 125, earliestEngineFaultMs: 22000, engineFaultWindowMs: 8000 } as const;
export type FlightGate = { x: number; low: number; high: number };
export type FlightCourse = { gates: FlightGate[]; runwayStart: number; runwayEnd: number };
export type MissionWeather = { horizontal: number; vertical: number; faultPerMille: number; faultEarliestMs: number; faultWindowMs: number };
export const COASTAL_WEATHER: MissionWeather = { horizontal: 12, vertical: 3, faultPerMille: 125, faultEarliestMs: 22000, faultWindowMs: 8000 };
export const TRAINING_COURSE: FlightCourse = {
  gates: [{ x: 1200, low: 150, high: 300 }, { x: 2700, low: 120, high: 240 }, { x: 4200, low: 80, high: 180 }],
  runwayStart: 5700, runwayEnd: 7500,
};
export type MissionStop = "LANDED" | "CRASHED" | "MISSED_GATE" | "OFF_RUNWAY" | "MISSED_RUNWAY" | "TIMEOUT" | "ABORTED";
export type MissionState = {
  version: 2; tick: number; lastInputTick: number; throttle: number; elevator: number;
  aircraft: AircraftState; gate: number; gateAccuracy: number[]; engineOut: boolean; stop: MissionStop | null;
};
export type MissionInputLog = Array<[number, number, number]>;
export function initialMission(): MissionState { return { version: 2, tick: 0, lastInputTick: 0, throttle: .4, elevator: 0, aircraft: initialAircraft(), gate: 0, gateAccuracy: [], engineOut: false, stop: null }; }

export function advanceMission(previous: MissionState, elapsedMs: number, course: FlightCourse, windAt: (ms: number) => Wind, engineFaultAtMs: number | null = null): MissionState {
  const state = { ...previous, gateAccuracy: [...previous.gateAccuracy] };
  const target = Math.floor(clamp(elapsedMs, 0, MISSION.durationMs) / MISSION.tickMs);
  const substeps = MISSION.tickMs / 1000 * MISSION.timeScale / AIRCRAFT.integrationStep;
  while (state.tick < target && !state.stop) {
    state.tick++;
    const ms = state.tick * MISSION.tickMs;
    if (engineFaultAtMs !== null && ms >= engineFaultAtMs) state.engineOut = true;
    const input: PilotInput = { throttle: state.engineOut ? 0 : state.throttle, elevator: (state.tick - state.lastInputTick) * MISSION.tickMs <= MISSION.inputHoldMs ? state.elevator : 0 };
    const wind = windAt(ms);
    for (let n = 0; n < substeps && !state.stop; n++) {
      const before = state.aircraft;
      state.aircraft = stepAircraft(before, input, wind);
      const after = state.aircraft, gate = course.gates[state.gate];
      if (gate && before.x < gate.x && after.x >= gate.x) {
        const fraction = (gate.x - before.x) / (after.x - before.x), altitude = before.y + (after.y - before.y) * fraction;
        if (altitude < gate.low || altitude > gate.high) state.stop = "MISSED_GATE";
        else { state.gate++; state.gateAccuracy.push(Math.round(10000 * (1 - Math.abs(altitude - (gate.low + gate.high) / 2) / ((gate.high - gate.low) / 2)))); }
      }
      if (after.grounded === "CRASHED") state.stop = "CRASHED";
      else if (after.grounded === "LANDED") state.stop = state.gate === course.gates.length && after.x >= course.runwayStart && after.x <= course.runwayEnd ? "LANDED" : "OFF_RUNWAY";
      else if (after.x > course.runwayEnd) state.stop = "MISSED_RUNWAY";
    }
  }
  if (!state.stop && elapsedMs >= MISSION.durationMs) state.stop = "TIMEOUT";
  return state;
}

export function missionObjective(state: MissionState, course: FlightCourse) {
  const gate = course.gates[state.gate];
  return gate
    ? { phase: "CHECKPOINT" as const, number: state.gate + 1, distance: Math.max(0, Math.round(gate.x - state.aircraft.x)), low: gate.low, high: gate.high }
    : { phase: "LANDING" as const, number: state.gate + 1, distance: Math.max(0, Math.round(course.runwayStart - state.aircraft.x)), low: 0, high: 4 };
}
export function missionScore(state: MissionState) {
  if (state.stop !== "LANDED") return 0;
  const accuracy = state.gateAccuracy.reduce((sum, value) => sum + value, 0) / Math.max(1, state.gateAccuracy.length);
  const softness = clamp(1 - Math.abs(state.aircraft.vy) / 4, 0, 1);
  return Math.round(accuracy * .5 + softness * 3000 + state.aircraft.integrityBp * .2);
}
export const MISSION_OUTCOMES: Record<MissionStop, string> = {
  LANDED: "Mission complete — safe landing", CRASHED: "Aircraft crashed", MISSED_GATE: "Checkpoint missed", OFF_RUNWAY: "Landed outside the runway",
  MISSED_RUNWAY: "Runway missed", TIMEOUT: "Landing deadline missed", ABORTED: "Mission abandoned",
};
