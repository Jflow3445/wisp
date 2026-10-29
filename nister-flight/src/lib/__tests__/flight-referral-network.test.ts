import assert from "node:assert/strict";
import test from "node:test";
import { readReferralNodeRef, referralNodeKey, referralNodeRef } from "../flight-referral-network";

test("network references are encrypted, authenticated and bound to their viewer", () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "unit-only-network-secret-longer-than-thirty-two-characters";
  try {
    const reference = referralNodeRef("viewer-alpha", "private-user-id", 2);
    const decoded = readReferralNodeRef("viewer-alpha", reference);
    assert.equal(decoded.userId, "private-user-id");
    assert.equal(decoded.depth, 2);
    assert.ok(!reference.includes("private-user-id"));
    assert.throws(() => readReferralNodeRef("viewer-beta", reference));
    const tampered = reference.slice(0, 35) + (reference[35] === "A" ? "B" : "A") + reference.slice(36);
    assert.throws(() => readReferralNodeRef("viewer-alpha", tampered));
    assert.equal(referralNodeKey("viewer-alpha", "member"), referralNodeKey("viewer-alpha", "member"));
    assert.notEqual(referralNodeKey("viewer-alpha", "member"), referralNodeKey("viewer-beta", "member"));
  } finally { if (previous === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = previous; }
});
