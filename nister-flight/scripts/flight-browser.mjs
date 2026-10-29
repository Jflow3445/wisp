import { chromium } from "@playwright/test";
import { SignJWT } from "jose";
import { readFile, mkdir } from "node:fs/promises";

const env = Object.fromEntries((await readFile(".env.test", "utf8")).split(/\r?\n/).filter(line => line.includes("=")).map(line => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")]; }));
const out = "artifacts/browser";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [], checks = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
const base = process.env.FLIGHT_PREVIEW_URL || "http://localhost:3330";
async function shot(path, name) {
  const response = await page.goto(base + path, { waitUntil: "networkidle", timeout: 90000 });
  if (!response?.ok()) throw new Error(`${path}: HTTP ${response?.status()}`);
  if (page.url().includes("/legal/accept")) {
    await page.locator('input[name="legalConsent"]').check();
    await page.getByRole("button", { name: "Accept and continue" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 45000 });
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 90000 });
  }
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  if (overflow) throw new Error(`${path}: horizontal overflow`);
  checks.push(`${name}: rendered without overflow`);
}
await shot("/", "landing-desktop");
await page.setViewportSize({ width: 390, height: 844 });
await shot("/", "landing-mobile");
await shot("/login", "login-mobile");
if (process.env.FLIGHT_BROWSER_AUTH === "1") {
  const secret = new TextEncoder().encode(env.SESSION_SECRET);
  for (const role of ["MEMBER", "ADMIN"]) {
    const id = role === "ADMIN" ? "flight-test-admin" : "flight-test-member";
    const token = await new SignJWT({ email: role === "ADMIN" ? "flight-admin@example.test" : "flight-member@example.test", name: role === "ADMIN" ? "Alex Morgan" : "Jordan Ellis", role }).setSubject(id).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(secret);
    await context.addCookies([{ name: "nister_session", value: token, url: base, httpOnly: true, sameSite: "Lax" }]);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await shot(role === "ADMIN" ? "/admin" : "/dashboard", `${role.toLowerCase()}-desktop`);
    if (role === "MEMBER") {
      if (!(await page.locator(".f-deck-balance").first().innerText()).includes("USD")) throw new Error("Member balance is not denominated in USD");
      checks.push("member balances and stakes are denominated in USD");
      if (await page.getByRole("button", { name: /accept the rules/ }).count()) await page.getByRole("button", { name: /accept the rules/ }).click();
      await page.getByRole("button", { name: "Start flight", exact: true }).waitFor();
      await shot("/dashboard/wallet", "wallet-desktop");
      await page.setViewportSize({ width: 390, height: 844 });
      await shot("/dashboard", "member-mobile");
      await page.getByRole("button", { name: "Toggle navigation" }).click();
      await page.getByRole("button", { name: "Close navigation" }).click();
      if (await page.locator(".f-menu-open").count()) throw new Error("Mobile navigation did not close");
      checks.push("mobile navigation opens and closes correctly");
      await shot("/dashboard/wallet", "wallet-mobile");
    } else {
      await shot("/admin/settings", "admin-controls");
      await page.setViewportSize({ width: 390, height: 844 });
      await shot("/admin", "admin-mobile");
      await shot("/admin/users", "admin-users-mobile");
    }
  }
  await context.clearCookies();
  await page.goto(base + "/login");
  await page.getByLabel("Email address").fill("flight-member@example.test");
  await page.getByLabel("Password", { exact: true }).fill(env.FLIGHT_TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/(dashboard|legal\/accept)/, { timeout: 60000 });
  if (page.url().includes("legal/accept")) {
    await page.locator('input[name="legalConsent"]').check();
    await page.getByRole("button", { name: "Accept and continue" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 45000 });
  }
  checks.push("existing member signs in through the real password flow");
  const response = await context.request.get(base + "/api/flight/admin");
  if (response.status() !== 403) throw new Error("A member can access admin data");
  checks.push("member is denied the administrator API");
  const crossOrigin = await context.request.post(base + "/api/flight", { headers: { origin: "https://untrusted.invalid" }, data: { action: "consent", accepted: true } });
  if (crossOrigin.status() !== 403) throw new Error("Cross-origin mutation was accepted");
  checks.push("cross-origin wallet mutation denied");
}
await browser.close();
console.log(JSON.stringify({ checks, browserErrors: errors, screenshots: out }, null, 2));
if (errors.length) process.exitCode = 1;
