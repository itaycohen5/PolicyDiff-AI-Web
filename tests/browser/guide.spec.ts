import { expect, test } from "@playwright/test";

test("the bilingual guide explains the second upload and can fill a comparison question", async ({ page }) => {
  await page.route("**/api/workspace", (route) => route.fulfill({ json: {
    policies: [], comparisons: [], demoOnly: false, openRouter: false,
  } }));
  await page.goto("/");
  await page.getByRole("button", { name: "How to use", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your first policy comparison" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your first policy comparison" }).getByText("For the second PDF", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "עברית", exact: true }).click();
  await expect(page.getByRole("heading", { name: "איך משווים שני מסמכים?" })).toBeVisible();
  await expect(page.locator('[dir="rtl"][lang="he"]')).toBeVisible();
  await page.getByRole("button", { name: "מה השתנה בכיסויים ובחריגים?", exact: false }).click();
  await expect(page.getByRole("textbox", { name: "Comparison question" })).toHaveValue("What changed in the coverage and exclusions?");
  await page.getByRole("button", { name: "Read the guide", exact: false }).click();
  await page.getByRole("button", { name: "Add my PDFs", exact: true }).click();
  await expect(page.getByLabel("Policy name")).toBeVisible();
});

