import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { analysisModeLabels, type Comparison, type Finding, type Source } from "@/lib/contracts";
import { comparisonText, findingDescription, findingStatusText as statusText, findingText } from "@/lib/copy-text";
import { ComparisonDiagram, Icon } from "./icons";
import { CopyButton } from "./copy-button";
import { useLanguage } from "./language";
import { sectionHighlights, type HighlightRange } from "@/lib/highlighting";

export function pdfUrl(source: Source) {
  return "/api/pdf/" + source.version_id + "#page=" + source.page;
}

function HighlightedText({ text, ranges = [] }: { text: string; ranges?: HighlightRange[] }) {
  const { t } = useLanguage();
  const pieces = ranges.flatMap((range, index) => {
    const before = text.slice(ranges[index - 1]?.end ?? 0, range.start);
    return [before, <mark key={index} title={t("Changed wording")}>{text.slice(range.start, range.end)}</mark>];
  });
  return <>{pieces}{text.slice(ranges.at(-1)?.end ?? 0)}</>;
}

function FindingRow({ finding, aiRequested, onSource }: { finding: Finding; aiRequested: boolean; onSource: (source: Source) => void }) {
  const { locale, t } = useLanguage();
  const older = finding.sources.filter((source) => source.side === "old");
  const newer = finding.sources.filter((source) => source.side === "new");
  const passages = [{ label: "Older wording", sources: older }, { label: "Newer wording", sources: newer }];
  const marks = useMemo(() => finding.kind === "review" ? new Map<string, HighlightRange[]>() : sectionHighlights(
    finding.sources.filter(source => source.side === "old"), finding.sources.filter(source => source.side === "new")), [finding.kind, finding.sources]);

  return <article className="finding" aria-label={finding.section + " " + t(statusText[finding.kind])}>
    <div className="finding-heading">
      <h3><bdi>{t(finding.section)}</bdi></h3><span className={"finding-kind " + finding.kind}>{t(statusText[finding.kind])}</span>
      <CopyButton label={t("Copy finding {section}", { section: finding.section })} getText={() => findingText(finding, window.location.origin, aiRequested, locale)} />
    </div>
    {finding.ai_explanation && finding.ai_context_complete && <div className="lens-frame lens-explanation">
      <div className="lens-explanation-heading"><h4 className="lens-title"><Icon name="spark" />{analysisModeLabels.openrouter} <span>{t("AI explanation · Review against sources")}</span></h4>
        <CopyButton label={t("Copy AI explanation for {section}", { section: finding.section })} getText={() => finding.ai_explanation!} /></div>
      <p dir="auto">{finding.ai_explanation}</p>
    </div>}
    {finding.ai_explanation && !finding.ai_context_complete && <p className="ai-unavailable"><Icon name="info" />
      {t("This saved AI explanation used partial excerpts. Run the comparison again to review the full section.")}</p>}
    {aiRequested && !finding.ai_explanation && <p className="ai-unavailable"><Icon name="info" />
      {t("No AI explanation was accepted for this finding. Review the source wording below.")}</p>}
    <p className="finding-description">{t(findingDescription(finding))}</p>
    <div className="passages">{passages.map(({ label, sources }) => <section className="passage" key={label} aria-label={t(label)}>
      <h4>{t(label)}</h4>
      {!sources.length && <p className="muted">{t("No supporting excerpt found.")}</p>}
      {sources.map((source, index) => {
        const excerpt = <><p className="quoted-text" dir="auto"><HighlightedText text={source.body} ranges={marks.get(source.id)} /></p>
          <a className="source-link" href={pdfUrl(source)} onClick={(event) => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onSource(source);
          }}><Icon name="document" />{t(source.side === "old" ? "Preview older PDF · page {page}" : "Preview newer PDF · page {page}", { page: source.page })}</a></>;
        return index === 0 ? <div className="excerpt" key={source.id}>{excerpt}</div> :
          <details className="extra-excerpt" key={source.id}><summary>{t("More wording · page {page}", { page: source.page })}</summary>{excerpt}</details>;
      })}
    </section>)}</div>
  </article>;
}

