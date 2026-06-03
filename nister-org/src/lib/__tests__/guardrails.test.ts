import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import {
  EXTERNAL_LINKS,
  homeSections,
  networkAccessSteps,
  networkExperiencePanels,
  networkPreLoginChecks,
  networkTroubleshootingSteps,
} from "../content";

const projectRoot = process.cwd();
const sourceRoot = join(projectRoot, "src");
const legacyProductDomain = ["nister", "ai", ".com"].join("");
const legacyProductName = ["Nister", " ", "AI"].join("");
const forbiddenPatterns = [new RegExp(legacyProductDomain, "i"), new RegExp(`\\b${legacyProductName}\\b`, "i")];
const unsupportedMetricPatterns = [
  /\b\d+\s+hostels?\b/i,
  /\b\d+\s+communities\b/i,
  /\b\d+\s+users?\b/i,
  /\b\d+% uptime\b/i,
];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && entry.name === "__tests__") {
      return [];
    }
    if (entry.isDirectory()) {
      return sourceFiles(fullPath);
    }
    return /\.(ts|tsx|css|json)$/.test(entry.name) ? [fullPath] : [];
  });
}

test("external links point to the approved Nister Wi-Fi destinations", () => {
  assert.equal(EXTERNAL_LINKS.main, "https://nister.org/");
  assert.equal(EXTERNAL_LINKS.network, "https://wifi.nister.org/");
  assert.equal(EXTERNAL_LINKS.login, "https://pay.nister.org/");
  assert.equal(EXTERNAL_LINKS.support, "https://wa.me/233530488905");
  assert.match(EXTERNAL_LINKS.coverageRequest, /^https:\/\/wa\.me\/233530488905\?text=/);
  assert.match(EXTERNAL_LINKS.partnershipRequest, /^https:\/\/wa\.me\/233530488905\?text=/);
});

test("support actions use WhatsApp instead of email", () => {
  const sourceText = sourceFiles(sourceRoot)
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(sourceText, /mailto:/i);
  assert.doesNotMatch(sourceText, /support@nister\.org/i);
  assert.match(sourceText, /wa\.me\/233530488905/);
});

test("network access steps explain the required public flow", () => {
  assert.deepEqual(
    networkAccessSteps.map((step) => step.title),
    ["Connect to Nister Wi-Fi", "Open wifi.nister.org", "Login", "Browse"],
  );
});

test("network page copy speaks to the person trying to get online", () => {
  const allNetworkCopy = [
    ...networkAccessSteps.flatMap((step) => [step.title, step.body]),
    ...networkExperiencePanels.flatMap((panel) => [panel.eyebrow, panel.title, panel.body]),
    ...networkPreLoginChecks,
    ...networkTroubleshootingSteps.flatMap((step) => [step.title, step.body]),
  ].join(" ");

  assert.match(allNetworkCopy, /\byou\b/i);
  assert.match(allNetworkCopy, /\byour\b/i);
  assert.doesNotMatch(allNetworkCopy, /public front door/i);
  assert.doesNotMatch(allNetworkCopy, /user confidence/i);
  assert.doesNotMatch(allNetworkCopy, /staff intervention/i);
  assert.doesNotMatch(allNetworkCopy, /support requests/i);
});

test("network page does not include removed outside-coverage explainer", () => {
  const sourceText = sourceFiles(sourceRoot)
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(
    sourceText,
    /If this page opens while you are on mobile data, office Wi-Fi, or another provider, it can still guide you\./,
  );
  assert.doesNotMatch(
    sourceText,
    /To login, pay, or browse, connect your device to Nister Wi-Fi at the location first\./,
  );
});

test("homepage content stays focused on Wi-Fi access for hostels and remote communities", () => {
  const allHomeCopy = homeSections.map((section) => `${section.eyebrow} ${section.title} ${section.body}`).join(" ");

  assert.match(allHomeCopy, /hostels/i);
  assert.match(allHomeCopy, /remote communities/i);
  assert.match(allHomeCopy, /2\.2 billion/i);
  assert.match(allHomeCopy, /83%/i);
  assert.match(allHomeCopy, /48%/i);
});

test("source files do not contain forbidden legacy product references", () => {
  const offenders = sourceFiles(sourceRoot).flatMap((filePath) => {
    const text = readFileSync(filePath, "utf8");
    return forbiddenPatterns
      .filter((pattern) => pattern.test(text))
      .map((pattern) => `${relative(projectRoot, filePath)} matched ${pattern}`);
  });

  assert.deepEqual(offenders, []);
});

test("source files avoid unsupported Nister-specific impact metrics", () => {
  const offenders = sourceFiles(sourceRoot).flatMap((filePath) => {
    const text = readFileSync(filePath, "utf8");
    return unsupportedMetricPatterns
      .filter((pattern) => pattern.test(text))
      .map((pattern) => `${relative(projectRoot, filePath)} matched ${pattern}`);
  });

  assert.deepEqual(offenders, []);
});
