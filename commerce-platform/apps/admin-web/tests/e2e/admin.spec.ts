import { expect, test } from "@playwright/test";

test("signs into marketplace control", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue securely" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Marketplace control" })).toBeVisible();
});

test("requires evidence for a vendor approval", async ({ page }) => {
  await page.goto("/vendors?status=UNDER_REVIEW");
  await page.getByTitle("Approve vendor").first().click();
  await page.getByRole("button", { name: "Approve vendor" }).click();
  await expect(page.getByText("Complete all required review fields before confirming.")).toBeVisible();
  await page.getByLabel("Evidence reference").fill("KYC-2026-0083");
  await page.getByRole("button", { name: "Approve vendor" }).click();
  await expect(page.getByText("Command recorded")).toBeVisible();
});

test("only confirms reviewed payments with evidence", async ({ page }) => {
  await page.goto("/payments?status=UNDER_REVIEW");
  await page.getByTitle("Confirm verified payment").click();
  await page.getByRole("button", { name: "Confirm verified success" }).click();
  await expect(page.getByText("Complete all required review fields before confirming.")).toBeVisible();
});

test("exposes read-only and permission states on mobile", async ({ page, isMobile }) => {
  await page.goto("/audit?state=permission");
  await expect(page.getByRole("heading", { name: "Permission required" })).toBeVisible();
  if (isMobile) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("navigation", { name: "Finance & control" })).toBeVisible();
  }
});
