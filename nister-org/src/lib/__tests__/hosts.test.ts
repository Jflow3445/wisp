import assert from "node:assert/strict";
import test from "node:test";
import {
  hostForHeaders,
  isKnownNisterWifiHost,
  resolveExperienceForHost,
  type NisterWifiExperience,
} from "../hosts";

test("hostForHeaders prefers forwarded host and strips protocol noise, ports, and www prefix", () => {
  assert.equal(
    hostForHeaders({
      host: "localhost:3000",
      forwardedHost: "https://www.nister.org:443",
    }),
    "nister.org",
  );
});

test("resolveExperienceForHost routes main Nister hosts to the homepage", () => {
  const expected: NisterWifiExperience = "home";

  assert.equal(resolveExperienceForHost("nister.org"), expected);
  assert.equal(resolveExperienceForHost("www.nister.org"), expected);
});

test("resolveExperienceForHost supports local development hostnames", () => {
  assert.equal(resolveExperienceForHost("nister.localhost:3021"), "home");
  assert.equal(resolveExperienceForHost("wifi.localhost:3021"), "network");
});

test("resolveExperienceForHost routes wifi host to the network access guide", () => {
  const expected: NisterWifiExperience = "network";

  assert.equal(resolveExperienceForHost("wifi.nister.org"), expected);
});

test("resolveExperienceForHost returns fallback for unknown hosts", () => {
  assert.equal(resolveExperienceForHost("pay.nister.org"), "fallback");
  assert.equal(resolveExperienceForHost("example.com"), "fallback");
});

test("isKnownNisterWifiHost only accepts public hosts served by this app", () => {
  assert.equal(isKnownNisterWifiHost("nister.org"), true);
  assert.equal(isKnownNisterWifiHost("www.nister.org"), true);
  assert.equal(isKnownNisterWifiHost("wifi.nister.org"), true);
  assert.equal(isKnownNisterWifiHost("pay.nister.org"), false);
});
