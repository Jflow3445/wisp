import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
});

test("shops the home, category, search and product routes", async ({ page }) => {
  await expect(page.getByRole("heading", { name: /Good finds/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Picked for your basket" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Fresh food", exact: true }).first()).toBeVisible();

  await page.goto("/category/electronics");
  await expect(page.getByRole("heading", { name: "Electronics", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "SonicFlow Wireless Headphones", exact: true })).toBeVisible();

  await page.goto("/search?q=rice");
  await expect(page.getByRole("heading", { name: /Results for/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Aroma Ghana Rice, 5 kg", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Aroma Ghana Rice, 5 kg", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aroma Ghana Rice, 5 kg" })).toBeVisible();
  await expect(page.getByText("Only 7 left")).toBeVisible();
});

test("persists a basket and completes the development checkout", async ({ page }) => {
  await page.goto("/product/market-day-produce-box");
  await page.getByRole("button", { name: /Add to basket/ }).click();
  await expect(page.getByRole("button", { name: /Added to basket/ })).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: /Basket/ })).toBeVisible();
  await expect(page.getByText("GH₵ 189.00").first()).toBeVisible();

  await page.getByRole("link", { name: /Continue to checkout/ }).click();
  await page.getByLabel("Recipient name").fill("Ama Mensah");
  await page.getByLabel("Mobile number").fill("+233241234567");
  await page.getByLabel("Town or city").fill("Accra");
  await page.getByLabel("Street, building or area").fill("14 Independence Avenue, Osu");
  await page.getByLabel("Nearest landmark").fill("Opposite the community library");
  await page.getByRole("button", { name: /Continue to payment/ }).click();

  await expect(page.getByRole("heading", { name: /How would you like to pay/ })).toBeVisible();
  await page.getByRole("button", { name: /Review order/ }).click();
  await expect(page.getByText(/Demo checkout/)).toBeVisible();
  await page.getByRole("button", { name: "Create demo order" }).click();

  await expect(page.getByRole("heading", { name: "Your checkout flow worked." })).toBeVisible();
  await expect(page.getByText("No payment was taken.")).toBeVisible();
  await page.getByRole("link", { name: "View order details" }).click();
  await expect(page.getByText(/Demo order: no payment/)).toBeVisible();
});

test("validates account registration accessibly", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: /Create account/ }).click();
  await expect(page.getByText("Enter your full name")).toBeVisible();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expect(page.getByText("Accept the terms to continue")).toBeVisible();
});
