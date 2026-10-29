// Feedback controller for isolated tests and reserve stress simulations only.
// The application never imports this controller or chooses players' outcomes.
import { AIRCRAFT, airDensity, clamp, type AircraftState } from "../src/lib/flight-physics";
import { advanceMission, initialMission, MISSION, type MissionInputLog, type MissionState } from "../src/lib/flight-mission";
import { missionEngineFault, missionWind, type MissionRules } from "../src/lib/flight-mission-server";

export function missionControls(a: AircraftState) {
  const points = [[0, 220], [1200, 205], [2700, 160], [4200, 100], [6200, 0], [7500, 0]];
  let index = 0;
  while (index + 2 < points.length && a.x > points[index + 1][0]) index++;
  const [x0, y0] = points[index], [x1, y1] = points[index + 1];
  const target = y0 + (y1 - y0) * clamp((a.x - x0) / (x1 - x0), 0, 1);
  let desiredVy = clamp((target - a.y) * .25 + (y1 - y0) / (x1 - x0) * a.vx, -4, 5);
  if (a.y < 12 && a.x > 5700) desiredVy = -1.2;
  const speed = Math.max(20, a.airspeed), q = .5 * airDensity(a.y) * speed * speed;
  const trim = (AIRCRAFT.mass * AIRCRAFT.gravity / (.5 * AIRCRAFT.seaDensity * 70 * 70 * AIRCRAFT.wingArea) - AIRCRAFT.cl0) / AIRCRAFT.clAlpha;
  const lift = AIRCRAFT.mass * (AIRCRAFT.gravity + (desiredVy - a.vy) * .6);
  const alpha = clamp((lift / (q * AIRCRAFT.wingArea) - AIRCRAFT.cl0) / AIRCRAFT.clAlpha, -.12, .15);
  const pitch = Math.atan2(a.vy - a.wind.y, a.vx - a.wind.x) + alpha;
  const moment = AIRCRAFT.inertia * ((pitch - a.pitch) * 2.5 - a.omega * 2);
  const elevator = clamp((moment / (q * AIRCRAFT.wingArea * AIRCRAFT.chord) + AIRCRAFT.cmAlpha * (a.aoa - trim) + AIRCRAFT.cmDamping * a.omega * AIRCRAFT.chord / (2 * speed)) / AIRCRAFT.cmElevator, -1, 1);
  return { throttle: Math.round(clamp(.38 + (70 - speed) * .025, 0, 1) * 100) * 10, elevator: Math.round(elevator * 100) * 10 };
}
export function flyMission(seed: string, rules: MissionRules, initial = initialMission(), inputs: MissionInputLog = []) {
  let state: MissionState = { ...initial };
  const log = [...inputs], start = state.tick * MISSION.tickMs;
  for (let ms = start; ms <= MISSION.durationMs && !state.stop; ms += 330) {
    state = advanceMission(state, ms, rules.course, time => missionWind(seed, time, rules.weather), missionEngineFault(seed, rules.weather));
    if (state.stop) break;
    const controls = missionControls(state.aircraft);
    log.push([state.tick, controls.throttle, controls.elevator]);
    state.throttle = controls.throttle / 1000; state.elevator = controls.elevator / 1000; state.lastInputTick = state.tick;
  }
  state = advanceMission(state, MISSION.durationMs, rules.course, time => missionWind(seed, time, rules.weather), missionEngineFault(seed, rules.weather));
  return { state, inputs: log };
}
