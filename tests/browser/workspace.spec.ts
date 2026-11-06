import { expect, test } from "@playwright/test";
import { textPdf } from "../fixtures";

test("load both OAP editions, compare, open a source page and recover saved history", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo editions" }).click();
  await expect(page.getByText("Demo editions loaded.", { exact: false })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Compare editions" }).click();
  const row = page.getByRole("article", { name: "4.3.1 → 4.2.1 Changed" });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByText("Section renumbered.", { exact: false })).toBeVisible();
  await expect(row.locator("mark").filter({ hasText: /Attendant Care Benefit/ })).toHaveCount(0);
  const source = row.getByRole("link", { name: /Preview older PDF/ }).first();
  const href = await source.getAttribute("href");
  expect(href).toMatch(/#page=33$/);
  await source.click();
  const preview = page.getByRole("img", { name: "PDF page 33" });
  await expect(preview).toBeVisible();
  expect(await preview.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(600);
  await expect(page.getByRole("link", { name: "Open in new tab" })).toHaveAttribute("href", href!);
  const response = await request.get(href!.split("#")[0]);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await page.getByRole("button", { name: "Close PDF" }).click();

  await page.reload();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "What changed in section 4.2.1?" }).click();
  await expect(row).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(row.getByRole("region", { name: "Older wording" })).toBeVisible();
  await expect(row.getByRole("region", { name: "Newer wording" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("upload a text PDF and show a retry state for a PDF without selectable text", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByText("Add a PDF edition").click();
  await page.getByLabel("Policy name").fill("Browser upload policy");
  await page.getByLabel("Edition name").fill("First edition");
  await page.getByLabel("Effective date").fill("2026-01-01");
  await page.getByLabel("Text PDF").setInputFiles({
    name: "valid.pdf", mimeType: "application/pdf",
    buffer: textPdf(["1.1 Claim deadline", "The policy requires written notification within fourteen business days."]),
  });
  await page.getByRole("button", { name: "Upload and index" }).click();
  await expect(page.getByText("PDF saved and indexed.")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Policy", { exact: true }).selectOption({ label: "Browser upload policy" });
  await page.getByLabel("Edition name").fill("Empty edition");
  await page.getByLabel("Effective date").fill("2026-06-01");
  await page.getByLabel("Text PDF").setInputFiles({ name: "empty.pdf", mimeType: "application/pdf", buffer: textPdf([]) });
  await page.getByRole("button", { name: "Upload and index" }).click();
  const uploadError = page.getByRole("alert").filter({ hasText: "too little selectable text" });
  await expect(uploadError).toBeVisible();
  const retry = page.getByRole("button", { name: "Retry ingestion" });
  await expect(retry).toBeVisible();
  const attempted = page.waitForResponse((response) => response.url().includes("/api/ingest/") &&
    response.request().method() === "POST");
  await retry.click();
  expect((await (await attempted).json()).status).toBe("failed");
  await expect(uploadError).toBeVisible();
});
