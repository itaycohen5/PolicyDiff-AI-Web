import { expect, test } from "@playwright/test";
import { textPdf } from "../fixtures";

const oldId = "11111111-1111-4111-8111-111111111111";
const newId = "22222222-2222-4222-8222-222222222222";
const workspace = {
  policies: [{ id: "33333333-3333-4333-8333-333333333333", name: "Synthetic roadside policy", demo: false,
    versions: [
      { id: oldId, label: "Older", effective_on: "2022-01-01", page_count: 1, status: "ready", error: null, attempts: 1, source_url: null, can_resume: false },
      { id: newId, label: "Newer", effective_on: "2026-01-01", page_count: 1, status: "ready", error: null, attempts: 1, source_url: null, can_resume: false },
    ] }],
  comparisons: [], demoOnly: false, openRouter: false,
};

test("an unreadable workspace response can be retried successfully", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/workspace", (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 503, contentType: "text/html", body: "<html>Service temporarily unavailable</html>" })
      : route.fulfill({ json: workspace });
  });
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Older edition" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("a stalled workspace request times out and can be retried", async ({ page }) => {
  test.setTimeout(35_000);
  let attempts = 0;
  await page.route("**/api/workspace", (route) => {
    attempts += 1;
    if (attempts > 1) return route.fulfill({ json: workspace });
  });
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/timed out/i, { timeout: 22_000 });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Older edition" })).toBeVisible();
  expect(attempts).toBe(2);
});

test("comparison inputs lock while pending and changing the question clears stale findings", async ({ page }) => {
  await page.route("**/api/workspace", (route) => route.fulfill({ json: workspace }));
  let finishComparison!: () => void;
  const blocked = new Promise<void>((resolve) => { finishComparison = resolve; });
  await page.route("**/api/comparisons", async (route) => {
    await blocked;
    await route.fulfill({ status: 201, json: {
      id: "44444444-4444-4444-8444-444444444444", question: "What changed in section 2.1?", mode: "local",
      old_id: oldId, new_id: newId, old_label: "Older", new_label: "Newer", policy_name: "Synthetic roadside policy", created_at: "2026-01-01T00:00:00Z", unchanged_sections: [],
      findings: [{ id: "finding", section: "2.1", kind: "changed", description: "The deductible changed.", ai_explanation: null, sources: [] }],
    } });
  });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Older edition" }).selectOption(oldId);
  await page.getByRole("combobox", { name: "Newer edition" }).selectOption(newId);
  const question = page.getByRole("textbox", { name: "Comparison question" });
  await question.fill("What changed in section 2.1?");
  await page.getByRole("button", { name: "Compare editions", exact: true }).click();
  try {
    await expect(question).toBeDisabled();
    await expect(page.getByRole("combobox", { name: "Older edition" })).toBeDisabled();
    await expect(page.getByRole("radio", { name: /Local wording comparison/ })).toBeDisabled();
  } finally {
    finishComparison();
  }
  const finding = page.getByRole("article", { name: "2.1 Changed" });
  await expect(finding).toBeVisible();
  await question.fill("What changed in section 9.9?");
  await expect(finding).toHaveCount(0);
});

