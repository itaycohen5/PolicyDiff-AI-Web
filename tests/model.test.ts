import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { explain } from "../lib/model";
import type { Candidate } from "../lib/analysis";

const candidates: Candidate[] = [{
  section: "2.1", kind: "changed", description: "The deadline changed.",
  old: [{ id: randomUUID(), version_id: randomUUID(), page: 1, ordinal: 0, section: "2.1", body: "2.1 Claims\nReport an accident within seven days." }],
  next: [{ id: randomUUID(), version_id: randomUUID(), page: 1, ordinal: 0, section: "2.1", body: "2.1 Claims\nReport an accident within ten days." }],
}];

test("ClauseLens returns rate-limit and timeout errors without a paid fallback", async (t) => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousDemo = process.env.POLICYDIFF_DEMO_ONLY;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.POLICYDIFF_DEMO_ONLY = "0";
  try {
    await t.test("provider rate limit returns HTTP 429 after one attempt", async (subtest) => {
      const mock = subtest.mock.method(globalThis, "fetch", async () => Response.json({
        error: { code: 429, message: "Free model rate limit reached." },
      }, { status: 429 }));
      await assert.rejects(explain("What changed?", candidates),
        (error: unknown) => error instanceof Error && "status" in error && error.status === 429);
      assert.equal(mock.mock.callCount(), 1);
    });
    await t.test("provider timeout returns HTTP 504 after one attempt", async (subtest) => {
      const mock = subtest.mock.method(globalThis, "fetch", async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      });
      await assert.rejects(explain("What changed?", candidates),
        (error: unknown) => error instanceof Error && "status" in error && error.status === 504);
      assert.equal(mock.mock.callCount(), 1);
    });
  } finally {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
    if (previousDemo === undefined) delete process.env.POLICYDIFF_DEMO_ONLY;
    else process.env.POLICYDIFF_DEMO_ONLY = previousDemo;
  }
});
