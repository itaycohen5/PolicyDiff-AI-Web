"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { analysisModeLabels, type Comparison, type ComparisonInput, type ComparisonSummary, type Policy, type Source } from "@/lib/contracts";
import { Findings, SourceViewer } from "./findings";
import { BrandMark, Icon } from "./icons";
import { UserGuide } from "./user-guide";
import { LanguageSwitch, useLanguage } from "./language";
import { UploadPanel } from "./upload-panel";

type Workspace = { policies: Policy[]; comparisons: ComparisonSummary[]; demoOnly: boolean; openRouter: boolean;
  temporary?: boolean; requiresAccessCode?: boolean; staticDemo?: boolean; maxPdfMb?: number };
type View = "compare" | "document" | "history" | "help";
const views = [{ id: "compare", label: "Compare" }, { id: "document", label: "Documents" },
  { id: "history", label: "History" }, { id: "help", label: "How to use" }] as const;
const demoQuestion = "What changed in section 4.2.1?";

async function api<T>(route: string, options?: RequestInit): Promise<T> {
  const timeout = options?.method === "POST" ? (route === "comparisons" ? 120_000 : 300_000) : 15_000;
  const signal = AbortSignal.timeout(timeout);
  let response: Response;
  let text: string;
  try {
    response = await fetch("/api/" + route, { cache: "no-store", ...options, signal });
    text = await response.text();
  } catch {
    throw new Error(signal.aborted
      ? "The request timed out. Refresh the workspace to check its status before trying again."
      : "Could not connect to the workspace. Check your connection and try again.");
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(response.ok ? "The server returned an unreadable response. Try again."
      : `The server could not complete the request (HTTP ${response.status}). Try again.`);
  }
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : `The request failed (HTTP ${response.status}).`);
  if (!data || typeof data !== "object" || (route === "workspace" &&
      (!Array.isArray(data.policies) || !Array.isArray(data.comparisons)))) {
    throw new Error("The server returned an unreadable response. Try again.");
  }
  return data;
}
const post = { method: "POST" };

