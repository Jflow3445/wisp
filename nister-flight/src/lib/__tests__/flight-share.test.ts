import test from "node:test";
import assert from "node:assert/strict";
import { flightInviteUrl, flightPublicShareUrl, flightShareHtml, FLIGHT_DESCRIPTION } from "../flight-brand";
test("shared invitations keep their own canonical identity and fresh preview URL", () => {
  const url = flightInviteUrl("NISTK8W4Z"), head = flightShareHtml(url).split("</head>")[0];
  assert.ok(url.includes("/invite/NISTK8W4Z?share=")); assert.ok(head.includes(`property="og:url" content="${url}"`));
  assert.ok(head.includes(`name="description" content="${FLIGHT_DESCRIPTION}"`)); assert.ok(head.includes("flight-share-crew.png"));
  assert.ok(head.length < 3000); assert.ok(!head.includes("<script"));
  assert.equal(flightPublicShareUrl("/admin"), "https://nisterai.com/");
  assert.equal(flightPublicShareUrl("/", "untrusted\"value"), "https://nisterai.com/");
});
