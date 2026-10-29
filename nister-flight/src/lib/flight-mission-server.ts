import { createHash, createHmac } from "node:crypto";
import { AIRCRAFT } from "./flight-physics";
import { advanceMission, COASTAL_WEATHER, initialMission, MISSION, MISSION_ENGINE, type FlightCourse, type MissionInputLog, type MissionWeather } from "./flight-mission";
import { TRAINING_COURSE } from "./flight-mission";
import { missionPrice, type MissionPrizes } from "./flight-mission-economy";

export type MissionRules = { version: 1; course: FlightCourse; prizes: MissionPrizes; weather: MissionWeather };
export const missionRules = (stake: number, operatorPpm: number, weather = COASTAL_WEATHER): MissionRules => ({ version: 1, course: TRAINING_COURSE, prizes: missionPrice(stake, operatorPpm).prizes, weather });
export function weatherForReserve(control: { houseBalanceCents: number; protectedHouseCents: number; reservedCents: number; launchReserveCents: number }): MissionWeather {
  const ratio = Math.max(0, control.houseBalanceCents - control.protectedHouseCents - control.reservedCents) / Math.max(1, control.launchReserveCents);
  if (ratio < .5) return { horizontal: 32, vertical: 12, faultPerMille: 300, faultEarliestMs: 20000, faultWindowMs: 10000 };
  if (ratio < .75) return { horizontal: 22, vertical: 6, faultPerMille: 200, faultEarliestMs: 22000, faultWindowMs: 8000 };
  return COASTAL_WEATHER;
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function missionWind(seed: string, ms: number, weather = COASTAL_WEATHER) {
  const bucket = Math.floor(ms / 2500), fraction = ms % 2500 / 2500, blend = fraction * fraction * (3 - 2 * fraction);
  const sample = (n: number) => { const hash = createHmac("sha256", seed).update(`mission-weather:v1:${n}`).digest(); return { x: (hash.readUInt16BE(0) / 65535 - .5) * weather.horizontal, y: (hash.readUInt16BE(2) / 65535 - .5) * weather.vertical }; };
  const a = sample(bucket), b = sample(bucket + 1);
  return { x: a.x + (b.x - a.x) * blend, y: a.y + (b.y - a.y) * blend };
}
export function missionEngineFault(seed: string, weather = COASTAL_WEATHER) {
  const bytes = createHmac("sha256", seed).update("mission-components:v1").digest();
  return bytes.readUInt32BE(0) % 1000 < weather.faultPerMille ? weather.faultEarliestMs + bytes.readUInt32BE(4) % weather.faultWindowMs : null;
}
export type SeedContribution = { serverSeed: string; clientNonce: string; commitment: string };
export function combinedMissionSeed(contributions: SeedContribution[]) {
  return createHash("sha256").update(canonicalJson(contributions.toSorted((a, b) => a.commitment < b.commitment ? -1 : a.commitment > b.commitment ? 1 : 0))).digest("hex");
}
export function missionCommitment(seed: string, rules: unknown, stake: number, cap: number) {
  return createHash("sha256").update(canonicalJson({ engine: MISSION_ENGINE, seed, rules, stake, cap, aircraft: AIRCRAFT, mission: MISSION })).digest("hex");
}
export function replayMission(seed: string, course: FlightCourse, log: MissionInputLog, untilMs: number = MISSION.durationMs, weather = COASTAL_WEATHER) {
  let state = initialMission();
  for (const [tick, throttle, elevator] of log) {
    if (tick * MISSION.tickMs > untilMs) break;
    state = advanceMission(state, tick * MISSION.tickMs, course, ms => missionWind(seed, ms, weather), missionEngineFault(seed, weather));
    if (state.stop) break;
    state.throttle = throttle / 1000; state.elevator = elevator / 1000; state.lastInputTick = state.tick;
  }
  return advanceMission(state, untilMs, course, ms => missionWind(seed, ms, weather), missionEngineFault(seed, weather));
}
