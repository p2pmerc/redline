import { createHash } from "node:crypto";
import type { Role, StoredReport } from "./report-records.js";

/** Stable avatar seed: a hash of the account id, never the email or name, so it reveals nothing and does not change. */
export const avatarSeed = (userId: string): string => createHash("sha256").update(`redline:avatar:v1:${userId}`).digest("hex").slice(0, 32);

export type Stage = "sealed" | "invited" | "negotiating" | "agreed" | "funded" | "fix_merged" | "paid" | "published" | "refunded";

export function roleOf(report: StoredReport, userId: string): Role | undefined {
  if (report.researcherId === userId) return "researcher";
  if (report.teamId === userId) return "team";
  return undefined;
}

export function stageOf(report: StoredReport): Stage {
  if (report.published) return "published";
  switch (report.status) {
    case "refunded": return "refunded";
    case "paid": return "paid";
    case "merge_confirmed": return "fix_merged";
    case "funded": return "funded";
    case "terms_accepted": return "agreed";
    case "terms_proposed": return "negotiating";
    default:
      if (report.teamId) return "negotiating";
      // Revoked/expired invites must not keep the report stuck on "Invited".
      const openInvite = report.invites.some((i) => i.status === "pending" || i.status === "redeemed");
      return openInvite ? "invited" : "sealed";
  }
}

/** What a party to the report may see. Bodies and messages stay ciphertext. */
export function partyView(report: StoredReport, role: Role, ledgerMode: string, contractId: string) {
  return {
    id: report.id,
    title: report.title,
    target: report.target,
    repo: report.repo,
    severity: report.severity,
    stage: stageOf(report),
    role,
    researcherSeed: avatarSeed(report.researcherId),
    teamSeed: report.teamId ? avatarSeed(report.teamId) : undefined,
    counterparty: role === "researcher" ? report.teamName ?? "Not joined yet" : report.researcherName,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    disclosureDeadline: report.disclosureDeadline,
    rewardNear: report.escrow?.amountNear ?? report.terms?.amountNear,
    payoutAccount: report.payoutAccount,
    summary: report.summary,
    contentHash: report.contentHash,
    ciphertextHex: report.ciphertextHex,
    terms: report.terms,
    escrow: report.escrow
      ? { ...report.escrow, amountNear: report.escrow.amountNear, funded: report.status !== "paid" && report.status !== "refunded", contractId, mode: ledgerMode }
      : undefined,
    invites: report.invites.map((i) => ({
      id: i.id, channel: i.channel, handle: i.handle, status: i.status,
      ...(role === "researcher" && i.status !== "revoked" ? { token: i.token } : {}),
      ...(role === "researcher" && i.delivery ? { delivery: { state: i.delivery.state, at: i.delivery.at, error: i.delivery.error } } : {}),
    })),
    messages: report.messages.map((m) => ({ id: m.id, from: m.role, author: m.authorName, ciphertextHex: m.ciphertextHex, hash: m.hash, at: m.at })),
    timeline: report.timeline,
    published: report.published ? { at: report.published.at, evidenceHash: report.published.evidenceHash } : undefined,
    ledgerMode,
  };
}

export function summaryView(report: StoredReport, role: Role, ledgerMode: string, contractId: string) {
  const { ciphertextHex: _c, messages: _m, ...rest } = partyView(report, role, ledgerMode, contractId);
  return { ...rest, messages: [] as never[] };
}

/** Shown publicly: unsealed by the researcher, or fixed with the escrow paid out. Nothing else, ever. */
export const isPublic = (report: StoredReport): boolean => !!report.published || report.status === "paid";

export interface PublicAuthor { handle: string; displayName: string; avatarSeed: string }

/**
 * Public view of a disclosed or paid report. A paid report that was never unsealed shows its summary and
 * payout only; the body stays sealed. No chat, no invites.
 */
export function publicView(report: StoredReport, author?: PublicAuthor) {
  const paidAt = report.timeline.find((t) => t.kind === "payout")?.at ?? report.updatedAt;
  return {
    id: report.id,
    title: report.title,
    target: report.target,
    repo: report.repo,
    severity: report.severity,
    summary: report.summary,
    researcherSeed: author?.avatarSeed ?? avatarSeed(report.researcherId),
    researcherHandle: author?.handle,
    researcherName: author?.displayName,
    body: report.published?.body ?? "",
    bodyPublished: !!report.published,
    publishedAt: report.published?.at ?? paidAt,
    createdAt: report.createdAt,
    contentHash: report.contentHash,
    evidenceHash: report.published?.evidenceHash,
    outcome: report.status === "paid" ? "fixed_and_paid" : report.status === "refunded" ? "refunded" : "disclosed",
    rewardNear: report.status === "paid" ? report.escrow?.amountNear : undefined,
    pullRequestUrl: report.status === "paid" ? report.escrow?.pullRequestUrl : undefined,
    timeline: report.timeline.filter((t) => t.kind !== "message" && t.kind !== "invite_sent" && t.kind !== "invite_redeemed" && t.kind !== "invite_revoked" && t.kind !== "terms_proposed"),
  };
}
