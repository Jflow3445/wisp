import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import * as content from "../content";
import {
  EXTERNAL_LINKS,
  homeSections,
  networkAccessSteps,
  networkExperiencePanels,
  networkPreLoginChecks,
  networkTroubleshootingSteps,
} from "../content";
import { canonical } from "../seo";

const projectRoot = process.cwd();
const sourceRoot = join(projectRoot, "src");
const capportApiPath = join(projectRoot, "public", "api.json");
const contentExports = content as Record<string, unknown>;
const legacyProductDomain = ["nister", "ai", ".com"].join("");
const legacyProductName = ["Nister", " ", "AI"].join("");
const forbiddenPatterns = [new RegExp(legacyProductDomain, "i"), new RegExp(`\\b${legacyProductName}\\b`, "i")];
const unsupportedMetricPatterns = [
  /\b\d+\s+hostels?\b/i,
  /\b\d+\s+communities\b/i,
  /\b\d+\s+users?\b/i,
  /\b\d+% uptime\b/i,
];
const releaseOneLeadFieldNames = [
  "contact_name",
  "contact_phone",
  "contact_whatsapp",
  "contact_email",
  "property_name",
  "country",
  "region",
  "town",
  "address",
  "digital_address",
  "google_maps_url",
  "nearby_campus",
  "number_of_buildings",
  "number_of_floors",
  "number_of_rooms",
  "estimated_residents",
  "current_occupancy",
  "has_wifi",
  "current_provider",
  "connection_type",
  "current_monthly_cost",
  "current_speed",
  "poor_coverage",
  "slow_internet",
  "downtime",
  "payment_problem",
  "user_management_problem",
  "shared_password_problem",
  "starting_from_scratch",
  "deployment_preference",
] as const;
const publicRouteSourceSpecs = [
  { route: "/for-hostels", file: "src/app/for-hostels/page.tsx", breadcrumb: true, article: false },
  { route: "/how-it-works", file: "src/app/how-it-works/page.tsx", breadcrumb: true, article: false },
  { route: "/plans", file: "src/app/plans/page.tsx", breadcrumb: true, article: false },
  { route: "/request-installation", file: "src/app/request-installation/page.tsx", breadcrumb: true, article: false },
  { route: "/resources", file: "src/app/resources/page.tsx", breadcrumb: true, article: false },
  { route: "/resources/[slug]", file: "src/app/resources/[slug]/page.tsx", breadcrumb: true, article: true },
  { route: "/faq", file: "src/app/faq/page.tsx", breadcrumb: true, article: false },
  { route: "/coverage", file: "src/app/coverage/page.tsx", breadcrumb: true, article: false },
  { route: "/about", file: "src/app/about/page.tsx", breadcrumb: true, article: false },
] as const;

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

function sourceTextFor(relativePath: string): string {
  const fullPath = join(projectRoot, relativePath);
  assert.equal(existsSync(fullPath), true, `${relativePath} must exist`);
  return readFileSync(fullPath, "utf8");
}

test("external links point to the approved Nister Wi-Fi destinations", () => {
  assert.equal(EXTERNAL_LINKS.main, "https://nister.org/");
  assert.equal(EXTERNAL_LINKS.network, "https://wifi.nister.org/");
  assert.equal(EXTERNAL_LINKS.login, "https://pay.nister.org/");
  assert.equal(EXTERNAL_LINKS.support, "https://wa.me/233530488905");
  assert.match(EXTERNAL_LINKS.coverageRequest, /^https:\/\/wa\.me\/233530488905\?text=/);
  assert.match(EXTERNAL_LINKS.partnershipRequest, /^https:\/\/wa\.me\/233530488905\?text=/);
  assert.equal((EXTERNAL_LINKS as Record<string, string | undefined>).ownerLead, "https://pay.nister.org/owner/lead.php");
});

test("Release 1 lead form fields stay in the approved browser POST order", () => {
  const leadFormFields = contentExports.leadFormFields as Array<{ name: string }> | undefined;

  assert.deepEqual(
    leadFormFields?.map((field) => field.name),
    releaseOneLeadFieldNames,
  );
});

