import type { Kind } from "./contracts";
import type { Chunk } from "./retrieval";

export type Candidate = { section: string; kind: Kind; description: string; aiExplanation?: string; old: Chunk[]; next: Chunk[] };
const normalize = (body: string) => body.normalize("NFKC").replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
const compact = (body: string) => normalize(body).replace(/\s/g, "");
const stripSection = (text: string) => text.replace(/^\d+(?:\.\d+)+\.?\s+/, "");
const reserved = (chunks: Chunk[]) => chunks.length === 1 &&
  /^\[?(?:reserved|deleted|repealed)\]?\.?$/i.test(normalize(stripSection(chunks[0].body)));

function grouped(chunks: Chunk[]) {
  const groups = new Map<string, Chunk[]>();
  for (const chunk of chunks) {
    const list = groups.get(chunk.section) || [];
    list.push(chunk);
    groups.set(chunk.section, list);
  }
  return groups;
}

function title(chunks: Chunk[]) {
  const line = chunks[0]?.body.split("\n")[0] || "";
  return compact(stripSection(line)).toLowerCase();
}

function findCorresponding(key: string, source: Chunk[], groups: Map<string, Chunk[]>) {
  const heading = title(source);
  if (!heading || reserved(source)) return [];
  const chapter = key.split(".")[0] + ".";
  const matches = [...groups].filter(([id, chunks]) => id.startsWith(chapter) && title(chunks) === heading);
  return matches.length === 1 ? matches[0][1] : [];
}

function describeChange(old: Chunk, next: Chunk) {
  const before = normalize(stripSection(old.body)).split(" ");
  const after = normalize(stripSection(next.body)).split(" ");
  let start = 0;
  while (start < before.length && before[start] === after[start]) start += 1;
  const preview = (words: string[]) => {
    const text = words.slice(Math.max(0, start - 2), start + 8).join(" ");
    return text.length > 110 ? text.slice(0, 110) + "…" : text;
  };
  return "Edited passage: “" + preview(before) + "” → “" + preview(after) + "”.";
}

// Focus on the changed passage, retaining the full section for source inspection and AI context.
function focus(chunks: Chunk[], index: number) {
  const start = Math.min(index, chunks.length - 1);
  return [...chunks.slice(start, start + 2), ...chunks.slice(0, start), ...chunks.slice(start + 2)];
}

export function makeCandidates(sections: string[], older: Chunk[], newer: Chunk[], rankedOld: Chunk[], rankedNew: Chunk[]) {
  const oldGroups = grouped(older);
  const newGroups = grouped(newer);
  const rows: Candidate[] = [];
  const seen = new Set<string>();
  for (const requested of sections) {
    let old = oldGroups.get(requested) || [];
    let next = newGroups.get(requested) || [];
    if (next.length && (!old.length || (title(old) !== title(next) && !reserved(old)))) {
      const match = findCorresponding(requested, next, oldGroups);
      if (match.length) old = match;
    }
    if (old.length && !next.length) next = findCorresponding(requested, old, newGroups);
    const oldSection = old[0]?.section;
    const newSection = next[0]?.section;
    const pair = (oldSection || "") + "/" + (newSection || "") + (!oldSection && !newSection ? requested : "");
    if (seen.has(pair)) continue;
    seen.add(pair);

    if (!old.length && !next.length) {
      rows.push({ section: requested, kind: "review", description: "No evidence for this section was found in either edition.", old: [], next: [] });
    } else if (!old.length || !next.length) {
      rows.push({
        section: requested, kind: "review", description: "A corresponding section was not found in one edition. Check for renumbering or missing text.",
        old, next,
      });
    } else if (title(old) !== title(next) && !reserved(old) && !reserved(next)) {
      rows.push({
        section: requested, kind: "review",
        description: "This section number has different headings. A unique corresponding section could not be confirmed.",
        old, next,
      });
    } else {
      const renumbered = oldSection !== newSection;
      const same = compact(stripSection(old.map((item) => item.body).join(" "))) === compact(stripSection(next.map((item) => item.body).join(" ")));
      if (same && !renumbered) continue;
      const first = Array.from({ length: Math.max(old.length, next.length) }, (_, index) => index)
        .find((index) => compact(stripSection(old[index]?.body || "")) !== compact(stripSection(next[index]?.body || ""))) ?? 0;
      const start = first;
      const oldStart = Math.min(start, old.length - 1);
      const newStart = Math.min(start, next.length - 1);
      const kind = reserved(old) && !reserved(next) ? "added" : reserved(next) && !reserved(old) ? "removed" : "changed";
      rows.push({
        section: renumbered ? oldSection + " → " + newSection : requested, kind,
        description: kind === "added" ? "The older edition explicitly marked this section as reserved or deleted."
          : kind === "removed" ? "The newer edition explicitly marks this section as reserved or deleted."
            : (renumbered ? "Section renumbered. " : "") + (same ? "The extracted wording matches."
              : describeChange(old[oldStart], next[newStart])),
        old: focus(old, oldStart),
        next: focus(next, newStart),
      });
    }
    if (rows.length === 10) break;
  }
  if (!sections.length) {
    rows.push({
      section: "Unconfirmed match", kind: "review",
      description: rankedOld.length || rankedNew.length
        ? "Text was retrieved without comparable section numbers. Review the excerpts before drawing conclusions."
        : "No relevant section was found for this question. Try a specific topic or section number.",
      old: rankedOld.slice(0, 2), next: rankedNew.slice(0, 2),
    });
  }
  return rows;
}

export type Proposed = { row: number; explanation: string; oldIds: string[]; newIds: string[] };

export function applyExplanations(candidates: Candidate[], proposals: Proposed[]) {
  return candidates.map((candidate, row) => {
    const matchesForRow = proposals.filter((item) => item.row === row);
    if (matchesForRow.length !== 1 || candidate.kind !== "changed") return candidate;
    const proposal = matchesForRow[0];
    const matches = (ids: string[], chunks: Chunk[]) =>
      chunks.length > 0 && ids.length === chunks.length && new Set(ids).size === ids.length && chunks.every((chunk) => ids.includes(chunk.id));
    if (!matches(proposal.oldIds, candidate.old) || !matches(proposal.newIds, candidate.next)) return candidate;
    return { ...candidate, aiExplanation: proposal.explanation };
  });
}
