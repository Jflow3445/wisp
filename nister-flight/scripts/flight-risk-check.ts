import assert from "node:assert/strict";
import { drawPrice, drawResult, poolDrawResult } from "../src/lib/flight-draw";
const price = drawPrice(100, 64250);
function simulate(alwaysSelected: boolean) {
  let pool = 10000, fees = 0, playerNet = 0, paid = 0, limited = 0;
  for (let i = 0; i < 10000; i++) {
    pool += 100; fees += price.charge.feeCents;
    const outcome = alwaysSelected
      ? { payoutCents: 200 <= Math.floor(pool / 10) ? 200 : 0, reason: 200 <= Math.floor(pool / 10) ? "WIN" : "POOL_LIMIT" }
      : poolDrawResult(`pool-risk-${i}`, "fixture", price.rules, pool);
    assert.ok(outcome.payoutCents <= Math.floor(pool / 10));
    pool -= outcome.payoutCents; playerNet += outcome.payoutCents - price.charge.totalCents;
    if (outcome.payoutCents) paid++;
    if (outcome.reason === "POOL_LIMIT") limited++;
    assert.ok(pool >= 0); assert.equal(pool + fees + playerNet, 10000);
  }
  return { paid, limited };
}
const random = simulate(false), selected = simulate(true);
assert.ok(random.paid > 0 && selected.limited > 0);
assert.ok(drawResult("comparison", "nonce", price.rules).payoutCents <= 200);
console.log(JSON.stringify({ simulatedRounds: 20000, capitalConserved: true, poolPayoutCeilingRespected: true, winnersPaid: random.paid, conditionalPoolLosses: selected.limited }));
