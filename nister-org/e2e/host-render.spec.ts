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
const nisterPublicRouteAssertions = [
  {
    path: "/faq",
    heading: /frequently asked questions|faq/i,
    body: /installation|coverage|payment|support|hostel/i,
  },
  {
    path: "/coverage",
    heading: /coverage/i,
    body: /hostel|community|campus|region|town/i,
  },
  {
    path: "/about",
    heading: /about nister|about/i,
    body: /Nister Wi-Fi|hostel|remote communit|internet access/i,
  },
] as const;

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

test("nister.org homepage keeps Get Online and Manage Access visible", async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      "x-forwarded-host": "nister.org",
    },
  });
  const page = await context.newPage();

  await page.goto("/");
  const primaryNav = page.getByLabel("Primary navigation");
  await expect(page.getByRole("heading", { level: 1, name: /dependable internet closer/i })).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Get Online" })).toHaveAttribute(
    "href",
    "https://wifi.nister.org/",
  );
  await expect(primaryNav.getByRole("link", { name: "Manage Access" })).toHaveAttribute(
    "href",
    "https://pay.nister.org/",
  );
  await expect(page.getByText("2.2B")).toBeVisible();
  await expect(page.getByRole("link", { name: "Request Coverage" }).first()).toHaveAttribute(
    "href",
    /https:\/\/wa\.me\/233530488905/,
  );
  await page.screenshot({ path: testInfo.outputPath("nister-org-home.png"), fullPage: true });

  await context.close();
});

test("nister.org renders the request installation lead form", async ({ browser }) => {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      "x-forwarded-host": "nister.org",
    },
  });
  const page = await context.newPage();

  const response = await page.goto("/request-installation");
  expect(response?.status()).toBe(200);

  await expect(page.getByRole("heading", { name: /request.*installation|request nister/i })).toBeVisible();
  await expect(page.locator("main")).toContainText(/property|hostel|coverage/i);

  const form = page.locator('form[action="https://pay.nister.org/owner/lead.php"]').first();
  await expect(form).toBeVisible();
  await expect(form).toHaveAttribute("method", /post/i);

  for (const fieldName of releaseOneLeadFieldNames) {
    expect(await form.locator(`[name="${fieldName}"]`).count(), fieldName).toBeGreaterThan(0);
  }

  await context.close();
});

test("nister.org renders public SEO resource routes", async ({ browser }) => {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      "x-forwarded-host": "nister.org",
    },
  });
  const page = await context.newPage();

  const resourcesResponse = await page.goto("/resources");
  expect(resourcesResponse?.status(), "/resources").toBe(200);
  const resourcesMain = page.locator("main");
  await expect(page.getByRole("heading", { name: /resources/i })).toBeVisible();
  await expect(resourcesMain).toContainText(/hostel|coverage|installation|internet/i);

  const resourceLinks = page.locator('main a[href*="/resources/"]');
  await expect(resourceLinks.first()).toBeVisible();
  const resourceHrefs = await resourceLinks.evaluateAll((anchors) =>
    anchors
      .map((anchor) => anchor.getAttribute("href"))
      .filter((href): href is string => Boolean(href) && href !== "/resources"),
  );
  expect(resourceHrefs.length).toBeGreaterThan(0);

  const articleHref = resourceHrefs[0];
  if (!articleHref) {
    throw new Error("resources page must link to at least one resource article");
  }

  const articlePath = new URL(articleHref, "https://nister.org").pathname;
  const articleResponse = await page.goto(articlePath);
  expect(articleResponse?.status(), articlePath).toBe(200);
  const article = page.locator("article");
  await expect(article).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/^resources$/i);
  await expect(article).toContainText(/Nister|Wi-Fi|hostel|coverage|internet/i);
  expect((await article.innerText()).length, "resource article must contain substantive article copy").toBeGreaterThan(
    400,
  );

  await context.close();
});

for (const route of nisterPublicRouteAssertions) {
  test(`nister.org renders ${route.path} with route-specific content`, async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: {
        "x-forwarded-host": "nister.org",
      },
    });
    const page = await context.newPage();

    const response = await page.goto(route.path);
    expect(response?.status(), route.path).toBe(200);
    await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    await expect(page.locator("main")).toContainText(route.body);

    await context.close();
  });
}

test("wifi.nister.org renders the public network access guide", async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      "x-forwarded-host": "wifi.nister.org",
    },
  });
  const page = await context.newPage();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /get online at your hostel or community location/i })).toBeVisible();
  await expect(page.getByLabel("Network access steps").getByText("Connect to Nister Wi-Fi")).toBeVisible();
  await expect(page.getByRole("heading", { name: /start here if you need internet now/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /check these before you log in/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /if the login page does not open/i })).toBeVisible();
  await expect(page.getByText(/you may be outside a Nister Wi-Fi location/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /log in \/ manage access/i })).toHaveAttribute(
    "href",
    "https://pay.nister.org/",
  );
  await expect(page.getByRole("link", { name: "WhatsApp support" })).toHaveAttribute(
    "href",
    "https://wa.me/233530488905",
  );
  await page.screenshot({ path: testInfo.outputPath("wifi-network-guide.png"), fullPage: true });

  await context.close();
});
