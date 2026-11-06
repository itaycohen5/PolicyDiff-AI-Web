import { z } from "zod";

export const id = z.uuid();
export const comparisonInput = z.object({
  oldId: id,
  newId: id,
  question: z.string().trim().min(1).max(400),
  mode: z.enum(["local", "openai"]).default("local"),
});
export const uploadInput = z.object({
  policyId: id.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  label: z.string().trim().min(1).max(80),
  effectiveOn: z.iso.date(),
}).refine((value) => Boolean(value.policyId) !== Boolean(value.name), "Choose an existing policy or enter a new name.");

export type ComparisonInput = z.infer<typeof comparisonInput>;
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
export type Source = { id: string; page: number; body: string; version_id: string; side: "old" | "new" };
export type Finding = { id: string; section: string; kind: Kind; description: string; sources: Source[] };
export type ComparisonSummary = {
  id: string;
  question: string;
  mode: "local" | "openai";
  old_id: string;
  new_id: string;
  old_label: string;
  new_label: string;
  policy_name: string;
  created_at: string;
};
export type Comparison = ComparisonSummary & { findings: Finding[] };
