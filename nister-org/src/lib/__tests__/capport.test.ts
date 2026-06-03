import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const expectedCapport = {
  captive: true,
  "user-portal-url": "http://192.168.88.1/login",
  "venue-info-url": "https://wifi.nister.org/",
  "can-extend-session": false,
};

test("public CAPPORT JSON stays static and points clients to the router login", () => {
  const raw = readFileSync(join(process.cwd(), "public", "api.json"), "utf8");

  assert.doesNotMatch(raw, /\$\(/);
  assert.deepEqual(JSON.parse(raw), expectedCapport);
});
