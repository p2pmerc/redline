/** Records the server keeps. Report bodies and chat messages are ciphertext only. */

export type Role = "researcher" | "team";
export type Severity = "critical" | "high" | "medium" | "low";
export type LedgerStatus = "registered" | "terms_proposed" | "terms_accepted" | "funded" | "merge_confirmed" | "paid" | "refunded";
export type MergeCheck = "pending" | "not_merged" | "merged" | "unknown";
export type InviteChannel = "email" | "x" | "telegram" | "github";

export interface TimelineEntry {
  id: string;
  at: string;
  kind:
    | "sealed" | "invite_sent" | "invite_redeemed" | "invite_revoked" | "message" | "agreement_signed" | "escrow_funded"
    | "pr_linked" | "pr_merged" | "payout" | "refund" | "disclosure_notice" | "published" | "terms_proposed" | "payout_account";
  title: string;
  detail?: string;
  txHash?: string;
}

export interface InviteRecord {
  id: string;
  token: string;
  channel: InviteChannel;
  handle: string;
  status: "pending" | "redeemed" | "expired" | "revoked";
  createdAt: string;
  /** Outbound delivery for email/X/Telegram. Never log the #key fragment. */
  delivery?: {
    state: "idle" | "sending" | "sent" | "failed" | "ready";
    at?: string;
    error?: string;
    /** Message id from AgentMail when email was sent. */
    messageId?: string;
  };
}

export interface MessageRecord {
  id: string;
  role: Role;
  authorName: string;
  /** AES-GCM ciphertext (iv + data) under the report key, hex. */
  ciphertextHex: string;
  /** SHA-256 of the ciphertext. */
  hash: string;
  at: string;
}

export interface TermsRecord {
  amountNear: number;
  repo: string;
  proposedAt: string;
  accepted: boolean;
}

export interface EscrowRecord {
  amountNear: number;
  fundedAt: string;
  expiresAt: string;
  pullRequestUrl?: string;
  repo?: string;
  pullRequest?: number;
  mergeCheck: MergeCheck;
  mergeCommit?: string;
}

export interface PublishedRecord {
  at: string;
  body: string;
  evidenceHash: string;
}

/** Ciphertext-only: report key sealed to a browser device public key. Server cannot open these. */
export interface KeyWrapRecord {
  userId: string;
  devicePubHex: string;
  wrapHex: string;
  at: string;
}

export interface DeviceKeyRecord {
  userId: string;
  devicePubHex: string;
  at: string;
}

export interface StoredReport {
  id: string;
  researcherId: string;
  researcherName: string;
  teamId?: string;
  teamName?: string;
  title: string;
  target: string;
  repo?: string;
  severity: Severity;
  summary: string;
  createdAt: string;
  updatedAt: string;
  disclosureDeadline: string;
  contentHash: string;
  ciphertextHex: string;
  /** Report key sealed to the enclave public key. Opaque to the server. */
  sealedKeyHex?: string;
  /** Report key wrapped under the service key vault (see key-escrow.ts). Released only to parties. */
  escrowedKeyHex?: string;
  status: LedgerStatus;
  /** NEAR account bound on chain to receive the reward. Required before the team can fund. */
  payoutAccount?: string;
  terms?: TermsRecord;
  escrow?: EscrowRecord;
  invites: InviteRecord[];
  messages: MessageRecord[];
  timeline: TimelineEntry[];
  published?: PublishedRecord;
  /** Registered device public keys (P-256 raw hex) for parties, so a browser that holds the report key can escrow wraps. */
  deviceKeys?: DeviceKeyRecord[];
  /** Report-key wraps. Ciphertext only. */
  keyWraps?: KeyWrapRecord[];
}
