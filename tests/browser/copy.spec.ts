import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function openComparison(page: Page, partial = false) {
  const demo = JSON.parse(await readFile("demo/web/snapshot.json", "utf8"));
  const comparison = demo.aiComparison;
  if (partial) {
    comparison.findings[0].ai_context_complete = false;
    comparison.findings[0].ai_explanation = "Hidden partial-context explanation";
  }
  await page.route("**/api/workspace", (route) => route.fulfill({ json: demo.workspace }));
  await page.route("**/api/comparisons", (route) => route.fulfill({ status: 201, json: comparison }));
  await page.goto("/");
  await page.getByRole("combobox", { name: "Older edition" }).selectOption(comparison.old_id);
  await page.getByRole("combobox", { name: "Newer edition" }).selectOption(comparison.new_id);
  await page.getByRole("radio", { name: /ClauseLens/ }).check();
  await page.getByRole("button", { name: "Compare editions", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copy complete comparison", exact: true })).toBeVisible();
  return comparison;
}

test("copy AI text, a complete finding with collapsed sources, and the whole comparison", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const comparison = await openComparison(page);
  const finding = comparison.findings[0];
  // Windows normalizes clipboard newlines to CRLF; compare the actual text content.
  const clipboard = async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
  const aiCopy = page.getByRole("button", { name: "Copy AI explanation for " + finding.section, exact: true });
  await aiCopy.click();
  await expect(aiCopy).toHaveText("Copied!");
  expect(await clipboard()).toBe(finding.ai_explanation);

  await page.getByRole("button", { name: "Copy finding " + finding.section, exact: true }).click();
  const findingCopy = await clipboard();
  expect(findingCopy).toContain(finding.section + " — Changed");
  for (const source of finding.sources) {
    expect(findingCopy).toContain(source.body);
    expect(findingCopy).toContain("http://127.0.0.1:3418/api/pdf/" + source.version_id + "#page=" + source.page);
  }

  const completeCopy = page.getByRole("button", { name: "Copy complete comparison", exact: true });
  await completeCopy.click();
  const copied = await clipboard();
  expect(copied).toContain(comparison.question);
  expect(copied).toContain(comparison.old_label + " → " + comparison.new_label);
  expect(copied).toContain(findingCopy);
  await expect(completeCopy).toHaveText("Copy", { timeout: 5000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(completeCopy).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("hidden partial-context AI text is also excluded from the copied answer", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openComparison(page, true);
  await expect(page.getByRole("button", { name: /^Copy AI explanation/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Copy complete comparison", exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).not.toContain("Hidden partial-context explanation");
  expect(copied).toContain("This saved AI explanation used partial excerpts.");
});

test("blocked clipboard access displays a useful error and permits a retry", async ({ page }) => {
  await page.addInitScript(() => {
    const write = navigator.clipboard.writeText.bind(navigator.clipboard);
    let blocked = true;
    Object.defineProperty(navigator.clipboard, "writeText", { value: async (text: string) => {
      if (blocked) { blocked = false; throw new DOMException("Clipboard denied", "NotAllowedError"); }
      return write(text);
    } });
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await openComparison(page);
  const copy = page.getByRole("button", { name: "Copy complete comparison", exact: true });
  await copy.click();
  await expect(page.getByRole("alert").filter({ hasText: "Copy was blocked" })).toBeVisible();
  await expect(copy).toHaveText("Copy");
  await copy.click();
  await expect(copy).toHaveText("Copied!");
  await expect(page.getByRole("alert").filter({ hasText: "Copy was blocked" })).toHaveCount(0);
});
