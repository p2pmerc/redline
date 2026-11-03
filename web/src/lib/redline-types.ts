/** Shared domain types for the Redline web app. */

export type Severity = "critical" | "high" | "medium" | "low";

/** Which side of a report the signed-in person is on. */
export type ReportRole = "researcher" | "team";

/** Every state a report can be in, in the order of the happy path. */
export type ReportStage =
  | "sealed"
  | "invited"
  | "negotiating"
  | "agreed"
  | "funded"
  | "fix_merged"
  | "paid"
  | "published"
  | "refunded";

export interface StageDefinition {
  id: ReportStage;
  label: string;
  /** One line shown under the stage in the stepper. */
  summary: string;
}

export interface TimelineEvent {
  id: string;
  at: string; // ISO timestamp
  kind:
    | "sealed"
    | "invite_sent"
    | "invite_redeemed"
    | "message"
    | "agreement_signed"
    | "escrow_funded"
    | "pr_linked"
    | "pr_merged"
    | "payout"
    | "refund"
    | "disclosure_notice"
    | "published";
  title: string;
  detail?: string;
  /** NEAR testnet transaction hash, when the event is on-chain. */
  txHash?: string;
}

export interface NegotiationMessage {
  id: string;
  from: "researcher" | "team";
  author: string;
  body: string;
  at: string;
  /** Hash that was logged on chain for this message. */
  hash: string;
}

export interface EscrowState {
  amountNear: number;
  funded: boolean;
  expiresAt: string;
  contractId: string;
  pullRequestUrl?: string;
  mergeCheck: "pending" | "not_merged" | "merged" | "unknown";
}

export interface InviteRecipient {
  id: string;
  channel: "email" | "x" | "telegram" | "github";
  handle: string;
  status: "pending" | "redeemed" | "expired";
}

export interface Report {
  id: string;
  title: string;
  target: string; // project or organisation name
  repo?: string; // owner/name on GitHub
  severity: Severity;
  stage: ReportStage;
  role: ReportRole;
  counterparty: string;
  createdAt: string;
  updatedAt: string;
  /** Date after which the researcher may publish without a reply. */
  disclosureDeadline: string;
  rewardNear?: number;
  summary: string;
  body: string; // markdown
  escrow?: EscrowState;
  invites: InviteRecipient[];
  messages: NegotiationMessage[];
  timeline: TimelineEvent[];
  contentHash: string;
}
