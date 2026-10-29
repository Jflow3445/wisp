import assert from "node:assert/strict";
import test from "node:test";
import { canObserveRound } from "../flight-observation";
const flying = { id: "new", status: "FLYING", startedAt: "2026-10-29T12:00:01Z", serverNow: "2026-10-29T12:00:02Z" };
test("a delayed preflight snapshot never overwrites an accepted takeoff", () => {
  assert.equal(canObserveRound(flying, undefined), false);
  assert.equal(canObserveRound(flying, { ...flying, id: "old", startedAt: "2026-10-29T11:00:00Z", serverNow: "2026-10-29T12:00:03Z" }), false);
});
test("settled receipts take precedence over overlapping active snapshots", () => {
  const settled = { ...flying, status: "COLLECTED", serverNow: "2026-10-29T12:00:01Z" };
  assert.ok(canObserveRound(flying, settled));
  assert.equal(canObserveRound(settled, { ...flying, serverNow: "2026-10-29T12:00:03Z" }), false);
});
test("live offers and later flights advance without moving backwards", () => {
  assert.equal(canObserveRound(flying, { ...flying, serverNow: "2026-10-29T12:00:01Z" }), false);
  assert.ok(canObserveRound(flying, { ...flying, serverNow: "2026-10-29T12:00:03Z" }));
  assert.ok(canObserveRound(flying, { ...flying, id: "later", startedAt: "2026-10-29T13:00:00Z" }));
});

test("overlapping physics snapshots cannot regress ticks or acknowledged controls", () => {
  const current = { ...flying, pilot: { tick: 100, lastSeq: 5 } };
  assert.equal(canObserveRound(current, { ...flying, pilot: { tick: 99, lastSeq: 5 } }), false);
  assert.equal(canObserveRound(current, { ...flying, pilot: { tick: 101, lastSeq: 4 } }), false);
  assert.equal(canObserveRound(current, { ...flying, pilot: { tick: 101, lastSeq: 5 } }), true);
});