test("workspace refresh failure after upload still starts ingestion and preserves completion", async ({ page }) => {
  let refreshes = 0;
  let ingestionRequests = 0;
  await page.route("**/api/workspace", (route) => {
    refreshes += 1;
    return refreshes === 1
      ? route.fulfill({ json: workspace })
      : route.fulfill({ status: 503, json: { error: "Temporary workspace failure." } });
  });
  await page.route("**/api/versions", (route) => route.fulfill({ status: 201, json: { id: newId, duplicate: false } }));
  await page.route("**/api/ingest/*", (route) => {
    ingestionRequests += 1;
    return route.fulfill({ json: { status: "ready" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await page.getByText("Add a PDF edition", { exact: true }).click();
  await page.getByLabel("Policy name").fill("Synthetic upload policy");
  await page.getByLabel("Edition name").fill("Third edition");
  await page.getByLabel("Effective date").fill("2026-02-01");
  await page.getByLabel("Text PDF").setInputFiles({
    name: "synthetic.pdf", mimeType: "application/pdf",
    buffer: textPdf(["2.1 Roadside assistance", "The policy covers documented roadside assistance expenses."]),
  });
  await page.getByRole("button", { name: "Upload and index", exact: true }).click();
  await expect(page.getByText("PDF saved and indexed.", { exact: true })).toBeVisible();
  expect(ingestionRequests).toBe(1);
  await expect(page.getByRole("button", { name: "Refresh workspace", exact: true })).toBeVisible();
});

test("accepted AI explanation is framed, rejected and archived explanations are explicit, and filters reset", async ({ page }) => {
  await page.route("**/api/workspace", (route) => route.fulfill({ json: { ...workspace, openRouter: true } }));
  let comparisons = 0;
  const movedWording = "The insured must provide a sworn declaration.";
  await page.route("**/api/comparisons", (route) => {
    comparisons += 1;
    const oldSources = ["2.1 Claims\nReport the accident within seven days.", "The insurer will confirm receipt.", movedWording];
    const newSources = ["2.1 Claims\nReport the accident within ten days.", movedWording, "The insurer will confirm receipt."];
    const sources = [
      ...oldSources.map((body, index) => ({ id: "old-" + index, body, page: 1, side: "old", version_id: oldId })),
      ...newSources.map((body, index) => ({ id: "new-" + index, body, page: 1, side: "new", version_id: newId })),
    ];
    return route.fulfill({ status: 201, json: {
      id: "ai-comparison-" + comparisons, question: "What changed in section 2.1?", mode: "openrouter",
      old_id: oldId, new_id: newId, old_label: "Older", new_label: "Newer", policy_name: "Synthetic roadside policy", created_at: "2026-01-01T00:00:00Z", unchanged_sections: [],
      findings: [
        { id: "changed", section: "2.1", kind: "changed", description: "The deadline changed.", sources,
          ai_explanation: comparisons === 2 ? null : "The reporting deadline changes from seven to ten days.", ai_context_complete: comparisons !== 3 },
        ...(comparisons === 1 ? [{ id: "review", section: "9.9", kind: "review", description: "No supporting excerpt was found.", sources: [], ai_explanation: null, ai_context_complete: false }] : []),
      ],
    } });
  });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Older edition" }).selectOption(oldId);
  await page.getByRole("combobox", { name: "Newer edition" }).selectOption(newId);
  const question = page.getByRole("textbox", { name: "Comparison question" });
  await question.fill("What changed in section 2.1?");
  await page.getByRole("radio", { name: /ClauseLens/ }).check();
  await page.getByRole("button", { name: "Compare editions", exact: true }).click();
  const changed = page.getByRole("article", { name: "2.1 Changed" });
  await expect(changed.locator(".lens-explanation")).toHaveCount(1);
  const older = changed.getByRole("region", { name: "Older wording" });
  const newer = changed.getByRole("region", { name: "Newer wording" });
  await expect(older.getByText(/Report the accident within seven days/)).toBeVisible();
  await expect(newer.getByText(/Report the accident within ten days/)).toBeVisible();
  await older.locator("details").filter({ hasText: movedWording }).locator("summary").click();
  await expect(older.getByText(movedWording, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Needs review 1", exact: true }).click();
  await expect(changed).toHaveCount(0);
  await expect(page.getByRole("article", { name: "9.9 Needs review" })).toBeVisible();

  await question.fill("Explain section 2.1 again.");
  await page.getByRole("button", { name: "Compare editions", exact: true }).click();
  await expect(changed).toBeVisible();
  await expect(changed.locator(".lens-explanation")).toHaveCount(0);
  await expect(changed.getByText(/No AI explanation was accepted/)).toBeVisible();

  await question.fill("Review an archived explanation for section 2.1.");
  await page.getByRole("button", { name: "Compare editions", exact: true }).click();
  await expect(changed).toBeVisible();
  await expect(changed.locator(".lens-explanation")).toHaveCount(0);
  await expect(changed.getByText(/reporting deadline changes from seven to ten days/)).toHaveCount(0);
});
