"use client";
import { useLanguage } from "./language";

export default function WorkspaceError({ retry }: { error: unknown; retry: () => void }) {
  const { t } = useLanguage();
  return <main className="panel error-boundary" role="alert">
    <h1>{t("The workspace could not be displayed")}</h1>
    <p>{t("Your documents and saved comparisons are still stored. Try opening the workspace again.")}</p>
    <button className="button primary" type="button" onClick={retry}>{t("Try again")}</button>
  </main>;
}