export function Findings({ comparison, pending, canCompare, onSource }: {
  comparison?: Comparison; pending: boolean; canCompare: boolean; onSource: (source: Source) => void;
}) {
  const { locale, t } = useLanguage();
  const [filter, setFilter] = useState({ comparisonId: comparison?.id, reviewOnly: false });
  const reviewOnly = filter.comparisonId === comparison?.id && filter.reviewOnly;
  const setReviewOnly = (value: boolean) => setFilter({ comparisonId: comparison?.id, reviewOnly: value });
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
      <div><h2 id="findings" ref={heading} tabIndex={-1}>{t("Findings")}</h2>
        <p>{comparison ? comparison.old_label + " → " + comparison.new_label : t("Side-by-side wording and source evidence.")}</p>
        {comparison && <p className="scope-note">{t("Results cover up to 10 matched sections for this question.")}</p>}
      </div>
      {comparison && <div className="result-actions"><span className="result-count">{t(findings.length === 1 ? "{count} finding" : "{count} findings", { count: findings.length })}</span>
        {!pending && <CopyButton key={comparison.id} label={t("Copy complete comparison")} getText={() => comparisonText(comparison, window.location.origin, locale)} />}</div>}
    </div>
    {pending && <div className="result-state" role="status">
      <div className="skeleton"><span /><span /><span /></div>
      <p>{t("Matching clauses and checking wording…")}</p>
    </div>}
    {!pending && !comparison && <div className="result-state">
      <ComparisonDiagram />
      <h3>{t(canCompare ? "Ready to compare" : "Start with two editions")}</h3>
      <p>{t(canCompare ? "Run the comparison to see wording changes and their PDF sources." :
        "Select an older and a newer edition, or use the bundled OAP 1 example.")}</p>
    </div>}
    {!pending && comparison && <>
      <div className="result-context">
        <p><strong dir="auto">{comparison.question}</strong><span>{t(analysisModeLabels[comparison.mode])}</span></p>
        {reviewCount > 0 && <div className="filters" aria-label={t("Filter findings")}>
          <button type="button" aria-pressed={!reviewOnly} onClick={() => setReviewOnly(false)}>{t("All {count}", { count: findings.length })}</button>
          <button type="button" aria-pressed={reviewOnly} onClick={() => setReviewOnly(true)}>{t("Needs review {count}", { count: reviewCount })}</button>
        </div>}
      </div>
      {findings.some(finding => finding.kind !== "review" && finding.sources.some(source => source.side === "old") && finding.sources.some(source => source.side === "new")) &&
        <p className="highlight-legend"><span aria-hidden="true" />{t("Changed wording is highlighted in yellow.")}</p>}
      {(comparison.unchanged_sections ?? []).length > 0 && <div className="unchanged-sections">
        <h3>{t("Compared without wording changes")}</h3>
        <ul aria-label={t("Sections without wording changes")}>{comparison.unchanged_sections.map((section) => <li key={section}>{section}</li>)}</ul>
      </div>}
      {visible.length ? visible.map((finding) => <FindingRow key={finding.id} finding={finding} aiRequested={comparison.mode === "openrouter"} onSource={onSource} />) :
        reviewOnly ? <div className="result-state">
          <h3>{t("No findings need review")}</h3><p>{t("Show all findings to return to the comparison.")}</p>
          <button className="button secondary" type="button" onClick={() => setReviewOnly(false)}>{t("Show all findings")}</button>
        </div> : <div className="result-state"><Icon name="check" width={26} height={26} />
          <h3>{t(comparison.unchanged_sections?.length ? "No wording differences in matched sections" : "No recorded findings")}</h3>
          <p>{t(comparison.unchanged_sections?.length ? "The sections retrieved for this question had matching wording."
            : "This saved comparison has no section-level outcome record. Run it again to check the evidence.")}</p></div>}
    </>}
  </section>;
}

export function SourceViewer({ source, onClose }: { source: Source; onClose: () => void }) {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return <dialog ref={dialog} className="viewer" aria-labelledby="pdf-heading" onClose={onClose}
    onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    <div className="viewer-inner">
      <header className="viewer-head">
        <div><span>{t("PDF source")}</span><h2 id="pdf-heading">{t(source.side === "old" ? "Older edition · page {page}" : "Newer edition · page {page}", { page: source.page })}</h2></div>
        <div className="viewer-actions"><a className="button secondary" href={pdfUrl(source)} target="_blank" rel="noreferrer">
          <Icon name="external" />{t("Open in new tab")}</a>
          <button className="button icon-button" type="button" aria-label={t("Close PDF")} onClick={() => dialog.current?.close()} autoFocus>
            <Icon name="close" /></button></div>
      </header>
      <div className="viewer-body">
        <div className="viewer-excerpt"><h3>{t("Supporting excerpt")}</h3><p className="quoted-text" dir="auto">{source.body}</p></div>
        <div className="viewer-page" aria-busy={preview === "loading"}>
          {preview === "loading" && <p role="status">{t("Loading PDF page…")}</p>}
          {preview === "failed" && <p role="alert">{t("Preview unavailable. Open the original PDF in a new tab.")}</p>}
          <Image unoptimized loading="eager" width={1000} height={1294} alt={t("PDF page {page}", { page: source.page })}
            src={"/api/pdf/" + source.version_id + "/" + source.page} hidden={preview !== "ready"}
            onLoad={() => setPreview("ready")} onError={() => setPreview("failed")} />
        </div>
      </div>
    </div>
  </dialog>;
}
