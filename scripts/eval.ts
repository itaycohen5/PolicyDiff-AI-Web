import { readFile, writeFile } from "node:fs/promises";
import { compare } from "../lib/comparisons";
import { closeDb, db } from "../lib/db";
import { closeEncoder } from "../lib/embedding";
import { loadDemo } from "../lib/ingestion";
import { prepareQuery, retrieve } from "../lib/retrieval";
import type { Comparison } from "../lib/contracts";

type Case = { id: number; question: string; old: string | null; next: string | null;
  oldPage: number | null; newPage: number | null; expected: string; note: string };
const percentile = (numbers: number[], fraction: number) => numbers.slice().sort((a, b) => a - b)[Math.ceil(numbers.length * fraction) - 1];

function labeledOutcome(report: Comparison, item: Case) {
  const sections = [item.old, item.next, item.old + " → " + item.next].filter(Boolean);
  const target = report.findings.find((finding) => sections.includes(finding.section));
  if (target) return target.kind;
  if ([item.old, item.next].some((section) => section !== null && report.unchanged_sections.includes(section))) return "unchanged";
  if (item.expected === "review" && report.findings.every((finding) => finding.kind === "review")) return "review";
  return "unresolved";
}

async function evaluate() {
  delete process.env.DATABASE_URL;
  process.env.POLICYDIFF_DATA_DIR = "memory://";
  const cases = JSON.parse(await readFile("evals/oap-cases.json", "utf8")) as Case[];
  const [oldId, newId] = await loadDemo();
  const store = await db();
  const variants = [
    { name: "Keyword only", hybrid: false, hits: 0, total: 0, times: [] as number[] },
    { name: "Keyword + MiniLM / RRF", hybrid: true, hits: 0, total: 0, times: [] as number[] },
  ];
  const results = [];
  const compareTimes: number[] = [];
  const originalQuestionTimes: number[] = [];
  let matchedOutcome = 0;
  let matchedOriginalOutcome = 0;
  let checkedSupport = 0;
  let correctSupport = 0;

  for (const item of cases) {
    const retrievalResults = [];
    for (const variant of variants) {
      const started = performance.now();
      const query = await prepareQuery(item.question, variant.hybrid);
      const [older, newer] = await Promise.all([retrieve(store, oldId, query, 5), retrieve(store, newId, query, 5)]);
      variant.times.push(performance.now() - started);
      const hit = (section: string | null, rows: typeof older) => {
        if (!section) return "—";
        variant.total += 1;
        if (!rows.some((chunk) => chunk.section === section)) return "miss";
        variant.hits += 1;
        return "hit";
      };
      retrievalResults.push(hit(item.old, older) + "/" + hit(item.next, newer));
    }

    const originalStart = performance.now();
    const originalReport = await compare({ oldId, newId, question: item.question, mode: "local" });
    originalQuestionTimes.push(performance.now() - originalStart);
    const originalActual = labeledOutcome(originalReport, item);
    if (originalActual === item.expected) matchedOriginalOutcome += 1;

    // Targeted comparisons use the labeled section and isolate alignment quality from retrieval.
    const section = item.next || item.old;
    const start = performance.now();
    const report = await compare({ oldId, newId, question: section ? "What changed in section " + section + "?" : item.question, mode: "local" });
    compareTimes.push(performance.now() - start);
    const target = report.findings[0];
    const actual = target?.kind || "unchanged";
    if (actual === item.expected) matchedOutcome += 1;
    let support = "—";
    if (item.expected === "changed") {
      checkedSupport += 1;
      const hasOld = target?.sources.some((source) => source.side === "old" && source.page === item.oldPage);
      const hasNew = target?.sources.some((source) => source.side === "new" && source.page === item.newPage);
      if (hasOld && hasNew) correctSupport += 1;
      support = hasOld && hasNew ? "both labeled pages" : "page miss";
    }
    results.push("| " + [item.id, item.question, ...retrievalResults, item.expected, actual, originalActual, support].join(" | ") + " |");
  }

  const report = [
    "# PolicyDiff AI evaluation",
    "",
    "Thirty labeled questions on the bundled 2022 and 2026 OAP 1 PDFs. Retrieval uses each original question and checks whether each labeled section appears in the first five chunks of its edition. Sides without a labeled section are excluded from this rate. Both methods use the same corpus and exact section lookup when present. Timings are from a warm local run and include the query embedding for hybrid search.",
    "",
    "| Retrieval | Edition-side hit@5 | Median | P95 |",
    "| --- | ---: | ---: | ---: |",
    ...variants.map(({ name, hits, total, times }) =>
      "| " + name + " | " + hits + "/" + total + " (" + (100 * hits / total).toFixed(1) + "%) | " +
      percentile(times, 0.5).toFixed(1) + " ms | " + percentile(times, 0.95).toFixed(1) + " ms |"),
    "",
    "- Targeted comparison outcome agreement: " + matchedOutcome + "/" + cases.length + ".",
    "- Original-question labeled outcome agreement: " + matchedOriginalOutcome + "/" + cases.length + ". This separate end-to-end measurement uses each original question without inserting its labeled section number.",
    "- Original-question scoring requires a finding for the labeled section or renumbered pair, or the labeled section in the comparison's persisted unchanged_sections metadata. Empty results alone do not count as unchanged. For insufficient-evidence cases, all returned findings must require review. Other unmatched results are unresolved. Extra unrelated findings are not scored for precision by this metric.",
    "- Changed cases with citations on both labeled PDF pages: " + correctSupport + "/" + checkedSupport + ". This measures page support against the hand-labeled references, not semantic entailment.",
    "- Targeted local comparison median: " + percentile(compareTimes, 0.5).toFixed(1) + " ms. P95: " + percentile(compareTimes, 0.95).toFixed(1) + " ms.",
    "- Original-question local comparison median: " + percentile(originalQuestionTimes, 0.5).toFixed(1) + " ms. P95: " + percentile(originalQuestionTimes, 0.95).toFixed(1) + " ms.",
    "- ClauseLens output quality and latency require a separate run with an API key. The measurements here are for local analysis.",
    "- The optional --check gate requires all labeled targeted outcomes and changed-case page references to match. Retrieval must retain at least 25/53 keyword hits and 36/53 hybrid hits, and original-question outcomes at least 26/30, the recorded corpus baseline. The labels are preserved when the gate fails.",
    "",
    "| Case | Question | Keyword old/new | Hybrid old/new | Expected | Targeted actual | Original-question actual | Page support |",
    "| ---: | --- | --- | --- | --- | --- | --- | --- |",
    ...results,
    "",
  ].join("\n");
  if (process.argv.includes("--write")) await writeFile("evals/RESULTS.md", report);
  console.log(report.split("| Case |")[0]);
  if (process.argv.includes("--check")) {
    const retrievalMatchesBaseline = variants[0].total === 53 && variants[0].hits >= 25 &&
      variants[1].total === 53 && variants[1].hits >= 36;
    if (matchedOutcome !== cases.length || correctSupport !== checkedSupport || !retrievalMatchesBaseline || matchedOriginalOutcome < 26) {
      console.error("Evaluation regression detected. Inspect the recorded per-case results and source documents.");
      process.exitCode = 1;
    }
  }
}

try {
  await evaluate();
} finally {
  await closeEncoder();
  await closeDb();
}
