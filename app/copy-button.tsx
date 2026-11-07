"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { useLanguage } from "./language";

export function CopyButton({ getText, label }: { getText: () => string; label: string }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  async function copy() {
    setStatus("copying");
    try {
      await navigator.clipboard.writeText(getText());
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return <div className="copy-control">
    <button className="button secondary copy-button" type="button" title={label} aria-label={label}
      disabled={status === "copying"} onClick={copy}>
      <Icon name={status === "copied" ? "check" : "copy"} />
      <span aria-live="polite">{t(status === "copied" ? "Copied!" : status === "copying" ? "Copying…" : "Copy")}</span>
    </button>
    {status === "failed" && <p className="copy-error" role="alert">{t("Copy was blocked by your browser. Select the answer text and copy it manually, or allow clipboard access and try again.")}</p>}
  </div>;
}
