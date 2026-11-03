import type { Role, StoredReport } from "./report-records.js";

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
      return report.invites.length > 0 ? "invited" : "sealed";
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
    counterparty: role === "researcher" ? report.teamName ?? "Not joined yet" : report.researcherName,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    disclosureDeadline: report.disclosureDeadline,
    rewardNear: report.escrow?.amountNear ?? report.terms?.amountNear,
    summary: report.summary,
    contentHash: report.contentHash,
    ciphertextHex: report.ciphertextHex,
    terms: report.terms,
    escrow: report.escrow
      ? { ...report.escrow, amountNear: report.escrow.amountNear, funded: report.status !== "paid" && report.status !== "refunded", contractId, mode: ledgerMode }
      : undefined,
    invites: report.invites.map((i) => ({
      id: i.id, channel: i.channel, handle: i.handle, status: i.status,
      ...(role === "researcher" ? { token: i.token } : {}),
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

/** Public disclosure: only after the researcher unsealed it. No chat, no invites. */
export function publicView(report: StoredReport) {
  const published = report.published!;
  return {
    id: report.id,
    title: report.title,
    target: report.target,
    repo: report.repo,
    severity: report.severity,
    summary: report.summary,
    body: published.body,
    publishedAt: published.at,
    createdAt: report.createdAt,
    contentHash: report.contentHash,
    evidenceHash: published.evidenceHash,
    outcome: report.status === "paid" ? "fixed_and_paid" : report.status === "refunded" ? "refunded" : "disclosed",
    rewardNear: report.status === "paid" ? report.escrow?.amountNear : undefined,
    timeline: report.timeline.filter((t) => t.kind !== "message" && t.kind !== "invite_sent" && t.kind !== "invite_redeemed"),
  };
}
