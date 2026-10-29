// Versioned, fixed-step light-aircraft model. World coordinates are metres,
// seconds, kilograms and newtons; +y is up. No financial randomness lives here.
// Force directions: https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/four-forces-on-an-airplane/
export const AIRCRAFT = {
  version: 1, mass: 1800, wingArea: 16, chord: 1.4, inertia: 8000,
  gravity: 9.80665, seaDensity: 1.225, densityHeight: 8500,
  cl0: .22, clAlpha: 5.4, clMax: 1.35, stallAngle: Math.PI / 12,
  cd0: .032, inducedDrag: .06, maxThrust: 5200,
  cmElevator: .035, cmAlpha: .2, cmDamping: 15,
  realStepMs: 20, timeScale: 6, integrationStep: .02, inputHoldMs: 1000,
} as const;
export type PilotInput = { throttle: number; elevator: number };
export type Wind = { x: number; y: number };
export type Vector = { x: number; y: number };
export type AircraftForces = { lift: Vector; drag: Vector; thrust: Vector; weight: Vector };
export type AircraftState = {
  x: number; y: number; vx: number; vy: number; pitch: number; omega: number;
  integrityBp: number; quality: number; airspeed: number; aoa: number;
  stalled: boolean; grounded: "AIRBORNE" | "LANDED" | "CRASHED";
  forces: AircraftForces; wind: Wind;
};
export const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
const quantize = (value: number) => Math.round(value * 1e6) / 1e6;
const vector = (value: Vector) => ({ x: quantize(value.x), y: quantize(value.y) });
const zero = (): Vector => ({ x: 0, y: 0 });
export function initialAircraft(): AircraftState {
  const vx = 70, vy = -2, q = .5 * AIRCRAFT.seaDensity * vx * vx;
  const trim = (AIRCRAFT.mass * AIRCRAFT.gravity / (q * AIRCRAFT.wingArea) - AIRCRAFT.cl0) / AIRCRAFT.clAlpha;
  const state: AircraftState = { x: 0, y: 220, vx, vy, pitch: quantize(Math.atan2(vy, vx) + trim), omega: 0,
    integrityBp: 10000, quality: 1, airspeed: quantize(Math.hypot(vx, vy)), aoa: quantize(trim),
    stalled: false, grounded: "AIRBORNE", forces: { lift: zero(), drag: zero(), thrust: zero(), weight: { x: 0, y: quantize(-AIRCRAFT.mass * AIRCRAFT.gravity) } }, wind: zero() };
  const f = aircraftForces(state, { throttle: .4, elevator: 0 }, zero()).forces;
  return { ...state, forces: { lift: vector(f.lift), drag: vector(f.drag), thrust: vector(f.thrust), weight: vector(f.weight) } };
}
export function airDensity(altitude: number) { return AIRCRAFT.seaDensity * Math.exp(-Math.max(0, altitude) / AIRCRAFT.densityHeight); }
function angle(value: number) { return Math.atan2(Math.sin(value), Math.cos(value)); }
export function aircraftForces(state: AircraftState, input: PilotInput, wind: Wind) {
  const ax = state.vx - wind.x, ay = state.vy - wind.y;
  const speed = Math.max(.1, Math.hypot(ax, ay)), ux = ax / speed, uy = ay / speed;
  const aoa = angle(state.pitch - Math.atan2(ay, ax)), density = airDensity(state.y), q = .5 * density * speed * speed;
  const abs = Math.abs(aoa), stalled = abs > AIRCRAFT.stallAngle;
  const cl = stalled
    ? clamp(AIRCRAFT.clMax * Math.sin(2 * aoa) / Math.sin(2 * AIRCRAFT.stallAngle) * Math.exp(-5 * (abs - AIRCRAFT.stallAngle)), -AIRCRAFT.clMax, AIRCRAFT.clMax)
    : clamp(AIRCRAFT.cl0 + AIRCRAFT.clAlpha * aoa, -AIRCRAFT.clMax, AIRCRAFT.clMax);
  const cd = AIRCRAFT.cd0 + AIRCRAFT.inducedDrag * cl * cl + (stalled ? .55 * Math.sin(aoa) ** 2 : 0);
  const liftN = q * AIRCRAFT.wingArea * cl, dragN = q * AIRCRAFT.wingArea * cd;
  const thrustN = AIRCRAFT.maxThrust * clamp(input.throttle, 0, 1) * Math.sqrt(density / AIRCRAFT.seaDensity);
  const trimQ = .5 * AIRCRAFT.seaDensity * 70 ** 2;
  const trim = (AIRCRAFT.mass * AIRCRAFT.gravity / (trimQ * AIRCRAFT.wingArea) - AIRCRAFT.cl0) / AIRCRAFT.clAlpha;
  const moment = q * AIRCRAFT.wingArea * AIRCRAFT.chord * (AIRCRAFT.cmElevator * clamp(input.elevator, -1, 1) - AIRCRAFT.cmAlpha * (aoa - trim) - AIRCRAFT.cmDamping * state.omega * AIRCRAFT.chord / (2 * speed));
  return { speed, aoa, stalled, moment, forces: {
    lift: { x: -uy * liftN, y: ux * liftN }, drag: { x: -ux * dragN, y: -uy * dragN },
    thrust: { x: Math.cos(state.pitch) * thrustN, y: Math.sin(state.pitch) * thrustN },
    weight: { x: 0, y: -AIRCRAFT.mass * AIRCRAFT.gravity },
  } };
}
export function stepAircraft(state: AircraftState, input: PilotInput, wind: Wind, dt: number = AIRCRAFT.integrationStep): AircraftState {
  if (state.grounded !== "AIRBORNE") return state;
  if (!Number.isFinite(dt) || dt <= 0 || dt > .05 || ![input.throttle, input.elevator, wind.x, wind.y].every(Number.isFinite)) throw new Error("Invalid aircraft integration input.");
  const data = aircraftForces(state, input, wind), f = data.forces;
  const vx = clamp(state.vx + (f.lift.x + f.drag.x + f.thrust.x + f.weight.x) / AIRCRAFT.mass * dt, -100, 220);
  const vy = clamp(state.vy + (f.lift.y + f.drag.y + f.thrust.y + f.weight.y) / AIRCRAFT.mass * dt, -100, 100);
  const omega = clamp(state.omega + data.moment / AIRCRAFT.inertia * dt, -1.5, 1.5);
  const pitch = clamp(state.pitch + omega * dt, -Math.PI * .31, Math.PI * .31);
  const load = Math.hypot(f.lift.x, f.lift.y) / (AIRCRAFT.mass * AIRCRAFT.gravity);
  const speedScore = clamp(1 - Math.abs(data.speed - 72) / 60, 0, 1);
  const alphaScore = clamp(1 - Math.abs(data.aoa - .027) / AIRCRAFT.stallAngle, 0, 1);
  const loadScore = clamp(1 - Math.abs(load - 1) / 2, 0, 1);
  const descentScore = clamp(1 - Math.abs(vy + 2) / 20, 0, 1);
  const target = (speedScore * .35 + alphaScore * .3 + loadScore * .2 + descentScore * .15) * (data.stalled ? .35 : 1);
  const quality = clamp(state.quality + (target - state.quality) * (1 - Math.exp(-dt / 5)), 0, 1);
  const damage = (Math.max(0, load - 3) * 2 + (data.stalled ? .5 : 0)) * dt * 100;
  let integrityBp = clamp(Math.round(state.integrityBp - damage), 0, 10000);
  let y = state.y + vy * dt, grounded: AircraftState["grounded"] = "AIRBORNE";
  if (y <= 0 || integrityBp === 0) {
    y = Math.max(0, y);
    grounded = integrityBp > 0 && data.speed < 90 && Math.abs(vy) <= 4 && Math.abs(pitch) < Math.PI / 12 ? "LANDED" : "CRASHED";
    if (grounded === "CRASHED") integrityBp = 0;
  }
  const next = { x: quantize(state.x + vx * dt), y: quantize(y), vx: quantize(vx), vy: quantize(vy), pitch: quantize(pitch), omega: quantize(omega),
    integrityBp, quality: quantize(quality), airspeed: quantize(data.speed), aoa: quantize(data.aoa), stalled: data.stalled, grounded,
    forces: { lift: vector(f.lift), drag: vector(f.drag), thrust: vector(f.thrust), weight: vector(f.weight) }, wind: vector(wind) };
  if (![next.x, next.y, next.vx, next.vy, next.pitch, next.quality].every(Number.isFinite)) throw new Error("Aircraft state is invalid.");
  return next;
}
export function conditionBps(state: AircraftState) {
  if (state.grounded === "CRASHED") return 0;
  return clamp(Math.round((3500 + 6500 * state.quality) * state.integrityBp / 10000), 0, 10000);
}
export function conditionedReturn(baseCents: number, state: AircraftState) {
  if (!Number.isSafeInteger(baseCents) || baseCents < 0) throw new Error("Invalid flight return.");
  return Math.floor(baseCents * conditionBps(state) / 10000);
}
