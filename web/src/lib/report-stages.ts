import type { ReportStage, Severity, StageDefinition } from "./redline-types";

/** The happy path, in order. `published` and `refunded` are exits. */
export const stagePipeline: StageDefinition[] = [
  { id: "sealed", label: "Sealed", summary: "Encrypted in your browser, hash on chain" },
  { id: "invited", label: "Invited", summary: "Team verified by the enclave" },
  { id: "negotiating", label: "Negotiating", summary: "Private, hash-logged chat" },
  { id: "agreed", label: "Agreed", summary: "Reward signed by both sides" },
  { id: "funded", label: "Funded", summary: "NEAR locked in escrow" },
  { id: "fix_merged", label: "Fix merged", summary: "Enclave confirmed the pull request" },
  { id: "paid", label: "Paid", summary: "Escrow released to the researcher" },
];

export const stageLabels: Record<ReportStage, string> = {
  sealed: "Sealed",
  invited: "Invited",
  negotiating: "Negotiating",
  agreed: "Agreed",
  funded: "Funded",
  fix_merged: "Fix merged",
  paid: "Paid",
  published: "Published",
  refunded: "Refunded",
};

export type StageTone = "gray" | "accent" | "amber" | "green" | "rose" | "violet";

export const stageTone: Record<ReportStage, StageTone> = {
  sealed: "gray",
  invited: "accent",
  negotiating: "amber",
  agreed: "violet",
  funded: "accent",
  fix_merged: "green",
  paid: "green",
  published: "rose",
  refunded: "gray",
};

export const severityTone: Record<Severity, "red" | "orange" | "amber" | "gray"> = {
  critical: "red",
  high: "orange",
  medium: "amber",
  low: "gray",
};

/** Index of a stage on the happy path, or -1 for exits. */
export function pipelineIndex(stage: ReportStage): number {
  return stagePipeline.findIndex((s) => s.id === stage);
}
