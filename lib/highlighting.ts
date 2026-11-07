import { diffArrays } from "diff";
import type { Source } from "./contracts";

export type HighlightRange = { start: number; end: number };
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
// Unicode words keep Hebrew (including vowel marks), English and numbers intact.
const tokens = (text: string) => text.match(/[\p{L}\p{M}\p{N}_]+|\s+|[^\p{L}\p{M}\p{N}_\s]/gu) ?? [];

function documentText(sources: Source[]) {
  let text = "";
  const spans = sources.map((source, index) => ({ source, index }))
    .sort((a, b) => a.source.ordinal !== undefined && b.source.ordinal !== undefined
      ? a.source.ordinal - b.source.ordinal : a.source.page - b.source.page || a.index - b.index)
    .map(({ source }) => {
      if (text) text += "\n\n";
      const start = text.length;
      text += source.body;
      return { source, start, end: text.length };
    });
  return { text, spans };
}

// Compare complete sections, then project edits back onto the original page-bound excerpts.
// A paragraph found elsewhere on the other side is moved wording, rather than new wording.
export function sectionHighlights(older: Source[], newer: Source[]) {
  const ranges = new Map<string, HighlightRange[]>();
  if (!older.length || !newer.length) return ranges;
  const old = documentText(older), next = documentText(newer);
  if (old.text.length + next.text.length > 240_000) return ranges;
  const parts = diffArrays(tokens(old.text), tokens(next.text), { timeout: 100, maxEditLength: 8000 });
  if (!parts) return ranges;
  const normalized = { old: normalize(old.text), next: normalize(next.text) };
  const unchanged = new Set<string>();
  for (const [section, other] of [[old, normalized.next], [next, normalized.old]] as const) {
    for (const { source } of section.spans) {
      const text = normalize(source.body);
      if (text.split(/\s+/).length >= 5 && other.includes(text)) unchanged.add(source.id);
    }
  }
  let oldOffset = 0, newOffset = 0;
  for (const part of parts) {
    const value = part.value.join("");
    if (part.added || part.removed) {
      const side = part.removed ? old : next;
      const offset = part.removed ? oldOffset : newOffset;
      const other = part.removed ? normalized.next : normalized.old;
      const text = normalize(value);
      const moved = text.split(/\s+/).length >= 5 && other.includes(text);
      if (text && !moved) for (const span of side.spans) {
        if (unchanged.has(span.source.id)) continue;
        const start = Math.max(offset, span.start) - span.start;
        const end = Math.min(offset + value.length, span.end) - span.start;
        if (end > start && span.source.body.slice(start, end).trim()) {
          const list = ranges.get(span.source.id) ?? [];
          list.push({ start, end });
          ranges.set(span.source.id, list);
        }
      }
    }
    if (!part.added) oldOffset += value.length;
    if (!part.removed) newOffset += value.length;
  }
  return ranges;
}
