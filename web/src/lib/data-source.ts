import { api, ApiError, isDemoSession } from "./api-client";
import type { EscrowState, InviteRecipient, NegotiationMessage, ProposedTerms, Report, ReportRole, ReportStage, Severity, TimelineEvent } from "./redline-types";
import { getReportKey, saveReportKey, takeInviteKey } from "./report-key-vault";
import { encryptWithKey, openReportBody, sealReportBody } from "./report-encryption";
import { findSampleReport, sampleReports } from "./sample-reports";

/** Shape the server sends for a report the caller is a party to. Bodies and messages are ciphertext. */
interface PartyView {
  id: string;
  title: string;
  target: string;
  repo?: string;
  severity: Severity;
  stage: ReportStage;
  role: ReportRole;
  counterparty: string;
  createdAt: string;
  updatedAt: string;
  disclosureDeadline: string;
  rewardNear?: number;
  summary: string;
  contentHash: string;
  ciphertextHex?: string;
  terms?: ProposedTerms;
  escrow?: EscrowState & { funded: boolean };
  invites: InviteRecipient[];
  messages: { id: string; from: ReportRole; author: string; ciphertextHex: string; hash: string; at: string }[];
  timeline: TimelineEvent[];
  published?: { at: string; evidenceHash: string };
}

interface PublicView {
  id: string;
  title: string;
  target: string;
  repo?: string;
  severity: Severity;
  summary: string;
  body: string;
  publishedAt: string;
  createdAt: string;
  contentHash: string;
  evidenceHash: string;
  outcome: "fixed_and_paid" | "refunded" | "disclosed";
  rewardNear?: number;
  timeline: TimelineEvent[];
}

const demoBlocked = () => new ApiError("Sample data is read-only. Sign in to do this for real.", 403);
const guard = () => { if (isDemoSession()) throw demoBlocked(); };

async function toReport(view: PartyView): Promise<Report> {
  const key = getReportKey(view.id);
  let body = "";
  let bodyLocked = !!view.ciphertextHex && !key;
  if (view.ciphertextHex && key) {
    try {
      body = await openReportBody(view.ciphertextHex, key);
    } catch {
      bodyLocked = true; // wrong key stored for this report
    }
  }
  const messages: NegotiationMessage[] = await Promise.all(view.messages.map(async (m) => {
    let text = "";
    let locked = true;
    if (key) {
      try { text = await openReportBody(m.ciphertextHex, key); locked = false; } catch { /* cannot read */ }
    }
    return {
      id: m.id, from: m.from, author: m.from === view.role ? "you" : m.author, at: m.at, hash: m.hash,
      body: locked ? "Encrypted message. Add the report key to read it." : text, locked,
    };
  }));
  return {
    id: view.id, title: view.title, target: view.target, repo: view.repo, severity: view.severity, stage: view.stage, role: view.role,
    counterparty: view.counterparty, createdAt: view.createdAt, updatedAt: view.updatedAt, disclosureDeadline: view.disclosureDeadline,
    rewardNear: view.rewardNear, summary: view.summary, body, bodyLocked, escrow: view.escrow, terms: view.terms, invites: view.invites,
    messages, timeline: view.timeline, contentHash: view.contentHash, publishedAt: view.published?.at, evidenceHash: view.published?.evidenceHash,
  };
}

function fromPublic(view: PublicView): Report {
  return {
    id: view.id, title: view.title, target: view.target || "Unnamed project", repo: view.repo, severity: view.severity,
    stage: "published", role: "researcher", counterparty: "", createdAt: view.createdAt, updatedAt: view.publishedAt,
    disclosureDeadline: view.publishedAt, rewardNear: view.rewardNear, summary: view.summary, body: view.body, invites: [], messages: [],
    timeline: view.timeline, contentHash: view.contentHash, publishedAt: view.publishedAt, evidenceHash: view.evidenceHash,
    escrow: view.outcome === "fixed_and_paid" && view.rewardNear
      ? { amountNear: view.rewardNear, funded: false, expiresAt: view.publishedAt, contractId: "Preview ledger", mergeCheck: "merged", mode: "preview" } : undefined,
  };
}

const latency = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const samples = (list: Report[]) => list.map((r) => ({ ...r, sample: true }));

export async function listReports(): Promise<Report[]> {
  if (isDemoSession()) { await latency(600); return samples(sampleReports); }
  const { reports } = await api<{ reports: PartyView[] }>("/reports");
  return Promise.all(reports.map((r) => toReport(r)));
}

