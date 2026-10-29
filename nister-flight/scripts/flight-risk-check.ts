import assert from "node:assert/strict";
import { drawPrice, drawResult } from "../src/lib/flight-draw";
import { effectiveStakeLimit } from "../src/lib/flight-economy";
const price = drawPrice(100, 64250);
function simulate(payout: (index: number) => number, limit: number) {
  let house = 10000, protectedCents = 0, fees = 0, playerNet = 0, played = 0;
  for (let i = 0; i < limit; i++) {
    if (effectiveStakeLimit({ houseBalanceCents: house, protectedHouseCents: protectedCents, reservedCents: 0, maxStakeCents: 10000 }) < 100) break;
    house += 100; protectedCents += price.retainedCents; fees += price.charge.feeCents;
    assert.ok(house - protectedCents >= price.rules.prizeCents);
    const paid = payout(i); house -= paid; playerNet += paid - price.charge.totalCents; played++;
    assert.ok(house >= protectedCents);
    assert.equal(house + fees + playerNet, 10000);
  }
  assert.ok(played > 0);
  return played;
}
const randomRounds = simulate(i => drawResult(`draw-risk-${i}`, "fixture", price.rules).payoutCents, 10000);
const allWinningRounds = simulate(() => price.rules.prizeCents, 1000);
assert.ok(allWinningRounds < 1000, "New entry must stop before unfunded prizes are accepted");
assert.ok(price.rules.prizeCents * price.rules.winPpm <= 100 * (1000000 - 64250));
console.log(JSON.stringify({ randomRounds, allWinningRounds, capitalConserved: true, protectedRevenueIntact: true, unfundedEntriesPrevented: true }));
