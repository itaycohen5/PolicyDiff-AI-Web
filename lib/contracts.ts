import { z } from "zod";

export const id = z.uuid();
export const comparisonInput = z.object({
  oldId: id,
  newId: id,
  question: z.string().trim().min(1).max(400),
  mode: z.enum(["local", "openrouter"]).default("local"),
  answerLanguage: z.enum(["en", "he"]).optional(),
});
export const uploadInput = z.object({
  policyId: id.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  label: z.string().trim().min(1).max(80),
  effectiveOn: z.iso.date().refine((value) => !value.startsWith("0000-"), "Choose a date in year 0001 or later."),
}).refine((value) => Boolean(value.policyId) !== Boolean(value.name), "Choose an existing policy or enter a new name.");

export type ComparisonInput = z.infer<typeof comparisonInput>;
type SavedAnalysisMode = ComparisonInput["mode"] | "openai";
export const analysisModeLabels: Record<SavedAnalysisMode, string> = {
  local: "Local comparison",
  openai: "Archived AI comparison",
  openrouter: "ClauseLens",
};
export type UploadInput = z.infer<typeof uploadInput>;
export type Status = "queued" | "processing" | "ready" | "failed";
export type Kind = "added" | "removed" | "changed" | "review";
export type Version = {
  id: string;
  label: string;
  effective_on: string;
  page_count: number | null;
  status: Status;
  error: string | null;
  attempts: number;
  source_url: string | null;
  can_resume: boolean;
};
export type Policy = { id: string; name: string; demo: boolean; versions: Version[] };
export type Source = { id: string; page: number; body: string; version_id: string; side: "old" | "new"; ordinal?: number };
export type Finding = { id: string; section: string; kind: Kind; description: string; ai_explanation: string | null; ai_context_complete: boolean; sources: Source[] };
export type ComparisonSummary = {
  id: string;
  question: string;
  mode: SavedAnalysisMode;
  unchanged_sections: string[];
  old_id: string;
  new_id: string;
  old_label: string;
  new_label: string;
  policy_name: string;
  created_at: string;
};
export type Comparison = ComparisonSummary & { findings: Finding[] };
