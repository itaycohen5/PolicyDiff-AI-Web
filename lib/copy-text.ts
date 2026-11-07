import { analysisModeLabels, type Comparison, type Finding, type Kind } from "./contracts";

export const findingStatusText: Record<Kind, string> = { added: "Added", removed: "Removed", changed: "Changed", review: "Needs review" };

export function findingDescription(finding: Finding) {
  return finding.kind === "changed"
    ? finding.description.replace(/Edited passage: .*/s, "Compare the matched excerpts and verify the wording in both PDFs.")
    : finding.description;
}

export function findingText(finding: Finding, origin: string, aiRequested: boolean) {
  const lines = [finding.section + " — " + findingStatusText[finding.kind]];
  if (finding.ai_explanation && finding.ai_context_complete) {
    lines.push("ClauseLens AI explanation · Review against sources", finding.ai_explanation);
  } else if (finding.ai_explanation) {
    lines.push("This saved AI explanation used partial excerpts. Run the comparison again to review the full section.");
  } else if (aiRequested) {
    lines.push("No AI explanation was accepted for this finding. Review the source wording below.");
  }
  lines.push(findingDescription(finding));
  for (const side of ["old", "new"] as const) {
    lines.push("", side === "old" ? "Older wording" : "Newer wording");
    const sources = finding.sources.filter((source) => source.side === side);
    if (!sources.length) lines.push("No supporting excerpt found.");
    for (const source of sources) {
      lines.push(source.body, "Source · page " + source.page + ": " + origin + "/api/pdf/" + source.version_id + "#page=" + source.page);
    }
  }
  return lines.join("\n");
}

export function comparisonText(comparison: Comparison, origin: string) {
  const lines = ["PolicyDiff AI — " + comparison.policy_name,
    comparison.old_label + " → " + comparison.new_label,
    "Question: " + comparison.question, "Analysis: " + analysisModeLabels[comparison.mode],
    "Results cover up to 10 matched sections for this question."];
  if (comparison.unchanged_sections?.length) {
    lines.push("", "Compared without wording changes: " + comparison.unchanged_sections.join(", "));
  }
  if (!comparison.findings.length) lines.push("", comparison.unchanged_sections?.length
    ? "No wording differences in matched sections."
    : "No recorded findings. Run the comparison again to check the evidence.");
  for (const finding of comparison.findings) lines.push("", findingText(finding, origin, comparison.mode === "openrouter"));
  return lines.join("\n");
}
