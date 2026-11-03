import { describe, expect, it } from "vitest";
import { ReportStore } from "./report-store.js";
import { createPayoutAutomation } from "./payout-automation.js";
import type { StoredReport } from "./report-records.js";
import type { MergeAnswer } from "./escrow-ledger.js";

function funded(id: string): StoredReport {
  const at = "2026-11-02T10:00:00.000Z";
  return {
    id, researcherId: "user-a", researcherName: "A", title: "t", target: "", repo: "acme/widgets", severity: "high", summary: "",
    createdAt: at, updatedAt: at, disclosureDeadline: "2027-01-01T00:00:00.000Z", contentHash: "a".repeat(64), ciphertextHex: "00",
    status: "funded", payoutAccount: "a.testnet", terms: { amountNear: 1, repo: "acme/widgets", proposedBy: "team", researcherAccepted: true } as never,
    escrow: { amountNear: 1, fundedAt: at, expiresAt: "2026-12-01T00:00:00.000Z", repo: "acme/widgets", pullRequest: 1, pullRequestUrl: "https://github.com/acme/widgets/pull/1", mergeCheck: "pending" },
    invites: [], messages: [], timeline: [],
  };
}

describe("payout automation", () => {
  it("does nothing until GitHub shows the merge, then confirms and pays without a click", async () => {
    let nowMs = Date.parse("2026-11-02T10:00:00Z");
    const store = new ReportStore(null);
    store.insert(funded("rl-aaaaaaaaaaaa"));
    const seenAuthors: Array<string | undefined> = [];
    let answer: MergeAnswer = { status: "not_merged" };
    const lookup = async (_r: string, _p: number, author?: string) => { seenAuthors.push(author); return { ...answer }; };
    const auto = createPayoutAutomation({
      store, pollMs: 60_000,
      ctx: { live: false, mergeLookup: lookup, now: () => new Date(nowMs), githubLoginOf: () => "p2pmerc" },
    });

    await auto.tick();
    expect(store.get("rl-aaaaaaaaaaaa")!.status).toBe("funded");
    expect(seenAuthors).toEqual(["p2pmerc"]);

    nowMs += 30_000; // too soon, no new look
    await auto.tick();
    expect(seenAuthors).toHaveLength(1);

    nowMs += 60_000;
    answer = { status: "merged", mergeCommit: "c".repeat(40) };
    await auto.tick();
    const r = store.get("rl-aaaaaaaaaaaa")!;
    expect(r.status).toBe("paid");
    expect(r.timeline.map((t) => t.kind)).toEqual(expect.arrayContaining(["pr_merged", "payout"]));
  });

  it("backs off after a failed look and never touches reports that are not funded", async () => {
    let nowMs = Date.parse("2026-11-02T10:00:00Z");
    const store = new ReportStore(null);
    store.insert(funded("rl-bbbbbbbbbbbb"));
    store.insert({ ...funded("rl-cccccccccccc"), status: "registered", escrow: undefined });
    let looks = 0;
    const auto = createPayoutAutomation({
      store, pollMs: 60_000,
      ctx: { live: false, mergeLookup: async () => { looks++; return { status: "unknown" }; }, now: () => new Date(nowMs), githubLoginOf: () => undefined },
    });
    await auto.tick();
    expect(looks).toBe(1);
    nowMs += 61_000; // first failure waits two intervals
    await auto.tick();
    expect(looks).toBe(1);
    nowMs += 120_000;
    await auto.tick();
    expect(looks).toBe(2);
  });
});