export default function PolicyDiff() {
  const { locale, t } = useLanguage();
  const dateFormat = new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const [workspace, setWorkspace] = useState<Workspace>();
  const [view, setView] = useState<View>("compare");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [syncWarning, setSyncWarning] = useState("");
  const operation = useRef(false);
  const refreshGeneration = useRef(0);
  const [selection, setSelection] = useState({ old: "", next: "" });
  const [uploadTo, setUploadTo] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [question, setQuestion] = useState(demoQuestion);
  const [mode, setMode] = useState<ComparisonInput["mode"]>("local");
  const [comparison, setComparison] = useState<Comparison>();
  const [source, setSource] = useState<Source>();

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const result = await api<Workspace>("workspace");
    if (generation === refreshGeneration.current) setWorkspace(result);
    return result;
  }, []);

  const syncWorkspace = useCallback(async () => {
    try {
      const result = await refresh();
      setSyncWarning("");
      return result;
    } catch {
      setSyncWarning("Updates could not be refreshed. Your saved work is preserved.");
    }
  }, [refresh]);

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
  const indexing = busy === "Ingesting PDF…" || busy === "Loading the demo…";
  useEffect(() => {
    if (!processing && !indexing) return;
    let refreshing = false;
    const timer = window.setInterval(async () => {
      if (refreshing) return;
      refreshing = true;
      try { await syncWorkspace(); } finally { refreshing = false; }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [processing, indexing, syncWorkspace]);

  const demo = workspace?.policies.find((policy) => policy.demo);
  const uploadPolicy = workspace?.policies.some(policy => !policy.demo && policy.id === uploadTo) ? uploadTo : "";
  const editions = workspace?.policies.flatMap((policy) => policy.versions
    .filter((version) => version.status === "ready").map((version) => ({ ...version, policy: policy.name, policyId: policy.id }))) || [];
  const selectedOld = editions.find((edition) => edition.id === selection.old);
  const selectedNew = editions.find((edition) => edition.id === selection.next);
  const matching = editions.filter((edition) => edition.policyId === selectedOld?.policyId &&
    edition.id !== selection.old && edition.effective_on >= (selectedOld?.effective_on || ""));
  const ready = Boolean(selectedOld && matching.some((edition) => edition.id === selectedNew?.id) && question.trim() &&
    (mode === "local" || workspace?.openRouter));

  async function run(label: string, action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The request failed.");
    } finally {
      operation.current = false;
      setBusy("");
    }
  }

  function clearComparison() {
    setComparison(undefined);
    setSource(undefined);
  }

  function navigate(next: View) {
    setView(next);
    window.scrollTo({ top: 0 });
  }

  function useDemo() {
    navigate("compare");
    return run("Loading the demo…", async () => {
      const { versions } = await api<{versions: string[]}>("demo", post);
      await syncWorkspace();
      clearComparison();
      setSelection({ old: versions[0], next: versions[1] });
      setQuestion(demoQuestion);
      setNotice("Demo editions loaded. Run the comparison to inspect the change.");
    });
  }

  async function process(id: string) {
    let updated: Workspace | undefined;
    try {
      const result = await api<{status: string; error?: string}>("ingest/" + id, post);
      if (result.status === "failed") throw new Error(result.error || "PDF ingestion failed.");
      if (result.status !== "ready") throw new Error("This edition is already being indexed. Check the document library.");
    } finally {
      updated = await syncWorkspace();
    }
    return updated;
  }

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (uploadPolicy) data.delete("name");
    return run("Ingesting PDF…", async () => {
      const file = data.get("file");
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pdf") || file.size < 5 || file.size > (workspace?.maxPdfMb ?? 12) * 1024 * 1024) {
        throw new Error(`Choose a PDF of up to ${workspace?.maxPdfMb ?? 12} MB.`);
      }
      const result = await api<{id: string; duplicate: boolean}>("versions", { ...post, body: data });
      await syncWorkspace();
      const updated = await process(result.id);
      form.reset();
      const policy = updated?.policies.find(policy => policy.versions.some(version => version.id === result.id));
      setUploadTo(policy?.id ?? uploadPolicy);
      if (view === "compare" && policy) {
        clearComparison();
        if (question === demoQuestion) setQuestion("");
        const uploaded = policy.versions.find(version => version.id === result.id)!;
        const readyVersions = policy.versions.filter(version => version.status === "ready");
        setSelection(current => {
          const other = readyVersions.find(version => version.id === current.old && version.id !== uploaded.id)
            ?? readyVersions.find(version => version.id !== uploaded.id);
          if (!other) return { old: uploaded.id, next: "" };
          const [older, newer] = [other, uploaded].sort((a, b) => a.effective_on.localeCompare(b.effective_on));
          return { old: older.id, next: newer.id };
        });
        setUploadOpen(readyVersions.length < 2);
        setNotice(result.duplicate ? "This PDF is already in the library." : readyVersions.length < 2
          ? "First PDF ready. Add the second edition of the same policy here."
          : "Both PDFs are ready and selected. Ask your comparison question below.");
      } else {
        setNotice(result.duplicate ? "This PDF is already in the library." : "PDF saved and indexed.");
      }
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return run("Comparing editions…", async () => {
      setComparison(await api<Comparison>("comparisons", { ...post, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldId: selection.old, newId: selection.next, question, mode, answerLanguage: locale }) }));
      await syncWorkspace();
    });
  }

  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = new FormData(form).get("code");
    return run("Opening private uploads…", async () => {
      await api("access", { ...post, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      form.reset();
      await refresh();
      setNotice("Your temporary workspace is ready. Add your two PDFs here or in Documents.");
    });
  }

  function reopen(id: string) {
    return run("Opening comparison…", async () => {
      const saved = await api<Comparison>("comparisons/" + id);
      setSelection({ old: saved.old_id, next: saved.new_id });
      setQuestion(saved.question);
      setMode(saved.mode === "openrouter" && workspace?.openRouter ? "openrouter" : "local");
      setComparison(saved);
      navigate("compare");
    });
  }

  return <div className="workspace">
    <a className="skip-link" href="#workspace-content">{t("Skip to workspace")}</a>
    <aside className="sidebar" aria-label={t("Workspace sidebar")}>
      <button className="brand" type="button" onClick={() => navigate("compare")} aria-label={t("PolicyDiff AI home")}><BrandMark /><span dir="ltr">{t("PolicyDiff")}{" "}<b>{t("AI")}</b></span></button>
      <nav className="workspace-nav" aria-label={t("Workspace")}>
        {views.map(({ id, label }) => <button key={id} type="button" aria-current={view === id ? "page" : undefined} onClick={() => navigate(id)}>
          <Icon name={id === "help" ? "info" : id} />{t(label)}
        </button>)}
      </nav>
      <div className="sidebar-footer"><Icon name="lock" /><div><strong>{t(workspace?.demoOnly ? "Demo workspace" : "Policy workspace")}</strong>
        <p>{t(workspace?.openRouter ? "AI explanations available" : "Local comparison available")}</p></div></div>
    </aside>

    <main id="workspace-content" tabIndex={-1} className="canvas">
      <div className="canvas-inner">
        <div className="workspace-topbar"><div className="breadcrumb"><span>{t("Workspace")}</span><Icon name="chevron" /><strong>{t(views.find(({ id }) => id === view)!.label)}</strong></div><LanguageSwitch /></div>
        <div className="heading">
          <div>
            <h1>{t(view === "compare" ? "Compare policy editions" : view === "document" ? "Document library" : view === "help" ? "How to use PolicyDiff" : "Comparison history")}</h1>
            <p>{t(view === "compare" ? "See what changed between editions and verify it in the original wording."
              : view === "document" ? "Manage policy editions and check which PDFs are ready to compare."
              : view === "help" ? "Upload two editions, ask a question and inspect the evidence."
              : "Return to saved comparisons and the source pages behind each finding.")}</p>
          </div>
          {view !== "history" && <button className="button secondary demo-button" type="button" onClick={useDemo} disabled={!!busy || !workspace}>
            <Icon name="document" />{t(demo ? "Select demo editions" : "Load demo editions")}</button>}
        </div>

        <div className="feedback" aria-live="polite">
          {busy && <p className="message"><span className="activity-dot" />{t(busy)}
            {(busy.includes("demo") || busy.includes("PDF")) && " " + t("The first run may take a minute.")}</p>}
          {notice && <p className="message"><Icon name="check" />{t(notice)}</p>}
        </div>
        {syncWarning && <div className="message sync-warning" role="status"><Icon name="info" /><span>{t(syncWarning)}</span>
          <button className="button secondary" type="button" disabled={!!busy} onClick={() => run("Refreshing workspace…", async () => { await syncWorkspace(); })}>{t("Refresh workspace")}</button></div>}
        {error && <div className="message error" role="alert"><Icon name="info" /><span>{t(error)}</span>
          {!workspace && <button className="button secondary" onClick={() => run("Reloading…", async () => { await refresh(); })}>{t("Retry")}</button>}</div>}
        {!workspace && !error && <div className="panel result-state" role="status"><div className="skeleton"><span /><span /><span /></div><p>{t("Opening workspace…")}</p></div>}

        {workspace && <>
          {workspace.staticDemo && <div className="message preview-notice"><Icon name="info" /><p><strong>{t("Prepared public preview.")}</strong>{" "}{t("Try Local or ClauseLens on the example question below. These results are prepared examples. Personal uploads and custom questions are awaiting the database connection.")}</p></div>}
          {workspace.requiresAccessCode && <form className="panel access-form" onSubmit={unlock}>
            <div><h2>{t("Use your own documents")}</h2><p className="muted">{t("Enter the access code from the site owner to open a private, temporary workspace.")}</p></div>
            <label><span>{t("Workspace access code")}</span><input name="code" type="password" autoComplete="off" required maxLength={128} disabled={!!busy} /></label>
            <button className="button primary" disabled={!!busy}>{t("Unlock uploads")}</button>
          </form>}
          {workspace.temporary && !workspace.requiresAccessCode && <div className="message temporary-notice">
            <p>{t("This workspace is temporary and expires after one hour of inactivity. Keep your original PDFs.")}</p>
            <button className="button secondary" type="button" disabled={!!busy} onClick={() => setConfirmClear(!confirmClear)}>{t("Clear my workspace")}</button>
            {confirmClear && <div><p>{t("Delete all PDFs and comparisons in this temporary workspace?")}</p>
              <button className="button secondary" type="button" disabled={!!busy} onClick={() => run("Clearing workspace…", async () => {
                await api("clear", post); clearComparison(); setSelection({ old: "", next: "" }); setUploadTo(""); setUploadOpen(false); setConfirmClear(false); await syncWorkspace();
                setNotice("Your temporary documents and comparisons have been deleted.");
              })}>{t("Delete my temporary data")}</button></div>}
          </div>}
          {view === "help" && <UserGuide busy={!!busy} demoOnly={workspace.demoOnly}
            temporary={workspace.temporary} readOnlyDemo={workspace.staticDemo} maxPdfMb={workspace.maxPdfMb}
            onDocuments={() => { navigate("document"); setUploadOpen(true); }} onDemo={useDemo}
            onQuestion={(value) => { clearComparison(); setQuestion(value); navigate("compare"); }} />}
          <div hidden={view !== "compare"}>
            <div className="getting-started">
              <div><Icon name="info" /><p><strong>{t("Comparing your own PDFs?")}</strong>{" "}{t("Upload two editions here, or choose existing documents below.")}</p></div>
              <button className="button secondary" type="button" onClick={() => navigate("help")}>{t("Read the guide")}<Icon name="arrow" /></button>
            </div>
            {view === "compare" && !workspace.demoOnly && <div className="compare-upload"><UploadPanel policies={workspace.policies} busy={!!busy} open={uploadOpen} onOpen={setUploadOpen}
              policyId={uploadPolicy} onPolicy={setUploadTo} onSubmit={upload} onRetry={id => run("Ingesting PDF…", async () => { await process(id); })}
              maxPdfMb={workspace.maxPdfMb ?? 12} temporary={workspace.temporary} showStatus /></div>}
            <div className="setup-grid">
              <form className="panel compare-form" onSubmit={submit}>
                <fieldset className="form-fields" disabled={!!busy}>
                <div className="form-heading"><Icon name="compare" /><h2>{t("Comparison setup")}</h2></div>
                <div className="fields editions">
                  <label><span>{t("Older edition")}</span><select required value={selection.old} onChange={(event) => { clearComparison(); setSelection({ old: event.target.value, next: "" }); }}>
                    <option value="">{t("Select an edition")}</option>{editions.map((edition) => <option key={edition.id} value={edition.id}>{edition.policy} · {edition.label}</option>)}
                  </select></label>
                  <label><span>{t("Newer edition")}</span><select required value={selection.next} disabled={!selectedOld} onChange={(event) => { clearComparison(); setSelection({ ...selection, next: event.target.value }); }}>
                    <option value="">{t(selectedOld ? "Select a newer edition" : "Choose the older edition first")}</option>
                    {matching.map((edition) => <option key={edition.id} value={edition.id}>{edition.label}</option>)}
                  </select></label>
                </div>
                <label><span>{t("Comparison question")}</span><input required dir="auto" disabled={workspace.staticDemo} maxLength={400} value={question} onChange={(event) => { clearComparison(); setQuestion(event.target.value); }}
                  placeholder={t("Ask about a section, coverage or exclusion")} /></label>
                <fieldset className="modes">
                  <legend>{t("Analysis mode")}</legend>
                  <div className="fields">
                    <label className="mode">
                      <input type="radio" name="analysis-mode" checked={mode === "local"} onChange={() => { clearComparison(); setMode("local"); }} />
                      <span><strong>{t("Local wording comparison")}</strong><small>{t("Find and show wording changes")}</small></span>
                    </label>
                    <label className="mode lens-frame">
                      <input type="radio" name="analysis-mode" checked={mode === "openrouter"} onChange={() => { clearComparison(); setMode("openrouter"); }} disabled={!workspace.openRouter} />
                      <span><strong className="lens-title"><Icon name="spark" />{analysisModeLabels.openrouter}</strong>
                        <small>{t(workspace.staticDemo ? "Prepared AI explanation" : workspace.openRouter ? "AI explanation plus source comparison" : workspace.demoOnly ? "Unavailable in public demo" : "AI explanations unavailable")}</small></span>
                    </label>
                  </div>
                </fieldset>
                {mode === "openrouter" && <p className="muted mode-note">{t(workspace.staticDemo ? "This preview shows a previously generated explanation. It does not make a live model request." : "Your question and retrieved excerpts are sent to OpenRouter and its model provider.")}</p>}
                <div className="form-footer">
                  <span className="muted">{t(ready ? "Ready to compare" : "Select two editions of the same policy")}</span>
                  <button className="button primary" disabled={!!busy || !ready}>{t("Compare editions")}<Icon name="arrow" /></button>
                </div>
                </fieldset>
              </form>

              <aside className="pair-panel" aria-labelledby="pair-title">
                <h2 id="pair-title">{t("Document pair")}</h2>
                <p className="pair-caption">{selectedOld?.policy || t(demo ? "Available demo · Ontario OAP 1" : "Choose a policy to begin")}</p>
                {[{ label: "Older edition", edition: selectedOld, demoLabel: demo?.versions[0]?.label },
                  { label: "Newer edition", edition: selectedNew, demoLabel: demo?.versions[1]?.label }].map(({ label, edition, demoLabel }) =>
                  <div className="pair-edition" key={label}>
                    <Icon name="document" /><div><span>{t(label)}</span>
                      <strong>{edition?.label || (!selectedOld && demoLabel ? demoLabel : t("Awaiting selection"))}</strong>
                      {edition && <small>{dateFormat.format(new Date(edition.effective_on))} · {t("{count} pages", { count: edition.page_count ?? "—" })}</small>}
                    </div>
                  </div>)}
                <p className="pair-note"><Icon name="info" />{t("Every finding includes available excerpts and links to their PDF pages.")}</p>
              </aside>
            </div>
            <Findings key={comparison?.id || "uncompared"} comparison={comparison} pending={busy === "Comparing editions…"} canCompare={ready} onSource={setSource} />
          </div>

          <div className="library-grid" hidden={view !== "document"}>
            <section className="panel document-list" aria-labelledby="library-heading">
              <div className="section-head"><h2 id="library-heading">{t("Policy editions")}</h2><span className="result-count">{t("{count} indexed", { count: editions.length })}</span></div>
              {!workspace.policies.length && <p className="muted panel-empty">{t("Load the demo or add your first PDF edition.")}</p>}
              {workspace.policies.map((policy) => <div className="policy" key={policy.id}>
                <div className="policy-heading"><Icon name="document" /><h3>{policy.name}</h3>{policy.demo && <span>{t("Demo")}</span>}</div>
                <ul>{policy.versions.map((version) => <li className="edition" key={version.id}>
                  <div className="edition-title"><strong>{version.label}</strong>
                    <small>{dateFormat.format(new Date(version.effective_on))}{version.page_count ? " · " + t("{count} pages", { count: version.page_count }) : ""}</small>
                    {version.error && <p className="edition-error">{t(version.error)}</p>}</div>
                  <div className="edition-actions"><span className={"edition-status " + version.status}>{t(version.status)}</span>
                    {version.can_resume && <button className="button secondary" disabled={!!busy} onClick={() => run("Ingesting PDF…", async () => { await process(version.id); })}>
                      {t(version.attempts ? "Retry ingestion" : "Start ingestion")}</button>}
                  </div>
                </li>)}</ul>
              </div>)}
            </section>
            {view === "document" && !workspace.demoOnly && <UploadPanel policies={workspace.policies} busy={!!busy} open={uploadOpen} onOpen={setUploadOpen}
              policyId={uploadPolicy} onPolicy={setUploadTo} onSubmit={upload} onRetry={id => run("Ingesting PDF…", async () => { await process(id); })}
              maxPdfMb={workspace.maxPdfMb ?? 12} temporary={workspace.temporary} />}
          </div>

          <section className="panel history-panel" hidden={view !== "history"} aria-labelledby="history-heading">
            <div className="section-head"><h2 id="history-heading">{t("Saved comparisons")}</h2><span className="result-count">{t("{count} saved", { count: workspace.comparisons.length })}</span></div>
            {!workspace.comparisons.length && <p className="muted panel-empty">{t("Run a comparison to start your history.")}</p>}
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
    {source && <SourceViewer key={source.version_id + ":" + source.page + ":" + source.id} source={source} onClose={() => setSource(undefined)} />}
  </div>;
}
