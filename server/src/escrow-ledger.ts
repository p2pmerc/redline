/**
 * Preview ledger: the escrow state machine from the NEAR contract, run on the server so the app
 * works end to end before the contract is deployed. No funds move. Every transition mirrors a
 * contract method and enforces the same caller and state rules.
 */
import { createHash, randomUUID } from "node:crypto";
import type { MergeCheck, Role, StoredReport, TimelineEntry } from "./report-records.js";

export class LedgerError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

const DAY_MS = 86_400_000;
export const ESCROW_WINDOW_DAYS = 30;

export interface MergeAnswer {
  status: MergeCheck;
  repo?: string;
  pullRequest?: number;
  mergeCommit?: string;
}

export const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Accepts `owner/name` or a github.com URL and returns `owner/name`, or undefined. */
export function normalizeRepoRef(raw: string): string | undefined {
  const value = raw.trim().replace(/\.git$/i, "");
  if (!value) return undefined;
  if (REPO_PATTERN.test(value)) return value;
  const fromUrl = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/i.exec(value);
  if (fromUrl) {
    const repo = `${fromUrl[1]}/${fromUrl[2]}`;
    return REPO_PATTERN.test(repo) ? repo : undefined;
  }
  return undefined;
}


/** Accepts `https://github.com/owner/repo/pull/12` and returns its parts, or undefined. */
export function parsePullRequestUrl(url: string): { repo: string; pullRequest: number } | undefined {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/(\d{1,9})\/?$/.exec(url.trim());
  if (!match) return undefined;
  return { repo: match[1]!, pullRequest: Number(match[2]) };
}

export function previewTxHash(...parts: string[]): string {
  return `preview:${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16)}`;
}

function note(report: StoredReport, now: Date, entry: Omit<TimelineEntry, "id" | "at">): void {
  report.timeline.push({ id: randomUUID(), at: now.toISOString(), ...entry });
  report.updatedAt = now.toISOString();
}

function requireRole(actual: Role | undefined, wanted: Role): void {
  if (actual !== wanted) throw new LedgerError(`only the ${wanted} can do this`, 403);
}

export function proposeTerms(report: StoredReport, role: Role | undefined, amountNear: number, repo: string, now: Date): void {
  requireRole(role, "team");
  if (!["registered", "terms_proposed", "terms_accepted"].includes(report.status)) throw new LedgerError("terms can only change before funding");
  if (!(amountNear > 0) || amountNear > 1_000_000) throw new LedgerError("amount must be greater than zero", 400);
  if (!REPO_PATTERN.test(repo)) throw new LedgerError("repo must look like owner/name", 400);
  report.terms = { amountNear, repo, proposedAt: now.toISOString(), accepted: false };
  report.status = "terms_proposed";
  note(report, now, { kind: "terms_proposed", title: "Reward proposed", detail: `${amountNear} NEAR for a merged fix in ${repo}` });
}

export function acceptTerms(report: StoredReport, role: Role | undefined, now: Date): void {
  requireRole(role, "researcher");
  if (report.status !== "terms_proposed" || !report.terms) throw new LedgerError("there are no open terms to accept");
  report.terms.accepted = true;
  report.status = "terms_accepted";
  note(report, now, { kind: "agreement_signed", title: "Terms accepted", detail: `${report.terms.amountNear} NEAR, ${report.terms.repo}`, txHash: previewTxHash(report.id, "accept") });
}

export function fundEscrow(report: StoredReport, role: Role | undefined, now: Date): void {
  requireRole(role, "team");
  if (report.status !== "terms_accepted" || !report.terms) throw new LedgerError("terms must be accepted before funding");
  if (!report.payoutAccount) throw new LedgerError("the researcher has not set a payout NEAR account yet, so funding is blocked");
  report.escrow = {
    amountNear: report.terms.amountNear,
    fundedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ESCROW_WINDOW_DAYS * DAY_MS).toISOString(),
    repo: report.terms.repo,
    mergeCheck: "pending",
  };
  report.status = "funded";
  note(report, now, { kind: "escrow_funded", title: "Escrow funded", detail: `${report.terms.amountNear} NEAR locked (preview ledger, no funds move)`, txHash: previewTxHash(report.id, "fund") });
}

