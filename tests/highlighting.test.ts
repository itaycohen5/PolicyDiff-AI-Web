import assert from "node:assert/strict";
import { test } from "node:test";
import { sectionHighlights } from "../lib/highlighting";
import type { Source } from "../lib/contracts";

function excerpts(side: "old" | "new", bodies: string[]): Source[] {
  return bodies.map((body, ordinal) => ({ id: side + ordinal, side, body, ordinal, page: ordinal + 1, version_id: side }));
}
function marked(sources: Source[], ranges: ReturnType<typeof sectionHighlights>) {
  return sources.flatMap(source => (ranges.get(source.id) ?? []).map(range => source.body.slice(range.start, range.end))).join(" ").trim();
}

test("highlights replaced words across chunk boundaries and preserves original offsets", () => {
  const older = excerpts("old", ["Report an accident within seven", "days after the event. Keep written records."]);
  const newer = excerpts("new", ["Report an accident within ten days", "after the event. Keep written records."]);
  const marks = sectionHighlights(older, newer);
  assert.match(marked(older, marks), /seven/);
  assert.match(marked(newer, marks), /ten/);
  for (const source of [...older, ...newer]) for (const range of marks.get(source.id) ?? []) {
    assert.ok(range.start >= 0 && range.end <= source.body.length && range.end > range.start);
  }
});

test("highlights additions and removals at the end of a complete section", () => {
  const original = excerpts("old", ["2.1 Claims\nWritten notice is required."]);
  const extended = excerpts("new", ["2.1 Claims\nWritten notice is required. Include a police report."]);
  assert.match(marked(extended, sectionHighlights(original, extended)), /Include a police report/);
  const longer = excerpts("old", ["2.1 Claims\nWritten notice is required. Include a police report."]);
  const shorter = excerpts("new", ["2.1 Claims\nWritten notice is required."]);
  assert.match(marked(longer, sectionHighlights(longer, shorter)), /Include a police report/);
});

test("restores document order before comparison and does not mark moved paragraphs as new", () => {
  const moved = "The insured must provide a sworn declaration.";
  const old = excerpts("old", ["2.1 Claims\nReport the accident within seven days.", "The insurer will confirm receipt.", moved]);
  const next = excerpts("new", ["2.1 Claims\nReport the accident within ten days.", moved, "The insurer will confirm receipt."]);
  const oldFocused = [old[2], old[0], old[1]];
  const newFocused = [next[1], next[2], next[0]];
  const marks = sectionHighlights(oldFocused, newFocused);
  assert.match(marked(old, marks), /seven/);
  assert.match(marked(next, marks), /ten/);
  assert.equal(marks.has(old[2].id), false);
  assert.equal(marks.has(next[1].id), false);
});

test("handles Hebrew wording and does not mark identical or missing evidence", () => {
  const old = excerpts("old", ["2.1 דיווח\nיש לדווח על התאונה בתוך שבעה ימים."]);
  const next = excerpts("new", ["2.1 דיווח\nיש לדווח על התאונה בתוך עשרה ימים."]);
  const marks = sectionHighlights(old, next);
  assert.match(marked(old, marks), /שבעה/);
  assert.match(marked(next, marks), /עשרה/);
  assert.equal(sectionHighlights(old, excerpts("new", [old[0].body])).size, 0);
  assert.equal(sectionHighlights(old, []).size, 0);
});
