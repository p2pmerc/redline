import type { StoredReport } from "./report-records.js";
import type { MergeLookup } from "./github-merge-lookup.js";
import * as ledger from "./escrow-ledger.js";
import { LedgerError, type MergeAnswer } from "./escrow-ledger.js";
import { ChainError, type ChainRelay } from "./chain-relay.js";

/** 0.05 NEAR pays for one enclave run, the unused part is refunded. */
export const NEAR_CHECK_DEPOSIT = 5n * 10n ** 22n;

export interface SettlementContext {
  live: boolean;
  relay?: ChainRelay;
  mergeLookup: MergeLookup;
  now: () => Date;
  /** Researcher's linked GitHub login, if any. The fix PR must be authored by this account. */
  githubLoginOf: (userId: string) => string | undefined;
}

const needRelay = (ctx: SettlementContext): ChainRelay => {
  if (!ctx.relay) throw new ChainError("The testnet contract is not connected yet.", 501);
  return ctx.relay;
};

/** Reports being worked on right now, by the API or the poller. Prevents two enclave runs at once. */
const inFlight = new Set<string>();
export const isBusy = (id: string) => inFlight.has(id);
export async function exclusive<T>(id: string, run: () => Promise<T>): Promise<T> {
  if (inFlight.has(id)) throw new LedgerError("A check for this report is already running. Try again in a moment.", 409);
  inFlight.add(id);
  try { return await run(); } finally { inFlight.delete(id); }
}

export const verdictOf = (logs: string[], phase: string): MergeAnswer["status"] => {
  for (const line of logs) {
    const m = /^EVENT_JSON:(.*)$/.exec(line);
    if (!m) continue;
    try {
      const ev = JSON.parse(m[1]!) as { standard?: string; event?: string; data?: { phase?: string; verdict?: string } };
      if (ev.standard === "redline" && ev.event === "merge_checked" && ev.data?.phase === phase) {
        return ev.data.verdict === "Merged" ? "merged" : ev.data.verdict === "NotMerged" ? "not_merged" : "unknown";
      }
    } catch { /* not ours */ }
  }
  return "unknown";
};
export const settled = (logs: string[], kind: string) => logs.some((l) => l.includes('"event":"transfer_settled"') && l.includes(`"kind":"${kind}"`));

/** In live mode: record the real transaction on the newest timeline entry and drop the preview wording. */
export const stamp = (r: StoredReport, txHash: string) => {
  const last = r.timeline[r.timeline.length - 1];
  if (!last) return;
  last.txHash = txHash;
  if (last.detail) last.detail = last.detail.replace(/\s*\(preview ledger[^)]*\)/, "");
};

/** First sighting of the merge. Mutates `r`; the caller decides whether to save it. */
export async function runMergeCheck(ctx: SettlementContext, r: StoredReport): Promise<void> {
  if (r.status !== "funded" || !r.escrow?.pullRequest || !r.escrow.repo) throw new LedgerError("link a pull request first");
  const author = ctx.githubLoginOf(r.researcherId);
  if (!ctx.live) {
    ledger.applyConfirmAnswer(r, await ctx.mergeLookup(r.escrow.repo, r.escrow.pullRequest, author), ctx.now());
    return;
  }
  // The enclave inside OutLayer looks at GitHub and the contract records its answer.
  const done = await needRelay(ctx).call("team", "request_merge_check", { report_id: r.id }, NEAR_CHECK_DEPOSIT, 300);
  const answer: MergeAnswer = { status: verdictOf(done.logs, "Confirm"), repo: r.escrow.repo, pullRequest: r.escrow.pullRequest };
  if (answer.status === "merged") answer.mergeCommit = (await ctx.mergeLookup(r.escrow.repo, r.escrow.pullRequest, author).catch(() => undefined))?.mergeCommit;
  ledger.applyConfirmAnswer(r, answer, ctx.now());
  if (answer.status === "merged") stamp(r, done.txHash);
}

/** Second sighting and payout. Mutates `r`. */
export async function runClaim(ctx: SettlementContext, r: StoredReport): Promise<void> {
  if (r.status !== "merge_confirmed" || !r.escrow?.pullRequest || !r.escrow.repo) throw new LedgerError("the merge has not been confirmed yet");
  if (!ctx.live) {
    ledger.applyPayoutAnswer(r, "researcher", await ctx.mergeLookup(r.escrow.repo, r.escrow.pullRequest, ctx.githubLoginOf(r.researcherId)), ctx.now());
    return;
  }
  const done = await needRelay(ctx).call("researcher", "claim_payout", { report_id: r.id }, NEAR_CHECK_DEPOSIT, 300);
  const status = verdictOf(done.logs, "Payout");
  if (status === "merged" && !settled(done.logs, "Payout")) throw new ChainError("The payout transfer did not settle. Try claiming again.", 502);
  if (ledger.applyPayoutAnswer(r, "researcher", { status }, ctx.now())) stamp(r, done.txHash);
}
