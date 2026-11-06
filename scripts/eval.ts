import { readFile, writeFile } from "node:fs/promises";
import { compare } from "../lib/comparisons";
import { closeDb, db } from "../lib/db";
import { closeEncoder } from "../lib/embedding";
import { loadDemo } from "../lib/ingestion";
import { prepareQuery, retrieve } from "../lib/retrieval";

type Case = { id: number; question: string; old: string | null; next: string | null;
  oldPage: number | null; newPage: number | null; expected: string; note: string };
const percentile = (numbers: number[], fraction: number) => numbers.slice().sort((a, b) => a - b)[Math.ceil(numbers.length * fraction) - 1];

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
  let matchedOutcome = 0;
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

    // Targeted section comparisons isolate comparison quality from the retrieval benchmark.
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
    results.push("| " + [item.id, item.question, ...retrievalResults, item.expected, actual, support].join(" | ") + " |");
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
    "- Changed cases with citations on both labeled PDF pages: " + correctSupport + "/" + checkedSupport + ". This measures page support against the hand-labeled references, not semantic entailment.",
    "- Local comparison median: " + percentile(compareTimes, 0.5).toFixed(1) + " ms. P95: " + percentile(compareTimes, 0.95).toFixed(1) + " ms.",
    "- OpenAI output quality and latency require a separate run with an API key. The measurements here are for local analysis.",
    "",
    "| Case | Question | Keyword old/new | Hybrid old/new | Expected | Actual | Page support |",
    "| ---: | --- | --- | --- | --- | --- | --- |",
    ...results,
    "",
  ].join("\n");
  if (process.argv.includes("--write")) await writeFile("evals/RESULTS.md", report);
  console.log(report.split("| Case |")[0]);
}

try {
  await evaluate();
} finally {
  await closeEncoder();
  await closeDb();
}