test("owner lead fields use backend-compatible browser control values", () => {
  const leadFormFields = contentExports.leadFormFields as
    | Array<{
        name: string;
        label?: string;
        type?: string;
        placeholder?: string;
        help?: string;
        min?: number;
        step?: string;
        inputMode?: string;
        options?: Array<{ value: string; label: string }>;
      }>
    | undefined;
  assert.ok(Array.isArray(leadFormFields), "leadFormFields must be exported from content.ts");

  const fieldsByName = new Map(leadFormFields.map((field) => [field.name, field]));
  const currentOccupancy = fieldsByName.get("current_occupancy");
  assert.equal(currentOccupancy?.type, "number");
  assert.equal(currentOccupancy?.min, 0);
  assert.match(`${currentOccupancy?.placeholder ?? ""} ${currentOccupancy?.help ?? ""}`, /resident|people|count/i);

  const hasWifi = fieldsByName.get("has_wifi");
  assert.deepEqual(hasWifi?.options?.map((option) => option.value), ["1", "0"]);

  const currentMonthlyCost = fieldsByName.get("current_monthly_cost");
  assert.equal(currentMonthlyCost?.type, "number");
  assert.equal(currentMonthlyCost?.step, "0.01");
  assert.equal(currentMonthlyCost?.inputMode, "decimal");
  assert.doesNotMatch(currentMonthlyCost?.placeholder ?? "", /GHS|,|¢|₵|\$/i);
  assert.match(`${currentMonthlyCost?.label ?? ""} ${currentMonthlyCost?.help ?? ""}`, /GHS|Ghana cedi/i);
});

test("public CAPPORT API is static compatibility JSON", () => {
  const payload = JSON.parse(readFileSync(capportApiPath, "utf8"));

  assert.deepEqual(payload, {
    captive: true,
    "user-portal-url": "http://192.168.88.1/login",
    "venue-info-url": "https://wifi.nister.org/",
    "can-extend-session": false,
  });
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
    ["Connect to Nister Wi-Fi", "Open wifi.nister.org", "Log in", "Browse"],
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

test("public SEO content exports planned routes and resource articles without unsupported Nister impact metrics", () => {
  const publicRoutes = contentExports.publicRoutes as Array<{ path: string }> | undefined;
  const resourceArticles = contentExports.resourceArticles as Array<Record<string, unknown>> | undefined;

  assert.ok(Array.isArray(publicRoutes), "publicRoutes must be exported from content.ts");
  assert.ok(Array.isArray(resourceArticles), "resourceArticles must be exported from content.ts");
  assert.deepEqual(
    publicRoutes.map((route) => route.path),
    ["/for-hostels", "/how-it-works", "/plans", "/request-installation", "/resources", "/faq", "/coverage", "/about"],
  );
  assert.ok(resourceArticles.length > 0, "resourceArticles must include at least one public resource article");

  const publicSeoText = JSON.stringify({ publicRoutes, resourceArticles });
  for (const pattern of unsupportedMetricPatterns) {
    assert.doesNotMatch(publicSeoText, pattern);
  }
});

test("SEO helpers expose canonical and structured data builders", () => {
  const sourceText = sourceTextFor("src/lib/seo.ts");

  assert.match(sourceText, /export const SITE_ORIGIN = ["']https:\/\/nister\.org["']/);
  assert.match(sourceText, /export function canonical\(/);
  assert.match(sourceText, /export function organizationJsonLd\(/);
  assert.match(sourceText, /export function breadcrumbJsonLd\(/);
  assert.match(sourceText, /export function articleJsonLd\(/);
});

test("canonical helper keeps absolute and protocol-relative input site-local", () => {
  assert.equal(canonical("/plans"), "https://nister.org/plans");
  assert.equal(canonical("plans"), "https://nister.org/plans");
  assert.equal(canonical("//evil.example/plans"), "https://nister.org/plans");
  assert.equal(canonical("https://evil.example/coverage?x=1#frag"), "https://nister.org/coverage");
  assert.equal(canonical("\\\\evil.example\\plans"), "https://nister.org/plans");
  assert.equal(canonical("/\\\\evil.example\\plans"), "https://nister.org/plans");
});

test("public route sources declare canonical OpenGraph metadata and JSON-LD", () => {
  for (const spec of publicRouteSourceSpecs) {
    const sourceText = sourceTextFor(spec.file);

    assert.match(sourceText, /canonical\(/, `${spec.route} must use canonical metadata`);
    assert.match(sourceText, /openGraph/, `${spec.route} must define OpenGraph metadata`);
    assert.match(sourceText, /organizationJsonLd|@type["']?\s*:\s*["']Organization/, `${spec.route} must include Organization JSON-LD`);

    if (spec.breadcrumb) {
      assert.match(
        sourceText,
        /breadcrumbJsonLd|@type["']?\s*:\s*["']BreadcrumbList/,
        `${spec.route} must include BreadcrumbList JSON-LD`,
      );
    }

    if (spec.article) {
      assert.match(
        sourceText,
        /articleJsonLd|@type["']?\s*:\s*["']Article/,
        `${spec.route} must include Article JSON-LD`,
      );
    }
  }
});

test("plans page does not expose backend enum values as visible commercial copy", () => {
  const sourceText = sourceTextFor("src/app/plans/page.tsx");

  assert.doesNotMatch(sourceText, /Form preference:/);
  assert.doesNotMatch(sourceText, /recommend_for_me|property_paid_wifi|owner_funded|request_nister_funding/);
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
