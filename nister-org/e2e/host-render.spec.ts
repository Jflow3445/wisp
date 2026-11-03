import { expect, test } from "@playwright/test";

const expectedCapportApi = {
  captive: true,
  "user-portal-url": "http://192.168.88.1/login",
  "venue-info-url": "https://wifi.nister.org/",
  "can-extend-session": false,
};

const routerSyncFiles = [
  "alogin.html",
  "api.json",
  "change-password.html",
  "common.css",
  "config.js",
  "login.html",
  "logout.html",
  "md5.js",
  "pay.html",
  "radvert.html",
  "redirect.html",
  "registration-success.html",
  "reset-password.html",
  "rlogin.html",
  "signup.html",
  "status.html",
  "error.html",
];

for (const path of ["/api.json", "/api.json?v=20260601-remote-refresh"]) {
  test(`${path} returns static CAPPORT JSON`, async ({ request }) => {
    const response = await request.get(path, {
      headers: {
        "x-forwarded-host": "wifi.nister.org",
      },
    });

    expect(response.ok()).toBe(true);
    expect(response.headers()["cache-control"]).toMatch(/no-store/i);
    expect(response.headers()["content-type"]).toMatch(/application\/json/);
    const body = await response.text();

    expect(body).not.toContain("$(");
    expect(JSON.parse(body)).toEqual(expectedCapportApi);
  });
}

test("public legacy hotspot paths redirect instead of returning Next 404 pages", async ({ request }) => {
  const expectations = new Map([
    ["/login", "https://pay.nister.org/"],
    ["/login.html", "https://pay.nister.org/"],
    ["/pay.html", "https://pay.nister.org/"],
    ["/signup.html", "/"],
    ["/reset-password.html", "/"],
    ["/change-password.html", "/"],
    ["/status.html", "/"],
  ]);

  for (const [path, location] of expectations) {
    const response = await request.get(path, {
      headers: {
        "x-forwarded-host": "wifi.nister.org",
      },
      maxRedirects: 0,
    });

    expect(response.status(), path).toBe(307);
    expect(response.headers().location, path).toBe(location);
  }
});

test("router-sync serves the router hotspot source files", async ({ request }) => {
  for (const file of routerSyncFiles) {
    const response = await request.get(`/router-sync/${file}`, {
      headers: {
        "x-forwarded-host": "wifi.nister.org",
      },
    });
    expect(response.status(), file).toBe(200);
  }

  const loginResponse = await request.get("/router-sync/login.html", {
    headers: {
      "x-forwarded-host": "wifi.nister.org",
    },
  });
  expect(loginResponse.status()).toBe(200);
  expect(await loginResponse.text()).toContain("$(link-login-only)");

  const capportResponse = await request.get("/router-sync/api.json", {
    headers: {
      "x-forwarded-host": "wifi.nister.org",
    },
  });
  expect(capportResponse.status()).toBe(200);
  const capportBody = await capportResponse.text();
  expect(capportBody).toContain("$(link-login-only)");
  expect(capportBody).toContain("$(if logged-in == 'yes')");
});

test("nister.org offers coverage and access", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-host": "nister.org" } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wi-Fi for hostels and communities.");
  const nav = page.getByLabel("Primary navigation");
  await expect(nav.getByRole("link", { name: "Get Online" })).toHaveAttribute("href", "https://wifi.nister.org/");
  await expect(nav.getByRole("link", { name: "Manage Access" })).toHaveAttribute("href", "https://pay.nister.org/");
  await expect(page.getByRole("link", { name: "Request coverage" }).first()).toHaveAttribute("href", /https:\/\/wa\.me\/233530488905/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("nister-org-home.png"), fullPage: true });
  await context.close();
});

test("wifi.nister.org guides connection and exposes recovery on demand", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-host": "wifi.nister.org" } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Get online");
  await expect(page.getByLabel("Network access steps").locator("li")).toHaveCount(4);
  await expect(page.getByRole("link", { name: "Manage access", exact: true }).first()).toHaveAttribute("href", "https://pay.nister.org/");
  const recovery = page.locator("details").first();
  await expect(recovery.locator("p")).toBeHidden();
  await recovery.locator("summary").click();
  await expect(recovery.locator("p")).toBeVisible();
  await expect(page.getByRole("link", { name: "WhatsApp support" })).toHaveAttribute("href", "https://wa.me/233530488905");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("wifi-network-guide.png"), fullPage: true });
  await context.close();
});