export async function getReport(id: string): Promise<Report> {
  if (isDemoSession()) {
    await latency(450);
    const sample = findSampleReport(id);
    if (!sample) throw new ApiError("This report does not exist, or you do not have access to it.", 404);
    return { ...sample, sample: true };
  }
  return toReport(await api<PartyView>(`/reports/${encodeURIComponent(id)}`));
}

/** Reports that were unsealed publicly by their researcher, with evidence. Falls back to samples while none exist. */
export async function listPublicDisclosures(): Promise<Report[]> {
  const { disclosures } = await api<{ disclosures: PublicView[] }>("/public/disclosures", { auth: false });
  if (disclosures.length) return disclosures.map(fromPublic);
  return samples(sampleReports.filter((r) => r.stage === "published"));
}

export async function getPublicDisclosure(id: string): Promise<Report> {
  const sample = findSampleReport(id);
  if (sample && sample.stage === "published") return { ...sample, sample: true };
  return fromPublic(await api<PublicView>(`/public/disclosures/${encodeURIComponent(id)}`, { auth: false }));
}

// ---------------------------------------------------------------------- writes

export interface NewReportInput {
  title: string;
  repo: string;
  severity: Severity;
  disclosureDays: number;
  body: string;
  summary: string;
  /** The report key sealed to the enclave public key, when one is configured. */
  sealedKeyHex?: string;
}

/**
 * Seals the report in the browser and registers it. The key is kept in this browser; the server
 * receives only ciphertext and its hash.
 */
export async function createReport(input: NewReportInput, sealed?: Awaited<ReturnType<typeof sealReportBody>>): Promise<Report> {
  guard();
  const s = sealed ?? (await sealReportBody(input.body));
  const view = await api<PartyView>("/reports", {
    body: {
      title: input.title.trim(), target: input.repo.split("/")[0] ?? "", repo: input.repo.trim() || undefined, severity: input.severity,
      summary: input.summary, disclosureDays: input.disclosureDays, ciphertextHex: s.ciphertextHex, contentHash: s.contentHash,
      sealedKeyHex: input.sealedKeyHex,
    },
  });
  saveReportKey(view.id, s.keyHex);
  return toReport(view);
}

const post = async (id: string, path: string, body: unknown = {}) => {
  guard();
  return toReport(await api<PartyView>(`/reports/${encodeURIComponent(id)}/${path}`, { body }));
};

export const createInvite = (id: string, channel: InviteRecipient["channel"], handle: string) => post(id, "invites", { channel, handle });
export const proposeTerms = (id: string, amountNear: number, repo: string) => post(id, "terms", { amountNear, repo });
export const acceptTerms = (id: string) => post(id, "terms/accept");
export const fundEscrow = (id: string) => post(id, "fund");
export const linkPullRequest = (id: string, url: string) => post(id, "pull-request", { url });
export const checkMerge = (id: string) => post(id, "check-merge");
export const claimPayout = (id: string) => post(id, "claim");
export const refundEscrow = (id: string) => post(id, "refund");

export async function sendMessage(id: string, text: string): Promise<Report> {
  guard();
  const key = getReportKey(id);
  if (!key) throw new ApiError("Add the report key before writing in this chat.", 400);
  const { ciphertextHex, hash } = await encryptWithKey(text, key);
  return toReport(await api<PartyView>(`/reports/${encodeURIComponent(id)}/messages`, { body: { ciphertextHex, hash } }));
}

export async function publishReport(id: string, body: string): Promise<Report> {
  guard();
  const key = getReportKey(id);
  if (!key) throw new ApiError("The report key is needed to unseal the report publicly.", 400);
  return toReport(await api<PartyView>(`/reports/${encodeURIComponent(id)}/publish`, { body: { body, keyHex: key } }));
}

export interface InvitePreview { reportId: string; title: string; from: string; severity: Severity; alreadyJoined: boolean; taken: boolean }
export const previewInvite = (token: string) => (guard(), api<InvitePreview>(`/invites/${encodeURIComponent(token)}`));

export async function redeemInvite(token: string): Promise<Report> {
  guard();
  const view = await api<PartyView>(`/invites/${encodeURIComponent(token)}/redeem`, { body: {} });
  const key = takeInviteKey(token);
  if (key) saveReportKey(view.id, key);
  return toReport(view);
}

export { saveReportKey };
