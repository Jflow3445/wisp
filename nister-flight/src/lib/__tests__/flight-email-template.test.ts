import test from "node:test";
import assert from "node:assert/strict";
import { buildFlightEmail } from "../flight-email-template";
test("account and payment emails contain readable text, escaped details and a first-party action", () => {
  const message = buildFlightEmail({ subject: "Deposit confirmed", name: "<script>test</script>", body: "A $5.00 deposit is confirmed.\nReference: <invoice>", path: "/dashboard/wallet" });
  assert.ok(message.text.includes("$5.00")); assert.ok(message.html.includes("NISTER / FLIGHT"));
  assert.ok(!message.html.includes("<script>test")); assert.ok(message.html.includes("&lt;invoice&gt;"));
  assert.throws(() => buildFlightEmail({ subject: "Test", body: "Test", path: "https://untrusted.invalid" }), /this website/);
});
