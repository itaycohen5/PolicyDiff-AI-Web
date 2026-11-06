"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Comparison, ComparisonSummary, Policy, Source } from "@/lib/contracts";
import { Findings, SourceViewer } from "./findings";
import { BrandMark, Icon } from "./icons";

type Workspace = { policies: Policy[]; comparisons: ComparisonSummary[]; demoOnly: boolean; openAi: boolean };
type View = "compare" | "document" | "history";
const views = [{ id: "compare", label: "Compare" }, { id: "document", label: "Documents" },
  { id: "history", label: "History" }] as const;
const dateFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const demoQuestion = "What changed in section 4.2.1?";

async function api<T>(route: string, options?: RequestInit): Promise<T> {
  const response = await fetch("/api/" + route, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
const post = { method: "POST" };

export default function PolicyDiff() {
  const [workspace, setWorkspace] = useState<Workspace>();
  const [view, setView] = useState<View>("compare");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selection, setSelection] = useState({ old: "", next: "" });
  const [uploadTo, setUploadTo] = useState("");
  const [question, setQuestion] = useState(demoQuestion);
  const [mode, setMode] = useState<"local" | "openai">("local");
  const [comparison, setComparison] = useState<Comparison>();
  const [source, setSource] = useState<Source>();

  const refresh = useCallback(async () => {
    const result = await api<Workspace>("workspace");
    setWorkspace(result);
    return result;
  }, []);

  useEffect(() => {
    let active = true;
    api<Workspace>("workspace").then((result) => {
      if (active) setWorkspace(result);
    }).catch((failure: Error) => {
      if (active) setError(failure.message);
    });
    return () => { active = false; };
  }, []);

  const processing = workspace?.policies.some((policy) => policy.versions.some((version) => version.status === "processing"));
  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => { refresh().catch(() => {}); }, 2500);
    return () => window.clearInterval(timer);
  }, [processing, refresh]);

  const demo = workspace?.policies.find((policy) => policy.demo);
  const editions = workspace?.policies.flatMap((policy) => policy.versions
    .filter((version) => version.status === "ready").map((version) => ({ ...version, policy: policy.name, policyId: policy.id }))) || [];
  const selectedOld = editions.find((edition) => edition.id === selection.old);
  const selectedNew = editions.find((edition) => edition.id === selection.next);
  const matching = editions.filter((edition) => edition.policyId === selectedOld?.policyId &&
    edition.id !== selection.old && edition.effective_on >= (selectedOld?.effective_on || ""));
  const ready = Boolean(selectedOld && selectedNew && question.trim());

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The request failed.");
    } finally {
      setBusy("");
    }
  }

  function navigate(next: View) {
    setView(next);
    window.scrollTo({ top: 0 });
  }

  function useDemo() {
    navigate("compare");
    return run("Loading the demo…", async () => {
      const { versions } = await api<{versions: string[]}>("demo", post);
      await refresh();
      setSelection({ old: versions[0], next: versions[1] });
      setQuestion(demoQuestion);
      setNotice("Demo editions loaded. Run the comparison to inspect the change.");
    });
  }

  async function process(id: string) {
    const request = api<{status: string; error?: string}>("ingest/" + id, post);
    const timer = window.setInterval(() => { refresh().catch(() => {}); }, 2000);
    try {
      const result = await request;
      if (result.status === "failed") throw new Error(result.error || "PDF ingestion failed.");
      if (result.status !== "ready") throw new Error("This edition is already being indexed. Check the document library.");
    } finally {
      window.clearInterval(timer);
      await refresh();
    }
  }

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (uploadTo) data.delete("name");
    return run("Ingesting PDF…", async () => {
      const result = await api<{id: string; duplicate: boolean}>("versions", { ...post, body: data });
      await refresh();
      await process(result.id);
      form.reset();
      setUploadTo("");
      setNotice(result.duplicate ? "This PDF is already in the library." : "PDF saved and indexed.");
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return run("Comparing editions…", async () => {
      setComparison(await api<Comparison>("comparisons", { ...post, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldId: selection.old, newId: selection.next, question, mode }) }));
      await refresh();
    });
  }

  function reopen(id: string) {
    return run("Opening comparison…", async () => {
      const saved = await api<Comparison>("comparisons/" + id);
      setSelection({ old: saved.old_id, next: saved.new_id });
      setQuestion(saved.question);
      setMode(saved.mode === "openai" && !workspace?.openAi ? "local" : saved.mode);
      setComparison(saved);
      navigate("compare");
    });
  }

  return <div className="workspace">
    <a className="skip-link" href="#workspace-content">Skip to workspace</a>
    <aside className="sidebar" aria-label="Workspace sidebar">
      <button className="brand" type="button" onClick={() => navigate("compare")} aria-label="PolicyDiff AI home"><BrandMark /><span>PolicyDiff <b>AI</b></span></button>
      <nav className="workspace-nav" aria-label="Workspace">
        {views.map(({ id, label }) => <button key={id} type="button" aria-current={view === id ? "page" : undefined} onClick={() => navigate(id)}>
          <Icon name={id} />{label}
        </button>)}
      </nav>
      <div className="sidebar-footer"><Icon name="lock" /><div><strong>{workspace?.demoOnly ? "Demo workspace" : "Policy workspace"}</strong>
        <p>{workspace?.openAi ? "OpenAI explanations enabled" : "Local comparison available"}</p></div></div>
    </aside>

    <main id="workspace-content" tabIndex={-1} className="canvas">
      <div className="canvas-inner">
        <div className="breadcrumb"><span>Workspace</span><Icon name="chevron" /><strong>{views.find(({ id }) => id === view)?.label}</strong></div>
        <div className="heading">
          <div>
            <h1>{view === "compare" ? "Compare policy editions" : view === "document" ? "Document library" : "Comparison history"}</h1>
            <p>{view === "compare" ? "See what changed between editions and verify it in the original wording."
              : view === "document" ? "Manage policy editions and check which PDFs are ready to compare."
              : "Return to saved comparisons and the source pages behind each finding."}</p>
          </div>
          {view !== "history" && <button className="button secondary demo-button" type="button" onClick={useDemo} disabled={!!busy || !workspace}>
            <Icon name="document" />{demo ? "Select demo editions" : "Load demo editions"}</button>}
        </div>

        <div className="feedback" aria-live="polite">
          {busy && <p className="message"><span className="activity-dot" />{busy}
            {(busy.includes("demo") || busy.includes("PDF")) && " The first run may take a minute."}</p>}
          {notice && <p className="message"><Icon name="check" />{notice}</p>}
        </div>
        {error && <div className="message error" role="alert"><Icon name="info" /><span>{error}</span>
          {!workspace && <button className="button secondary" onClick={() => run("Reloading…", async () => { await refresh(); })}>Retry</button>}</div>}
        {!workspace && !error && <div className="panel result-state" role="status"><div className="skeleton"><span /><span /><span /></div><p>Opening workspace…</p></div>}

        {workspace && <>
          <div hidden={view !== "compare"}>
            <div className="setup-grid">
              <form className="panel compare-form" onSubmit={submit}>
                <div className="form-heading"><Icon name="compare" /><h2>Comparison setup</h2></div>
                <div className="fields editions">
                  <label><span>Older edition</span><select required value={selection.old} onChange={(event) => setSelection({ old: event.target.value, next: "" })}>
                    <option value="">Select an edition</option>{editions.map((edition) => <option key={edition.id} value={edition.id}>{edition.policy} · {edition.label}</option>)}
                  </select></label>
                  <label><span>Newer edition</span><select required value={selection.next} disabled={!selectedOld} onChange={(event) => setSelection({ ...selection, next: event.target.value })}>
                    <option value="">{selectedOld ? "Select a newer edition" : "Choose the older edition first"}</option>
                    {matching.map((edition) => <option key={edition.id} value={edition.id}>{edition.label}</option>)}
                  </select></label>
                </div>
                <label><span>Comparison question</span><input required maxLength={400} value={question} onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask about a section, coverage or exclusion" /></label>
                <fieldset className="modes">
                  <legend>Analysis mode</legend>
                  <div className="fields">
                    <label className="mode">
                      <input type="radio" name="analysis-mode" checked={mode === "local"} onChange={() => setMode("local")} />
                      <span><strong>Local wording comparison</strong><small>Find and show wording changes</small></span>
                    </label>
                    <label className="mode">
                      <input type="radio" name="analysis-mode" checked={mode === "openai"} onChange={() => setMode("openai")} disabled={!workspace.openAi} />
                      <span><strong>OpenAI explanation</strong><small>{workspace.openAi ? "Explain changes in plain language" : workspace.demoOnly ? "Unavailable in public demo" : "Requires an API key"}</small></span>
                    </label>
                  </div>
                </fieldset>
                {mode === "openai" && <p className="muted mode-note">Your question and retrieved excerpts are sent to OpenAI.</p>}
                <div className="form-footer">
                  <span className="muted">{ready ? "Ready to compare" : "Select two editions of the same policy"}</span>
                  <button className="button primary" disabled={!!busy || !ready}>Compare editions<Icon name="arrow" /></button>
                </div>
              </form>

              <aside className="pair-panel" aria-labelledby="pair-title">
                <h2 id="pair-title">Document pair</h2>
                <p className="pair-caption">{selectedOld?.policy || (demo ? "Available demo · Ontario OAP 1" : "Choose a policy to begin")}</p>
                {[{ label: "Older edition", edition: selectedOld, demoLabel: demo?.versions[0]?.label },
                  { label: "Newer edition", edition: selectedNew, demoLabel: demo?.versions[1]?.label }].map(({ label, edition, demoLabel }) =>
                  <div className="pair-edition" key={label}>
                    <Icon name="document" /><div><span>{label}</span>
                      <strong>{edition?.label || (!selectedOld && demoLabel ? demoLabel : "Awaiting selection")}</strong>
                      {edition && <small>{dateFormat.format(new Date(edition.effective_on))} · {edition.page_count ?? "—"} pages</small>}
                    </div>
                  </div>)}
                <p className="pair-note"><Icon name="info" />Every finding includes available excerpts and links to their PDF pages.</p>
              </aside>
            </div>
            <Findings key={comparison?.id || "uncompared"} comparison={comparison} pending={busy === "Comparing editions…"} canCompare={ready} onSource={setSource} />
          </div>

          <div className="library-grid" hidden={view !== "document"}>
            <section className="panel document-list" aria-labelledby="library-heading">
              <div className="section-head"><h2 id="library-heading">Policy editions</h2><span className="result-count">{editions.length} indexed</span></div>
              {!workspace.policies.length && <p className="muted panel-empty">Load the demo or add your first PDF edition.</p>}
              {workspace.policies.map((policy) => <div className="policy" key={policy.id}>
                <div className="policy-heading"><Icon name="document" /><h3>{policy.name}</h3>{policy.demo && <span>Demo</span>}</div>
                <ul>{policy.versions.map((version) => <li className="edition" key={version.id}>
                  <div className="edition-title"><strong>{version.label}</strong>
                    <small>{dateFormat.format(new Date(version.effective_on))}{version.page_count ? " · " + version.page_count + " pages" : ""}</small>
                    {version.error && <p className="edition-error">{version.error}</p>}</div>
                  <div className="edition-actions"><span className={"edition-status " + version.status}>{version.status}</span>
                    {version.can_resume && <button className="button secondary" disabled={!!busy} onClick={() => run("Ingesting PDF…", () => process(version.id))}>
                      {version.attempts ? "Retry ingestion" : "Start ingestion"}</button>}
                  </div>
                </li>)}</ul>
              </div>)}
            </section>
            {!workspace.demoOnly && <details className="panel upload">
              <summary><Icon name="plus" />Add a PDF edition</summary>
              <p className="muted">Choose a PDF with selectable text. Up to 12 MB and 160 pages.</p>
              <form onSubmit={upload}>
                <label><span id="upload-policy-label">Policy</span><select aria-labelledby="upload-policy-label" name="policyId" value={uploadTo} onChange={(event) => setUploadTo(event.target.value)}>
                  <option value="">Create a new policy</option>{workspace.policies.filter((policy) => !policy.demo).map((policy) =>
                    <option value={policy.id} key={policy.id}>{policy.name}</option>)}
                </select></label>
                {!uploadTo && <label><span>Policy name</span><input name="name" required maxLength={120} /></label>}
                <div className="fields"><label><span>Edition name</span><input name="label" required maxLength={80} /></label>
                  <label><span>Effective date</span><input name="effectiveOn" type="date" required /></label></div>
                <label><span>Text PDF</span><input name="file" type="file" accept=".pdf,application/pdf" required /></label>
                <button className="button primary" disabled={!!busy}><Icon name="upload" />Upload and index</button>
              </form>
            </details>}
          </div>

          <section className="panel history-panel" hidden={view !== "history"} aria-labelledby="history-heading">
            <div className="section-head"><h2 id="history-heading">Saved comparisons</h2><span className="result-count">{workspace.comparisons.length} saved</span></div>
            {!workspace.comparisons.length && <p className="muted panel-empty">Run a comparison to start your history.</p>}
            <ul className="history">{workspace.comparisons.map((item) => <li key={item.id}>
              <button type="button" disabled={!!busy} onClick={() => reopen(item.id)}>
                <Icon name="history" /><span><strong>{item.question}</strong>
                  <small>{item.policy_name} · {item.old_label} → {item.new_label}</small></span>
                <time dateTime={item.created_at}>{dateFormat.format(new Date(item.created_at))}</time><Icon name="chevron" />
              </button>
            </li>)}</ul>
          </section>
        </>}
      </div>
    </main>
    {source && <SourceViewer source={source} onClose={() => setSource(undefined)} />}
  </div>;
}
