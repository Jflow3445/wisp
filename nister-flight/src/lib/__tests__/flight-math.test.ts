import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { balancedTransition, cents, commitment, currentStep, DEFAULT_RULES, generateFlight, offerId, seededRandom } from "../flight-math";

test("money input rejects coercion, exponents, negatives, fractions and overflow", () => {
  assert.equal(cents("12.34"), 1234);
  assert.equal(cents("1"), 100);
  for (const value of [0, 1, null, [], "0", "-1", "1e3", "1.001", "NaN", "1,000", "99999999999999999"]) assert.throws(() => cents(value));
});

test("the balanced TypeScript engine matches the commerce PHP engine", () => {
  const expected = JSON.parse(execFileSync("php", ["-r", `require '../pay-portal/lib/spin/flight_math.php'; $out=[]; foreach([1,100,500,10000,1000000] as $stake)for($seed=1;$seed<=50;$seed++){ $i=0; $random=static function($lo,$hi)use(&$i,$seed){return $lo+(($i++*7919+$seed*104729)%($hi-$lo+1));}; $out[]=FlightMath::flight($stake,2*$stake,FlightMath::defaults(),$random);} echo json_encode($out);`], { encoding: "utf8" }));
  let fixture = 0;
  for (const stake of [1, 100, 500, 10000, 1000000]) for (let seed = 1; seed <= 50; seed++) {
    let counter = 0;
    const actual = generateFlight(stake, 2 * stake, DEFAULT_RULES, (lo, hi) => lo + ((counter++ * 7919 + seed * 104729) % (hi - lo + 1)));
    assert.deepEqual(actual, expected[fixture++]);
  }
});

test("ordinary movements preserve expectation and the funded ceiling moves down", () => {
  for (const value of [1, 2, 25, 95, 100, 197, 199]) for (let pct = 10; pct <= 40; pct++) {
    const move = balancedTransition(value, 200, pct, DEFAULT_RULES);
    const expected = (10000 - move.zeroBps) / 10000 * (move.down + move.numerator / move.denominator * (move.up - move.down));
    assert.ok(Math.abs(expected - value) < 1e-10, `${value}, ${pct}: ${expected}`);
  }
  const ceiling = balancedTransition(200, 200, 40, DEFAULT_RULES);
  assert.equal(ceiling.up, 199); assert.equal(ceiling.down, 199);
});

test("generated paths are deterministic, bounded and stop at zero", () => {
  for (let seed = 0; seed < 1000; seed++) {
    const path = generateFlight(500, 1000, DEFAULT_RULES, seededRandom(String(seed)));
    assert.deepEqual(path, generateFlight(500, 1000, DEFAULT_RULES, seededRandom(String(seed))));
    assert.equal(path.path.length, path.offsets.length);
    assert.ok(path.path.every(v => Number.isInteger(v) && v >= 0 && v <= 1000));
    const zero = path.path.indexOf(0);
    if (zero >= 0) assert.equal(zero, path.path.length - 1);
    assert.ok(path.offsets.every((offset, index) => index === 0 || offset > path.offsets[index - 1]));
  }
});

test("proof commitments bind all material rules and offers bind the current step", () => {
  const original = commitment("seed", DEFAULT_RULES, 100, 200);
  assert.equal(original.length, 64);
  assert.notEqual(original, commitment("other", DEFAULT_RULES, 100, 200));
  assert.notEqual(original, commitment("seed", { ...DEFAULT_RULES, houseEdgePpm: 1 }, 100, 200));
  assert.notEqual(original, commitment("seed", DEFAULT_RULES, 101, 200));
  assert.notEqual(offerId("seed", 0), offerId("seed", 1));
  assert.equal(currentStep([0, 1500, 3000], 1499), 0);
  assert.equal(currentStep([0, 1500, 3000], 1500), 1);
  assert.equal(currentStep([0, 1500, 3000], 99999), 2);
});
