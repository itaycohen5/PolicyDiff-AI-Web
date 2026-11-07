# PolicyDiff AI

Compare insurance policy editions in a review workspace. PolicyDiff indexes text PDFs, finds matching sections across versions, and links findings to the PDF pages an analyst can verify. The workspace includes two public editions of Ontario Automobile Policy OAP 1.

## Run on Windows

Install Node.js 24, Python 3.11 or later with pip, and curl. Open PowerShell in the project folder.

Stop a running development or production server before `npm ci` on Windows so native Next.js modules can be replaced.

```powershell
npm.cmd ci
npm.cmd run setup
npm.cmd run dev
```

Open [PolicyDiff AI](http://127.0.0.1:3000), select **Load demo editions**, and click **Compare editions**. The example pairs older section 4.3.1 with newer section 4.2.1. Select a source link to open the original PDF at its physical page number. Browser PDF viewers may also show a printed page label that differs from the physical number.

Setup installs the Python PDF extractor into `.python/` and downloads about 23 MB of pinned MiniLM model files into `.data/models/`. After that, local comparison runs offline. The first API request applies the database migration automatically. The default local database is PostgreSQL in a single PGlite process, with persistent data in `.data/postgres/`. Run one app process per embedded database directory.

### ClauseLens (optional AI explanation)

Create `.env.local` from `.env.example` if it does not already exist. Set `OPENROUTER_API_KEY` with a key from [OpenRouter](https://openrouter.ai/settings/keys) and restart the app. ClauseLens uses `nvidia/nemotron-3.5-super-vl:free` and sends the question and selected excerpts through OpenRouter to the model provider. The interface shows each accepted AI explanation above the comparison and PDF sources. If the free model is rate-limited or unavailable, switch to local comparison.

### PostgreSQL server with Docker

For a separate database server, run `docker compose up -d --wait postgres` and set this in `.env.local`, then restart Next.js.

```dotenv
DATABASE_URL=postgresql://policydiff:policydiff@127.0.0.1:5442/policydiff
```

The same migration applies to both PostgreSQL modes. Choose the database before loading documents. The two databases have separate data. The migration role needs permission to create tables and enable the vector extension.

## Architecture

```mermaid
flowchart LR
  UI["Next.js workspace"] --> API["Next.js API"]
  API --> DB["PostgreSQL + pgvector"]
  API --> Worker["Python PDF extractor"]
  Worker --> API
  API --> Encoder["Local MiniLM embeddings"]
  API --> LLM["OpenRouter structured explanations, optional"]
  LLM --> API
  DB --> Viewer["PDF source pages"]
  Viewer --> UI
```

- **Ingestion.** A transaction stores the PDF, version metadata and a queued job. A SHA-256 digest and database constraints deduplicate uploads per policy. An ingestion request claims the job, runs the Python extractor in a bounded subprocess, embeds chunks locally, and commits the index and ready status together. Failed jobs can be retried in the library. If a process exits mid-job, the five-minute lease expires and a new request can resume it. Claim tokens stop an expired worker from overwriting a newer attempt.
- **Retrieval.** Chunks retain their physical PDF page, section, text and order. PostgreSQL ranks keyword results and MiniLM vectors within each version, then combines the rankings with reciprocal rank fusion. Semantic candidates require cosine similarity of at least 0.35. This heuristic reduces irrelevant nearest-neighbor results and needs recalibration for other corpora. Explicit section numbers receive priority. The application uses exact vector distance on this corpus and a GIN index for full-text search.
- **Comparison.** The server aligns section numbers and checks for a unique matching heading in the same chapter to detect some renumbering. Local mode compares normalized text. An absent match is sent to review. Added and removed classifications require an explicit reserved or deleted marker in the paired section. The API persists findings and citations in one transaction. Composite foreign keys enforce the association between comparison, edition, chunk and page.
- **Model boundary.** ClauseLens receives every extracted chunk of each matched section in document order. Changed passages appear first in the source viewer and all remaining chunks stay available. The API accepts exactly one proposal per finding and only the expected citation IDs on each side. Historical AI explanations created before full-section context are retained in the database and require a new comparison before being shown as current explanations. A valid citation makes the excerpt inspectable. Whether a model's prose is supported by that excerpt still requires review.
- **PDF limits.** Uploads support text PDFs up to 12 MB and 160 pages. Extraction preserves page numbers. Multi-column layouts, tables, and sections without recognizable numbers can require manual review. Questions work best in English with the bundled corpus and encoder. The workspace compares selected sections and is intended for document review.

## Checks and evaluation

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run e2e
npm.cmd run eval -- --check
```

Playwright starts the production build on port 3418 and uses a temporary in-memory database. The core and browser tests cover parsing, upload, duplicate and concurrent processing, job retry, version isolation, invalid citations, opening a PDF page and reloading comparison history. The adversarial fixture includes instructions in a PDF and tests rejection of a cross-version citation proposal.

The [labeled evaluation set](evals/oap-cases.json) contains 30 OAP questions with expected section references and comparison outcomes. See [recorded results](evals/RESULTS.md) for the keyword and hybrid comparison, citation page coverage and warm latency. To refresh the report, run `npm.cmd run eval -- --write`.

The evaluation reports original-question outcomes separately from targeted section alignment. CI checks the labeled targeted outcomes, source-page references and recorded retrieval baseline with `--check`. The Hebrew [QA audit](docs/QA-AUDIT.he.md) records reproduced defects, exact fixes, test coverage and remaining measurement limits. [QA-FIXES.patch](docs/QA-FIXES.patch) contains the source changes from this audit.

## Deployment

See the [Hebrew Vercel deployment guide](docs/DEPLOYMENT.he.md) for the Supabase-backed production workspace and read-only previews. Production uploads and live ClauseLens require the owner's private workspace access code. The in-app **How to use** guide supports English and Hebrew. `Dockerfile.vercel` packages Next.js, Python and the public database CA certificate for Vercel's beta Container Runtime, with `fra1` selected in `vercel.json`.

`POLICYDIFF_STATIC_DEMO=1` serves only the checked-in public OAP 1 example and its previously generated AI explanation. This preview makes no live model calls and accepts no personal uploads. Full cloud mode requires a shared `DATABASE_URL`, a session-signing secret and a private upload access code. Its per-browser workspaces expire after one hour of inactivity, and expired data is removed on subsequent cleanup requests. See the deployment guide for exact limits and deletion behavior.

The local workspace is intended for one trusted operator and binds to loopback by default. For a public demonstration, use a long-running Node.js host with Python and the model files installed, a dedicated database, and `POLICYDIFF_DEMO_ONLY=1`. This mode hides user documents and blocks new uploads and external model calls at the API. Run `npm run setup`, `npm run build`, then `npm run start -- --hostname 0.0.0.0` behind an HTTPS reverse proxy that preserves the public Host header. Add request limits at the proxy and use a fresh database because public demo comparisons are shared. A private hosted workspace accepting uploads should sit behind authentication and be limited to trusted operators.

## Document and model sources

- [OAP 1, January 2022 edition](https://wwmic.com/wp-content/uploads/2023/11/OAP1-2022-Ontario-Automobile-Policy.pdf), published by the Queen's Printer for Ontario and hosted by West Wawanosh Mutual. SHA-256 `0e495e81d92edbd9d8ba49f777686c5cf0450403638b6348c8ce028f21a948ac`.
- [OAP 1, July 2026 edition](https://www.kemutual.com/wp-content/uploads/2026/04/Ontario-Automobile-Policy-OAP-1-July-1-2026.pdf), OAP1-EN.3, published by the King's Printer for Ontario and hosted by Kent & Essex Mutual. SHA-256 `54e527a5c3948c7b5336d9eff1bd2918387cb4cb84a936120378fca4353b780e`.
- [MiniLM ONNX model](https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/cb3d680149bf9a3209564e1b27ab3bb355b65707) powers the local encoder.
