import assert from "node:assert/strict";
import test from "node:test";
import { canonicalReferralEmail, effectiveStakeLimit, playCharge, referralCharge } from "../flight-economy";
import { isReceivingWalletAsSender } from "../tron-payments";
test("the non-refundable play fee rounds up and referrals never consume the stake", () => {
  for (const stake of [1, 10, 99, 100, 333, 500, 1000000]) {
    const charge = playCharge(stake);
    assert.equal(charge.totalCents, stake + charge.feeCents);
    assert.ok(charge.feeCents >= stake * .03 && charge.feeCents < stake * .03 + 1);
    for (const bps of [0, 1, 100, 299, 300]) assert.ok(referralCharge(stake, bps, charge.feeCents) <= charge.feeCents);
  }
  assert.deepEqual(playCharge(500), { stakeCents: 500, feeCents: 15, totalCents: 515 });
  assert.throws(() => referralCharge(500, 301, 15));
  for (const bad of [NaN, Infinity, -1, 0, 1.1]) assert.throws(() => playCharge(bad));
});
test("stake availability always reserves the full possible return", () => {
  assert.equal(effectiveStakeLimit({ houseBalanceCents: 10000, reservedCents: 0, maxStakeCents: 1000000 }), 500);
  assert.equal(effectiveStakeLimit({ houseBalanceCents: 10000, reservedCents: 1000, maxStakeCents: 1000000 }), 0);
});
test("Gmail identity aliases cannot earn self-referral rewards", () => {
  assert.equal(canonicalReferralEmail("First.Last+crew@googlemail.com"), canonicalReferralEmail("firstlast@gmail.com"));
  assert.notEqual(canonicalReferralEmail("first.last@example.com"), canonicalReferralEmail("firstlast@example.com"));
});
test("the receiving address is rejected as sender in Base58 or hex form", () => {
  assert.ok(isReceivingWalletAsSender("TJRabPrwbZy45sbavfcjinPJC18kjpRTv8", "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8"));
  assert.equal(isReceivingWalletAsSender("invalid", "invalid"), false);
  assert.equal(isReceivingWalletAsSender("TJRabPrwbZy45sbavfcjinPJC18kjpRTv8", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"), false);
});
