import { describe, expect, it } from "vitest";
import { runClaim, runMergeCheck, type SettlementContext } from "./settlement.js";
import type { StoredReport } from "./report-records.js";
import type { ChainRelay } from "./chain-relay.js";

const at = "2026-11-02T10:00:00.000Z";
const report = (status: StoredReport["status"]): StoredReport => ({
  id: "rl-aaaaaaaaaaaa", researcherId: "u", researcherName: "R", title: "t", target: "", repo: "acme/w", severity: "high", summary: "",
  createdAt: at, updatedAt: at, disclosureDeadline: at, contentHash: "a".repeat(64), ciphertextHex: "00", status, payoutAccount: "r.testnet",
  escrow: { amountNear: 1, fundedAt: at, expiresAt: at, repo: "acme/w", pullRequest: 1, pullRequestUrl: "u", mergeCheck: "pending" },
  invites: [], messages: [], timeline: [],
});

function setup(lookup: SettlementContext["mergeLookup"]) {
  const calls: string[] = [];
  const relay = { call: async (_r: string, m: string) => { calls.push(m); return { txHash: "tx", logs: [] }; } } as unknown as ChainRelay;
  const ctx: SettlementContext = { live: true, relay, mergeLookup: lookup, now: () => new Date(at), githubLoginOf: () => "p2pmerc" };
  return { ctx, calls };
}

describe("live settlement checks the PR author before spending the enclave", () => {
  it("does not call the enclave when the PR is not merged by the linked author", async () => {
    const { ctx, calls } = setup(async () => ({ status: "unknown" }));
    const r = report("funded");
    await runMergeCheck(ctx, r);
    expect(calls).toEqual([]);
    expect(r.status).toBe("funded");
  });

  it("refuses to start a payout when the merge or author is not confirmed", async () => {
    const { ctx, calls } = setup(async () => ({ status: "unknown" }));
    await expect(runClaim(ctx, report("merge_confirmed"))).rejects.toThrow(/linked GitHub/);
    expect(calls).toEqual([]);
  });

  it("calls the enclave once the author-checked read shows a merge", async () => {
    const { ctx, calls } = setup(async () => ({ status: "merged", mergeCommit: "c".repeat(40) }));
    await runMergeCheck(ctx, report("funded")).catch(() => {});
    expect(calls).toEqual(["request_merge_check"]);
  });
});
