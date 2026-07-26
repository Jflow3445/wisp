import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PaystackSignatureVerifier } from "./paystack.provider.js";

describe("PaystackSignatureVerifier", () => {
  it("accepts only the SHA-512 HMAC of the exact raw body", () => {
    const body = Buffer.from('{"event":"charge.success"}');
    const signature = createHmac("sha512", "webhook-secret").update(body).digest("hex");
    const verifier = new PaystackSignatureVerifier("webhook-secret");
    expect(verifier.verify(body, signature)).toBe(true);
    expect(verifier.verify(Buffer.from(`${body.toString()} `), signature)).toBe(false);
    expect(verifier.verify(body, "not-hex")).toBe(false);
  });
});
