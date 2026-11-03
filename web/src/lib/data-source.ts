import { api, ApiError } from "./api-client";
import { redlineConfig } from "./redline-config";
import type { EscrowState, InviteRecipient, NegotiationMessage, ProposedTerms, Report, ReportRole, ResearcherProfile, ResearcherStats, ReportStage, Severity, TimelineEvent } from "./redline-types";
import { getReportKey, saveReportKey, takeInviteKey } from "./report-key-vault";
import { encryptWithKey, openReportBody, sealReportBody } from "./report-encryption";

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
  researcherSeed?: string;
  teamSeed?: string;
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
  evidenceHash?: string;
  outcome: "fixed_and_paid" | "refunded" | "disclosed";
  rewardNear?: number;
  researcherSeed?: string;
  researcherHandle?: string;
  researcherName?: string;
  bodyPublished: boolean;
  pullRequestUrl?: string;
  timeline: TimelineEvent[];
}

const guard = () => {};

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
    counterparty: view.counterparty, researcherSeed: view.researcherSeed, teamSeed: view.teamSeed, createdAt: view.createdAt, updatedAt: view.updatedAt, disclosureDeadline: view.disclosureDeadline,
    rewardNear: view.rewardNear, summary: view.summary, body, bodyLocked, escrow: view.escrow, terms: view.terms, invites: view.invites,
    messages, timeline: view.timeline, contentHash: view.contentHash, publishedAt: view.published?.at, evidenceHash: view.published?.evidenceHash,
  };
}

function fromPublic(view: PublicView): Report {
  return {
    id: view.id, title: view.title, target: view.target || "Unnamed project", repo: view.repo, severity: view.severity,
    stage: view.bodyPublished ? "published" : "paid", role: "researcher", counterparty: "", researcherSeed: view.researcherSeed,
    researcherHandle: view.researcherHandle, researcherName: view.researcherName, bodyPublished: view.bodyPublished, createdAt: view.createdAt, updatedAt: view.publishedAt,
    disclosureDeadline: view.publishedAt, rewardNear: view.rewardNear, summary: view.summary, body: view.body, invites: [], messages: [],
    timeline: view.timeline, contentHash: view.contentHash, publishedAt: view.publishedAt, evidenceHash: view.evidenceHash,
    escrow: view.outcome === "fixed_and_paid" && view.rewardNear
      ? { amountNear: view.rewardNear, funded: false, expiresAt: view.publishedAt, contractId: redlineConfig.escrowContractId, mergeCheck: "merged", mode: "testnet", pullRequestUrl: view.pullRequestUrl } : undefined,
  };
}

export async function listReports(): Promise<Report[]> {
  const { reports } = await api<{ reports: PartyView[] }>("/reports");
  return Promise.all(reports.map((r) => toReport(r)));
}

export async function getReport(id: string): Promise<Report> {
  return toReport(await api<PartyView>(`/reports/${encodeURIComponent(id)}`));
}

/** Reports that were unsealed publicly by their researcher, with evidence.  */
export async function listPublicDisclosures(): Promise<Report[]> {
  const { disclosures } = await api<{ disclosures: PublicView[] }>("/public/disclosures", { auth: false });
  return disclosures.map(fromPublic);
}

export async function getPublicDisclosure(id: string): Promise<Report> {
  return fromPublic(await api<PublicView>(`/public/disclosures/${encodeURIComponent(id)}`, { auth: false }));
}

export async function getPublicResearcher(handle: string): Promise<{ profile: ResearcherProfile; stats: ResearcherStats; reports: Report[] }> {
  const view = await api<{ profile: ResearcherProfile; stats: ResearcherStats; reports: PublicView[] }>(`/public/researchers/${encodeURIComponent(handle)}`, { auth: false });
  return { profile: view.profile, stats: view.stats, reports: view.reports.map(fromPublic) };
}

export async function getMyProfile(): Promise<ResearcherProfile | null> {
  return (await api<{ profile: ResearcherProfile | null }>("/profile")).profile;
}

export type ProfileInput = Omit<ResearcherProfile, "joinedAt">;
export async function saveMyProfile(input: ProfileInput): Promise<ResearcherProfile> {
  return (await api<{ profile: ResearcherProfile }>("/profile", { method: "PUT", body: input })).profile;
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

export const createInvite = (id: string, channel: InviteRecipient["channel"], handle: string, reportKeyHex?: string | null) =>
  post(id, "invites", { channel, handle, ...(reportKeyHex ? { reportKeyHex } : {}) });

export async function registerDeviceKey(reportId: string, devicePubHex: string): Promise<void> {
  guard();
  await api(`/reports/${encodeURIComponent(reportId)}/device-key`, { body: { devicePubHex } });
}

export async function listPartyDeviceKeys(reportId: string): Promise<{ keys: { userId: string; devicePubHex: string; at: string }[] }> {
  guard();
  return api(`/reports/${encodeURIComponent(reportId)}/device-keys`);
}

export async function depositKeyWraps(reportId: string, wraps: { userId: string; devicePubHex: string; wrapHex: string }[]): Promise<void> {
  guard();
  await api(`/reports/${encodeURIComponent(reportId)}/key-wraps`, { body: { wraps } });
}

export async function fetchMyKeyWraps(reportId: string): Promise<{ wraps: { devicePubHex: string; wrapHex: string; at: string }[] }> {
  guard();
  return api(`/reports/${encodeURIComponent(reportId)}/key-wraps/me`);
}
export const revokeInvite = (id: string, inviteId: string) => post(id, `invites/${encodeURIComponent(inviteId)}/revoke`);
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