export function linkPullRequest(report: StoredReport, role: Role | undefined, url: string, now: Date): void {
  requireRole(role, "researcher");
  if (report.status !== "funded" || !report.escrow) throw new LedgerError("escrow must be funded and not yet confirmed");
  const parsed = parsePullRequestUrl(url);
  if (!parsed) throw new LedgerError("use a link like https://github.com/owner/repo/pull/123", 400);
  if (parsed.repo.toLowerCase() !== report.escrow.repo?.toLowerCase()) throw new LedgerError(`the pull request must be in ${report.escrow.repo}`, 400);
  report.escrow.pullRequestUrl = `https://github.com/${parsed.repo}/pull/${parsed.pullRequest}`;
  report.escrow.pullRequest = parsed.pullRequest;
  report.escrow.mergeCheck = "pending";
  note(report, now, { kind: "pr_linked", title: "Pull request linked", detail: report.escrow.pullRequestUrl, txHash: previewTxHash(report.id, "pr", String(parsed.pullRequest)) });
}

/** First answer: a "merged" answer moves the report to merge_confirmed. */
export function applyConfirmAnswer(report: StoredReport, answer: MergeAnswer, now: Date): void {
  if (report.status !== "funded" || !report.escrow?.pullRequest) throw new LedgerError("link a pull request first");
  report.escrow.mergeCheck = answer.status;
  if (answer.status === "merged") {
    report.escrow.mergeCommit = answer.mergeCommit;
    report.status = "merge_confirmed";
    note(report, now, { kind: "pr_merged", title: "Merge confirmed", detail: answer.mergeCommit ? `Commit ${answer.mergeCommit.slice(0, 10)}` : undefined, txHash: previewTxHash(report.id, "confirm") });
  } else {
    report.updatedAt = now.toISOString();
  }
}

/** Second answer: only a second "merged" answer releases the reward. */
export function applyPayoutAnswer(report: StoredReport, role: Role | undefined, answer: MergeAnswer, now: Date): boolean {
  requireRole(role, "researcher");
  if (report.status !== "merge_confirmed" || !report.escrow) throw new LedgerError("the merge has not been confirmed yet");
  report.escrow.mergeCheck = answer.status;
  if (answer.status !== "merged") {
    report.status = "funded"; // the merge went away, start over
    report.updatedAt = now.toISOString();
    return false;
  }
  report.status = "paid";
  note(report, now, { kind: "payout", title: "Reward released", detail: `${report.escrow.amountNear} NEAR to the researcher (preview ledger)`, txHash: previewTxHash(report.id, "payout") });
  return true;
}

export function canRefund(report: StoredReport, now: Date): boolean {
  return (report.status === "funded" || report.status === "merge_confirmed") && !!report.escrow && now.getTime() >= new Date(report.escrow.expiresAt).getTime();
}

/** Refund after expiry, only when a final check says the pull request is not merged. */
export function applyRefundAnswer(report: StoredReport, role: Role | undefined, answer: MergeAnswer, now: Date): boolean {
  requireRole(role, "team");
  if (!canRefund(report, now)) throw new LedgerError("the escrow has not expired, or there is nothing to refund");
  report.escrow!.mergeCheck = answer.status;
  if (answer.status !== "not_merged") {
    // merged: the researcher can still claim; unknown: fail closed
    report.updatedAt = now.toISOString();
    return false;
  }
  report.status = "refunded";
  note(report, now, { kind: "refund", title: "Escrow refunded", detail: `${report.escrow!.amountNear} NEAR back to the team (preview ledger)`, txHash: previewTxHash(report.id, "refund") });
  return true;
}
