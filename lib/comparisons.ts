import { db } from "./db";
import { RequestError } from "./errors";
import { makeCandidates } from "./analysis";
import { explain } from "./model";
import { explicitSections, prepareQuery, retrieve, sectionEvidence } from "./retrieval";
import type { Comparison, ComparisonInput, ComparisonSummary, Finding } from "./contracts";
import { comparisonBudget, demoOnly, workspaceId } from "./workspace";

const summaries = `
  SELECT c.id, c.question, c.mode, c.unchanged_sections, c.old_id, c.new_id, v1.label AS old_label, v2.label AS new_label,
    p.name AS policy_name, c.created_at
  FROM comparisons c JOIN versions v1 ON v1.id = c.old_id JOIN versions v2 ON v2.id = c.new_id
  JOIN policies p ON p.id = c.policy_id
`;

export async function history() {
  const store = await db();
  const { rows } = await store.query<ComparisonSummary>(
    summaries + " WHERE ($1::boolean IS FALSE OR p.demo) AND c.workspace_id = $2 ORDER BY c.created_at DESC LIMIT 100",
    [demoOnly(), workspaceId()],
  );
  return rows;
}

export async function getComparison(id: string): Promise<Comparison> {
  const store = await db();
  const { rows: [summary] } = await store.query<ComparisonSummary>(
    summaries + " WHERE c.id = $1 AND ($2::boolean IS FALSE OR p.demo) AND c.workspace_id = $3", [id, demoOnly(), workspaceId()],
  );
  if (!summary) throw new RequestError("Comparison not found.", 404);
  const { rows } = await store.query<Finding>(`
    SELECT f.id, f.section, f.kind, f.description, f.ai_explanation, f.ai_context_complete, coalesce(
      (SELECT jsonb_agg(jsonb_build_object('id', c.id, 'side', s.side, 'body', c.body,
        'page', s.page, 'version_id', s.version_id) ORDER BY s.side DESC, s.position, c.ordinal)
      FROM sources s JOIN chunks c ON c.id = s.chunk_id WHERE s.finding_id = f.id), '[]') AS sources
    FROM findings f WHERE f.comparison_id = $1 ORDER BY f.position
  `, [id]);
  return { ...summary, findings: rows };
}

export async function compare({ oldId, newId, question, mode }: ComparisonInput) {
  if (oldId === newId) throw new RequestError("Select two different editions.");
  if (explicitSections(question).length > 10) {
    throw new RequestError("Compare up to 10 section numbers at a time. Split this question into smaller comparisons.", 422);
  }
  const store = await db();
  const { rows } = await store.query<{id: string; policy_id: string; date: string; demo: boolean}>(`
    SELECT v.id, v.policy_id, v.effective_on::text AS date, p.demo
    FROM versions v JOIN policies p ON p.id = v.policy_id JOIN ingestion_jobs j ON j.version_id = v.id
    WHERE v.id = ANY($1::uuid[]) AND j.status = 'ready' AND (p.demo OR p.workspace_id = $2)
  `, [[oldId, newId], workspaceId()]);
  const oldVersion = rows.find((row) => row.id === oldId);
  const newVersion = rows.find((row) => row.id === newId);
  if (!oldVersion || !newVersion || oldVersion.policy_id !== newVersion.policy_id ||
      (demoOnly() && !oldVersion.demo)) {
    throw new RequestError("Select two ready editions of the same policy.");
  }
  if (oldVersion.date > newVersion.date) throw new RequestError("Select the older edition first.");
  await comparisonBudget();
  const query = await prepareQuery(question, true);
  const [rankedOld, rankedNew] = await Promise.all([retrieve(store, oldId, query), retrieve(store, newId, query)]);
  const ranked = rankedOld.flatMap((chunk, index) => [chunk.section, rankedNew[index]?.section || ""])
    .concat(rankedNew.map((chunk) => chunk.section));
  const sections = query.sections.length ? query.sections : [...new Set(ranked.filter(Boolean))].slice(0, 10);
  const [older, newer] = await Promise.all([sectionEvidence(store, oldId, sections), sectionEvidence(store, newId, sections)]);
  const candidates = makeCandidates(sections, older, newer, rankedOld, rankedNew);
  const unchanged = sections.filter((section) => makeCandidates([section], older, newer, rankedOld, rankedNew).length === 0);
  const findings = mode === "local" ? candidates : await explain(question, candidates);
  const comparisonId = await store.transaction(async (tx) => {
    const { rows: [created] } = await tx.query<{id: string}>(`
      INSERT INTO comparisons(policy_id, old_id, new_id, question, mode, unchanged_sections, workspace_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
    `, [oldVersion.policy_id, oldId, newId, question, mode, unchanged, workspaceId()]);
    for (const [position, finding] of findings.entries()) {
      const { rows: [saved] } = await tx.query<{id: string}>(`
        INSERT INTO findings(comparison_id, position, section, kind, description, ai_explanation, ai_context_complete)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
      `, [created.id, position, finding.section, finding.kind, finding.description, finding.aiExplanation ?? null, finding.kind === "changed"]);
      for (const side of ["old", "new"] as const) {
        for (const [position, chunk] of (side === "old" ? finding.old : finding.next).entries()) {
          await tx.query(`
            INSERT INTO sources(comparison_id, finding_id, old_id, new_id, side, version_id, chunk_id, page, position)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          `, [created.id, saved.id, oldId, newId, side, chunk.version_id, chunk.id, chunk.page, position]);
        }
      }
    }
    return created.id;
  });
  return getComparison(comparisonId);
}
