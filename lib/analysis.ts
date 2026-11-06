import type { Kind } from "./contracts";
import type { Chunk } from "./retrieval";

export type Candidate = { section: string; kind: Kind; description: string; old: Chunk[]; next: Chunk[] };
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
        old: old.slice(0, 2), next: next.slice(0, 2),
      });
    } else {
      const renumbered = oldSection !== newSection;
      const same = compact(stripSection(old.map((item) => item.body).join(" "))) === compact(stripSection(next.map((item) => item.body).join(" ")));
      if (same && !renumbered) continue;
      const first = old.findIndex((item, index) => compact(stripSection(item.body)) !== compact(stripSection(next[index]?.body || "")));
      const start = first === -1 ? 0 : first;
      const oldStart = Math.min(start, old.length - 1);
      const newStart = Math.min(start, next.length - 1);
      const kind = reserved(old) && !reserved(next) ? "added" : reserved(next) && !reserved(old) ? "removed" : "changed";
      rows.push({
        section: renumbered ? oldSection + " → " + newSection : requested, kind,
        description: kind === "added" ? "The older edition explicitly marked this section as reserved or deleted."
          : kind === "removed" ? "The newer edition explicitly marks this section as reserved or deleted."
            : (renumbered ? "Section renumbered. " : "") + (same ? "The extracted wording matches."
              : describeChange(old[oldStart], next[newStart])),
        old: old.slice(oldStart, oldStart + 2),
        next: next.slice(newStart, newStart + 2),
      });
    }
    if (rows.length === 10) break;
  }
  if (!sections.length && (rankedOld.length || rankedNew.length)) {
    rows.push({
      section: "Unnumbered text", kind: "review", description: "Relevant text was retrieved without comparable section numbers.",
      old: rankedOld.slice(0, 2), next: rankedNew.slice(0, 2),
    });
  }
  return rows;
}

export type Proposed = { row: number; explanation: string; oldIds: string[]; newIds: string[] };

export function applyExplanations(candidates: Candidate[], proposals: Proposed[]) {
  return candidates.map((candidate, row) => {
    const proposal = proposals.find((item) => item.row === row);
    if (!proposal || candidate.kind !== "changed") return candidate;
    const matches = (ids: string[], chunks: Chunk[]) =>
      ids.length === chunks.length && new Set(ids).size === ids.length && chunks.every((chunk) => ids.includes(chunk.id));
    if (!matches(proposal.oldIds, candidate.old) || !matches(proposal.newIds, candidate.next)) return candidate;
    return { ...candidate, description: proposal.explanation };
  });
}
