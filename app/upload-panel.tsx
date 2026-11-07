import { useId, type FormEvent } from "react";
import type { Policy } from "@/lib/contracts";
import { Icon } from "./icons";
import { useLanguage } from "./language";

export function UploadPanel({ policies, busy, open, onOpen, policyId, onPolicy, onSubmit, onRetry, maxPdfMb, temporary, showStatus = false }: {
  policies: Policy[]; busy: boolean; open: boolean; onOpen: (value: boolean) => void;
  policyId: string; onPolicy: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRetry: (id: string) => void; maxPdfMb: number; temporary?: boolean; showStatus?: boolean;
}) {
  const { t } = useLanguage();
  const policyLabel = useId();
  const own = policies.filter(policy => !policy.demo);
  const count = own.reduce((sum, policy) => sum + policy.versions.length, 0);
  const full = temporary && count >= 2;
  return <details className="panel upload" open={open} onToggle={event => onOpen(event.currentTarget.open)}>
    <summary><Icon name="plus" />{t("Add a PDF edition")}</summary>
    <p className="muted">{t("Choose a PDF with selectable text. Up to {max} MB and 160 pages.", { max: maxPdfMb })}</p>
    <p className="upload-instructions">{t("For your first PDF, create a new policy. For the second PDF, select that same policy and use a different edition name. Both editions must finish indexing before you compare.")}</p>
    {showStatus && count > 0 && <ul className="upload-status" aria-label={t("Uploaded editions")}>
      {own.flatMap(policy => policy.versions.map(version => <li key={version.id}>
        <div><strong dir="auto">{version.label}</strong><span className={"edition-status " + version.status}>{t(version.status)}</span>
          {version.error && <p className="edition-error">{t(version.error)}</p>}</div>
        {version.can_resume && <button type="button" className="button secondary" disabled={busy} onClick={() => onRetry(version.id)}>{t(version.attempts ? "Retry ingestion" : "Start ingestion")}</button>}
      </li>))}
    </ul>}
    {full && <p className="upload-limit" role="status">{t("Your two PDFs are uploaded. Clear your temporary workspace to compare a different pair.")}</p>}
    <form onSubmit={onSubmit}>
      <fieldset className="form-fields" disabled={busy || full}>
        <label><span id={policyLabel}>{t("Policy")}</span><select aria-labelledby={policyLabel} name="policyId" value={policyId} onChange={event => onPolicy(event.target.value)}>
          <option value="">{t("Create a new policy")}</option>{own.map(policy => <option value={policy.id} key={policy.id}>{policy.name}</option>)}
        </select></label>
        {!policyId && <label><span>{t("Policy name")}</span><input name="name" required maxLength={120} dir="auto" /></label>}
        <div className="fields"><label><span>{t("Edition name")}</span><input name="label" required maxLength={80} dir="auto" /></label>
          <label><span>{t("Effective date")}</span><input name="effectiveOn" type="date" required /></label></div>
        <label><span>{t("Text PDF")}</span><input name="file" type="file" accept=".pdf,application/pdf" required /></label>
        <button className="button primary" disabled={busy || full}><Icon name="upload" />{t("Upload and index")}</button>
      </fieldset>
    </form>
  </details>;
}
