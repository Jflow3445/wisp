import { expect, test } from "@playwright/test";

test("nister.org renders the grant-ready Wi-Fi homepage", async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      "x-forwarded-host": "nister.org",
    },
  });
  const page = await context.newPage();

  await page.goto("/");
  const primaryNav = page.getByLabel("Primary navigation");
  await expect(page.getByRole("heading", { level: 1, name: /internet access should not depend/i })).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Network" })).toHaveAttribute("href", "https://wifi.nister.org/");
  await expect(primaryNav.getByRole("link", { name: "Login" })).toHaveAttribute("href", "https://pay.nister.org/");
  await expect(page.getByText("2.2B")).toBeVisible();
  await expect(page.getByRole("link", { name: "Request Coverage" }).first()).toHaveAttribute(
    "href",
    /https:\/\/wa\.me\/233530488905/,
  );
  await page.screenshot({ path: testInfo.outputPath("nister-org-home.png"), fullPage: true });

  await context.close();
});

test("wifi.nister.org renders the public network access guide", async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      "x-forwarded-host": "wifi.nister.org",
    },
  });
  const page = await context.newPage();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /get online where you are/i })).toBeVisible();
  await expect(page.getByLabel("Network access steps").getByText("Connect to Nister Wi-Fi")).toBeVisible();
  await expect(page.getByRole("heading", { name: /start here if you need internet now/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /check these before you login/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /if the login page does not open/i })).toBeVisible();
  await expect(page.getByText(/you are close/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Login / Manage Access" })).toHaveAttribute("href", "https://pay.nister.org/");
  await expect(page.getByRole("link", { name: "WhatsApp support" })).toHaveAttribute(
    "href",
    "https://wa.me/233530488905",
  );
  await page.screenshot({ path: testInfo.outputPath("wifi-network-guide.png"), fullPage: true });

  await context.close();
});
