import Image from "next/image";
import { diffWordsWithSpace } from "diff";
import { useEffect, useRef, useState } from "react";
import type { Comparison, Finding, Kind, Source } from "@/lib/contracts";
import { ComparisonDiagram, Icon } from "./icons";

const statusText: Record<Kind, string> = { added: "Added", removed: "Removed", changed: "Changed", review: "Needs review" };

export function pdfUrl(source: Source) {
  return "/api/pdf/" + source.version_id + "#page=" + source.page;
}

function excerptDiff(older: string, newer: string) {
  const parts = diffWordsWithSpace(older, newer);
  const boundedEdits = new Set<number>();
  const hasContext = (part: (typeof parts)[number] | undefined) =>
    part && !part.added && !part.removed && part.value.trim().split(/\s+/).length >= 3;

  for (let index = 1; index < parts.length - 2; index++) {
    // Excerpts can end at different points. Only mark paired edits with shared wording on both sides.
    if (parts[index].removed && parts[index + 1].added &&
        parts[index].value.trim() && parts[index + 1].value.trim() &&
        hasContext(parts[index - 1]) && hasContext(parts[index + 2])) {
      boundedEdits.add(index);
      boundedEdits.add(index + 1);
    }
  }
  return boundedEdits.size ? { parts, boundedEdits } : undefined;
}

function FindingRow({ finding, local, onSource }: { finding: Finding; local: boolean; onSource: (source: Source) => void }) {
  const older = finding.sources.filter((source) => source.side === "old");
  const newer = finding.sources.filter((source) => source.side === "new");
  const passages = [{ label: "Older wording", sources: older }, { label: "Newer wording", sources: newer }];
  const diff = finding.kind === "changed" && older[0] && newer[0] ? excerptDiff(older[0].body, newer[0].body) : undefined;

  return <article className="finding" aria-label={finding.section + " " + statusText[finding.kind]}>
    <div className="finding-heading">
      <h3>{finding.section}</h3><span className={"finding-kind " + finding.kind}>{statusText[finding.kind]}</span>
    </div>
    <p className="finding-description">{local && finding.kind === "changed"
      ? finding.description.replace(/Edited passage: .*/s, "Compare the matched excerpts and verify the wording in both PDFs.")
      : finding.description}</p>
    <div className="passages">{passages.map(({ label, sources }, side) => <section className="passage" key={label} aria-label={label}>
      <h4>{label}</h4>
      {!sources.length && <p className="muted">No supporting excerpt found.</p>}
      {sources.map((source, index) => {
        const marked = index === 0 ? diff : undefined;
        const excerpt = <><p className="quoted-text">{marked ? marked.parts.map((part, key) => {
          if (side === 0 ? part.added : part.removed) return null;
          if (!marked.boundedEdits.has(key)) return part.value;
          return <mark key={key} className={side === 0 ? "before" : "after"}>{part.value}</mark>;
        }) : source.body}</p>
          <a className="source-link" href={pdfUrl(source)} onClick={(event) => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onSource(source);
          }}><Icon name="document" />Preview {source.side === "old" ? "older" : "newer"} PDF · page {source.page}</a></>;
        return index === 0 ? <div className="excerpt" key={source.id}>{excerpt}</div> :
          <details className="extra-excerpt" key={source.id}><summary>More wording · page {source.page}</summary>{excerpt}</details>;
      })}
    </section>)}</div>
  </article>;
}

export function Findings({ comparison, pending, canCompare, onSource }: {
  comparison?: Comparison; pending: boolean; canCompare: boolean; onSource: (source: Source) => void;
}) {
  const [reviewOnly, setReviewOnly] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const comparisonId = comparison?.id;
  useEffect(() => {
    if (!comparisonId || pending) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start" });
  }, [comparisonId, pending]);
  const findings = comparison?.findings ?? [];
  const reviewCount = findings.filter((finding) => finding.kind === "review").length;
  const visible = reviewOnly ? findings.filter((finding) => finding.kind === "review") : findings;
  return <section className="results" aria-labelledby="findings" aria-busy={pending}>
    <div className="results-header">
      <div><h2 id="findings" ref={heading} tabIndex={-1}>Findings</h2>
        <p>{comparison ? comparison.old_label + " → " + comparison.new_label : "Side-by-side wording and source evidence."}</p>
      </div>
      {comparison && <span className="result-count">{findings.length} {findings.length === 1 ? "finding" : "findings"}</span>}
    </div>
    {pending && <div className="result-state" role="status">
      <div className="skeleton"><span /><span /><span /></div>
      <p>Matching clauses and checking wording…</p>
    </div>}
    {!pending && !comparison && <div className="result-state">
      <ComparisonDiagram />
      <h3>{canCompare ? "Ready to compare" : "Start with two editions"}</h3>
      <p>{canCompare ? "Run the comparison to see wording changes and their PDF sources." :
        "Select an older and a newer edition, or use the bundled OAP 1 example."}</p>
    </div>}
    {!pending && comparison && <>
      <div className="result-context">
        <p><strong>{comparison.question}</strong><span>{comparison.mode === "openai" ? "OpenAI explanation" : "Local comparison"}</span></p>
        {reviewCount > 0 && <div className="filters" aria-label="Filter findings">
          <button type="button" aria-pressed={!reviewOnly} onClick={() => setReviewOnly(false)}>All {findings.length}</button>
          <button type="button" aria-pressed={reviewOnly} onClick={() => setReviewOnly(true)}>Needs review {reviewCount}</button>
        </div>}
      </div>
      {findings.length ? visible.map((finding) => <FindingRow key={finding.id} finding={finding} local={comparison.mode === "local"} onSource={onSource} />) :
        <div className="result-state"><Icon name="check" width={26} height={26} />
          <h3>No wording changes found</h3><p>The matched sections had the same wording.</p></div>}
    </>}
  </section>;
}

export function SourceViewer({ source, onClose }: { source: Source; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return <dialog ref={dialog} className="viewer" aria-labelledby="pdf-heading" onClose={onClose}
    onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    <div className="viewer-inner">
      <header className="viewer-head">
        <div><span>PDF source</span><h2 id="pdf-heading">{source.side === "old" ? "Older" : "Newer"} edition · page {source.page}</h2></div>
        <div className="viewer-actions"><a className="button secondary" href={pdfUrl(source)} target="_blank" rel="noreferrer">
          <Icon name="external" />Open in new tab</a>
          <button className="button icon-button" type="button" aria-label="Close PDF" onClick={() => dialog.current?.close()} autoFocus>
            <Icon name="close" /></button></div>
      </header>
      <div className="viewer-body">
        <div className="viewer-excerpt"><h3>Supporting excerpt</h3><p className="quoted-text">{source.body}</p></div>
        <div className="viewer-page" aria-busy={preview === "loading"}>
          {preview === "loading" && <p role="status">Loading PDF page…</p>}
          {preview === "failed" && <p role="alert">Preview unavailable. Open the original PDF in a new tab.</p>}
          <Image unoptimized loading="eager" width={1000} height={1294} alt={"PDF page " + source.page}
            src={"/api/pdf/" + source.version_id + "/" + source.page} hidden={preview !== "ready"}
            onLoad={() => setPreview("ready")} onError={() => setPreview("failed")} />
        </div>
      </div>
    </div>
  </dialog>;
}
