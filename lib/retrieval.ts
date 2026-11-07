import type { Sql } from "./db";
import { embeddings, vectorLiteral } from "./embedding";

export type Chunk = { id: string; version_id: string; page: number; ordinal: number; section: string; body: string };
const fields = "id, version_id, page, ordinal, section, body";

export function explicitSections(query: string) {
  return [...new Set(query.match(/\b\d{1,2}(?:\.\d{1,3}){1,4}\b/g) || [])];
}

export async function prepareQuery(question: string, hybrid: boolean) {
  const topic = question.replace(/\b(?:change[ds]?|differences?|compare[ds]?|older|newer|versions?|editions?|polic(?:y|ies)|sections?|between)\b/gi, " ")
    .replace(/\s+/g, " ").trim();
  return { question: topic, sections: explicitSections(question), vector: hybrid ? vectorLiteral((await embeddings([topic]))[0]) : null };
}

export async function retrieve(store: Sql, version: string, query: Awaited<ReturnType<typeof prepareQuery>>, limit = 12) {
  const { rows } = await store.query<Chunk>(`
    WITH terms_query AS (
      SELECT replace(plainto_tsquery('english', $2)::text, ' & ', ' | ')::tsquery AS value
    ), keyword AS (
      SELECT id, row_number() OVER (
        ORDER BY ts_rank_cd(terms, (SELECT value FROM terms_query)) DESC, ordinal
      ) AS rank
      FROM chunks WHERE version_id = $1 AND terms @@ (SELECT value FROM terms_query)
      ORDER BY ts_rank_cd(terms, (SELECT value FROM terms_query)) DESC, ordinal
      LIMIT 30
    ), semantic AS (
      SELECT id, row_number() OVER (ORDER BY embedding <=> $3::vector, ordinal) AS rank
      FROM chunks WHERE version_id = $1 AND $3::vector IS NOT NULL AND embedding <=> $3::vector <= 0.65
      ORDER BY embedding <=> $3::vector, ordinal
      LIMIT 30
    )
    SELECT ${fields.split(", ").map((field) => "c." + field).join(", ")}
    FROM chunks c LEFT JOIN keyword k ON k.id = c.id LEFT JOIN semantic s ON s.id = c.id
    WHERE c.version_id = $1 AND (c.section = ANY($4::text[]) OR k.rank IS NOT NULL OR s.rank IS NOT NULL)
    ORDER BY (c.section = ANY($4::text[])) DESC,
      coalesce(1.0 / (30 + k.rank), 0) + coalesce(1.0 / (30 + s.rank), 0) DESC, c.ordinal
    LIMIT $5
  `, [version, query.question, query.vector, query.sections, limit]);
  return rows;
}

export async function sectionEvidence(store: Sql, version: string, sections: string[]) {
  const { rows } = await store.query<Chunk>(`
    SELECT ${fields} FROM chunks WHERE version_id = $1 AND split_part(section, '.', 1) = ANY($2::text[])
    ORDER BY ordinal
  `, [version, [...new Set(sections.map((section) => section.split(".")[0]))]]);
  return rows;
}
