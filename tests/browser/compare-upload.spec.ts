import { expect, test } from "@playwright/test";
import { textPdf } from "../fixtures";

test("upload both PDFs in Compare, select them chronologically, highlight changes and keep Hebrew after reload", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByText("Add a PDF edition", { exact: true }).click();
  await page.getByLabel("Policy name").fill("Inline upload policy");
  async function upload(label: string, date: string, days: string) {
    await page.getByLabel("Edition name").fill(label);
    await page.getByLabel("Effective date").fill(date);
    await page.getByLabel("Text PDF").setInputFiles({ name: label + ".pdf", mimeType: "application/pdf", buffer: textPdf([
      "2.1 Claim reporting deadline", "An insured driver must report an accident within " + days + " days.",
      "Written notice must include the policy number and accident date.",
    ]) });
    const uploaded = page.waitForResponse(response => response.url().endsWith("/api/versions") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Upload and index", exact: true }).click();
    const data = await (await uploaded).json();
    return data.id as string;
  }
  const newer = await upload("New edition", "2026-01-01", "ten");
  await expect(page.getByText("First PDF ready.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Compare policy editions", exact: true })).toBeVisible();
  await expect(page.getByLabel("Policy", { exact: true })).toHaveValue(/.+/);
  const older = await upload("Old edition", "2022-01-01", "seven");
  await expect(page.getByText("Both PDFs are ready and selected.", { exact: false })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Older edition" })).toHaveValue(older);
  await expect(page.getByRole("combobox", { name: "Newer edition" })).toHaveValue(newer);
  await page.getByRole("textbox", { name: "Comparison question" }).fill("What changed in section 2.1?");
  await page.getByRole("button", { name: "Compare editions", exact: true }).click();
  const finding = page.getByRole("article", { name: "2.1 Changed", exact: true });
  await expect(finding.getByRole("region", { name: "Older wording" }).locator("mark")).toHaveText("seven");
  await expect(finding.getByRole("region", { name: "Newer wording" }).locator("mark")).toHaveText("ten");
  expect(await finding.locator("mark").first().evaluate(mark => getComputedStyle(mark).backgroundColor)).toBe("rgb(255, 235, 59)");
  await page.getByRole("button", { name: "עברית", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "השוואת גרסאות פוליסה" })).toBeVisible();
  await expect(page.getByRole("article", { name: "2.1 שונה", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "הגרסה הישנה" })).toHaveValue(older);
  await page.getByRole("button", { name: "העתקת ההשוואה המלאה", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("מצב ניתוח: השוואה מקומית");
  await page.getByRole("link", { name: "פתיחת המסמך הישן · עמוד 1", exact: true }).click();
  await expect(page.getByRole("img", { name: "עמוד PDF מספר 1" })).toBeVisible();
  await page.getByRole("button", { name: "סגירת המסמך" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.getByRole("button", { name: "מסמכים", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "מסמכים", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ספריית מסמכים" })).toBeVisible();
  await page.getByRole("button", { name: "היסטוריה", exact: true }).click();
  await page.getByRole("button", { name: "What changed in section 2.1?", exact: false }).first().click();
  await expect(page.getByRole("article", { name: "2.1 שונה", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("article", { name: "2.1 Changed", exact: true })).toBeVisible();
});

test("Hebrew loads on the server, translates errors and keeps private uploads locked", async ({ page, context }) => {
  await context.addCookies([{ name: "policydiff_language", value: "he", url: "http://127.0.0.1:3418" }]);
  let requests = 0;
  await page.route("**/api/workspace", route => ++requests === 1
    ? route.fulfill({ status: 503, json: { error: "The workspace is temporarily unavailable. Please try again." } })
    : route.fulfill({ json: { policies: [], comparisons: [], demoOnly: true, openRouter: false, temporary: true, requiresAccessCode: true } }));
  const response = await page.goto("/");
  expect(await response!.text()).toContain('lang="he" dir="rtl"');
  await expect(page.getByRole("alert").filter({ hasText: "סביבת העבודה אינה זמינה כרגע" })).toBeVisible();
  await page.getByRole("button", { name: "ניסיון חוזר", exact: true }).click();
  await expect(page.getByLabel("קוד גישה לסביבת העבודה")).toBeVisible();
  await expect(page.getByText("הוספת גרסת PDF", { exact: true })).toHaveCount(0);
});
