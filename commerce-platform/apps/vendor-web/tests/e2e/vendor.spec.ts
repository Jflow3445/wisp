import { expect, test } from "@playwright/test";

test("signs into the vendor workspace", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Operations overview" })).toBeVisible();
});

test("enforces a reason for order rejection", async ({ page }) => {
  await page.goto("/orders/ord_01");
  await page.getByRole("button", { name: "Reject" }).click();
  await page.getByRole("button", { name: "Reject order" }).click();
  await expect(page.getByText("Complete all required fields before confirming.")).toBeVisible();
  await page.getByLabel("Reason").fill("Insufficient stock after cycle count");
  await page.getByRole("button", { name: "Reject order" }).click();
  await expect(page.getByText("Command recorded")).toBeVisible();
});

test("supports inventory evidence validation", async ({ page }) => {
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Adjust" }).first().click();
  await page.getByRole("button", { name: "Post adjustment" }).click();
  await expect(page.getByText(/Enter a non-zero quantity/)).toBeVisible();
});

test("renders explicit permission state and mobile navigation", async ({ page, isMobile }) => {
  await page.goto("/finance?state=permission");
  await expect(page.getByRole("heading", { name: "Permission required" })).toBeVisible();
  if (isMobile) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("navigation", { name: "Vendor navigation" })).toBeVisible();
  }
});
