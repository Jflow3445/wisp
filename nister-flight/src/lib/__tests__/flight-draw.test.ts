import assert from "node:assert/strict";
import test from "node:test";
import { drawCommitment, drawPrice, drawResult } from "../flight-draw";

test("draw results are deterministic, bounded and independent of flight controls", () => {
  const { rules } = drawPrice(500, 64250);
  for (let i = 0; i < 1000; i++) {
    const result = drawResult(`seed-${i}`, "nonce", rules);
    assert.deepEqual(result, drawResult(`seed-${i}`, "nonce", rules));
    assert.ok([0, 1000].includes(result.payoutCents));
  }
  assert.notEqual(drawResult("secret", "one", rules).digest, drawResult("secret", "two", rules).digest);
});
test("entry commitments bind the frozen stake, secret and draw configuration", () => {
  const { rules } = drawPrice(500, 64250), hash = drawCommitment("secret", rules, 500);
  assert.notEqual(hash, drawCommitment("changed", rules, 500));
  assert.notEqual(hash, drawCommitment("secret", { ...rules, winPpm: rules.winPpm + 1 }, 500));
  assert.notEqual(hash, drawCommitment("secret", rules, 501));
});
test("the draw distribution follows the configured mathematical return", () => {
  const { rules } = drawPrice(100, 64250);
  let wins = 0;
  for (let i = 0; i < 30000; i++) if (drawResult(`distribution-${i}`, "nonce", rules).payoutCents) wins++;
  assert.ok(Math.abs(wins / 30000 - rules.winPpm / 1000000) < .012);
  assert.ok(2 * rules.winPpm <= 1000000 - 64250);
});
test("winning returns exceed the entry cost and fee rounding remains unchanged", () => {
  for (const stake of [2, 99, 100, 500, 100000]) {
    const p = drawPrice(stake, 64250);
    assert.equal(p.rules.prizeCents, 2 * stake);
    assert.ok(p.rules.prizeCents > p.charge.totalCents);
    assert.equal(p.charge.feeCents, Math.ceil(stake * .03));
  }
  assert.throws(() => drawPrice(1, 64250));
  assert.throws(() => drawPrice(500, -1));
});
