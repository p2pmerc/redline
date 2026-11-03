import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./server-main.js";
import { ReportStore } from "./report-store.js";
import { ProfileStore } from "./profile-store.js";
import type { StoredReport } from "./report-records.js";
import { buildLeaderboard, totalsOf, type BoardItem } from "./leaderboard.js";

const EMAIL = "invitee@acme.dev";
const WALLET = "alice-secret-wallet.testnet";

describe("buildLeaderboard", () => {
  const profiles = [
    { handle: "alice", displayName: "Alice", avatarSeed: "a" },
    { handle: "bob", displayName: "Bob", avatarSeed: "b" },
    { handle: "carol", displayName: "Carol", avatarSeed: "c" },
    { handle: "dave", displayName: "Dave", avatarSeed: "d" },
  ];
  const items: BoardItem[] = [
    { researcher: "alice", severity: "high", outcome: "fixed_and_paid", bountyNear: 0.1, paidAt: "2026-11-01T00:00:00Z" },
    { researcher: "alice", severity: "critical", outcome: "fixed_and_paid", bountyNear: 0.2, paidAt: "2026-11-03T00:00:00Z" },
    { researcher: "bob", severity: "medium", outcome: "fixed_and_paid", bountyNear: 0.3, paidAt: "2026-11-02T00:00:00Z" },
    { researcher: "carol", severity: "low", outcome: "disclosed" },
    { researcher: "nobody", severity: "critical", outcome: "fixed_and_paid", bountyNear: 9 },
  ];

  it("ranks by earnings without float noise, shares ranks on ties and skips researchers with nothing public", () => {
    const board = buildLeaderboard(items, profiles);
    expect(board.map((e) => [e.handle, e.rank, e.totalEarnedNear])).toEqual([["alice", 1, 0.3], ["bob", 1, 0.3], ["carol", 3, 0]]);
    expect(board[0]).toMatchObject({ disclosures: 2, paid: 2, highestSeverity: "critical", lastPaidAt: "2026-11-03T00:00:00Z" });
    expect(board.find((e) => e.handle === "carol")).toMatchObject({ paid: 0, highestSeverity: "low" });
  });

  it("is empty with no public items", () => {
    expect(buildLeaderboard([], profiles)).toEqual([]);
    expect(totalsOf([])).toMatchObject({ totalEarnedNear: 0, disclosures: 0, highestSeverity: null });
  });
});

const report = (id: string, researcherId: string, over: Partial<StoredReport>): StoredReport => ({
  id, researcherId, researcherName: "x", title: `Bug ${id}`, target: "acme/widgets", repo: "acme/widgets", severity: "high", summary: "Public summary",
  createdAt: "2026-11-01T10:00:00.000Z", updatedAt: "2026-11-02T10:00:00.000Z", disclosureDeadline: "2026-12-01T10:00:00.000Z",
  contentHash: "ab".repeat(32), ciphertextHex: "cd".repeat(40), sealedKeyHex: "ef".repeat(20), status: "registered",
  invites: [{ id: "i", token: "TOKEN-SECRET", channel: "email", handle: EMAIL, status: "redeemed", createdAt: "2026-11-01T11:00:00.000Z" }],
  messages: [], timeline: [], ...over,
});
const paidReport = (id: string, who: string, amount: number, severity: StoredReport["severity"], payAt: string) => report(id, who, {
  status: "paid", severity, payoutAccount: WALLET,
  escrow: { amountNear: amount, fundedAt: "2026-11-02T08:00:00.000Z", expiresAt: "2026-12-02T08:00:00.000Z", pullRequestUrl: "https://github.com/acme/widgets/pull/7", repo: "acme/widgets", pullRequest: 7, prConfirmed: true, mergeCheck: "merged" },
  timeline: [{ id: "t1", at: "2026-11-02T08:00:00.000Z", kind: "escrow_funded", title: "f", txHash: `FUND${id}` }, { id: "t2", at: payAt, kind: "payout", title: "p", txHash: `PAY${id}` }],
});

let server: Server;
let url: string;
const profile = (userId: string, handle: string, name: string) => ({ userId, handle, displayName: name, bio: `${name} bio`, skills: ["web"], links: { github: `https://github.com/${handle}` }, avatarSeed: `seed-${handle}`, payoutAccount: WALLET, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" });

beforeEach(async () => {
  const store = new ReportStore(null);
  [
    paidReport("rl-aaaaaaaaaaaa", "u-alice", 0.3, "high", "2026-11-02T10:00:00.000Z"),
    paidReport("rl-bbbbbbbbbbbb", "u-alice", 0.4, "critical", "2026-11-03T10:00:00.000Z"),
    paidReport("rl-cccccccccccc", "u-bob", 0.35, "medium", "2026-11-02T12:00:00.000Z"),
    report("rl-dddddddddddd", "u-bob", { status: "funded" }),
    report("rl-eeeeeeeeeeee", "u-carol", { status: "registered" }),
  ].forEach((r) => store.save(r));
  const profiles = new ProfileStore(null);
  profiles.save(profile("u-alice", "alice", "Alice"));
  profiles.save(profile("u-bob", "bob", "Bob"));
  profiles.save(profile("u-carol", "carol", "Carol"));
  const app = createApp({
    config: { port: 0, dataFile: null, webDist: "/nonexistent", privyAppId: "app", ledgerMode: "testnet", escrowContractId: "redline-escrow.testnet", enclavePublicKey: "k", appOrigin: "https://redline.example" },
    store, profiles, verifyToken: async (t) => t, mergeLookup: async () => ({ status: "merged", mergeCommit: "1".repeat(40) }),
  });
  await new Promise<void>((r) => { server = app.listen(0, r); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

const get = async (path: string) => {
  const res = await fetch(url + path);
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text) };
};
const noLeaks = (text: string) => { for (const s of [EMAIL, WALLET, "TOKEN-SECRET", "ef".repeat(20), "cd".repeat(40), "u-alice", "u-bob"]) expect(text).not.toContain(s); };

describe("leaderboard API", () => {
  it("GET /api/v1/leaderboard ranks researchers with public totals only", async () => {
    const r = await get("/api/v1/leaderboard");
    expect(r.status).toBe(200);
    expect(r.json.researchers.map((e: any) => [e.rank, e.handle, e.totalEarnedNear, e.disclosures, e.paid, e.highestSeverity])).toEqual([[1, "alice", 0.7, 2, 2, "critical"], [2, "bob", 0.35, 1, 1, "medium"]]);
    expect(r.json.researchers[0].links.profile).toBe("https://redline.example/researchers/alice");
    noLeaks(r.text);
    expect((await get("/api/v1/leaderboard?limit=1&offset=1")).json.researchers.map((e: any) => e.handle)).toEqual(["bob"]);
  });

  it("GET /api/v1/researchers/:handle lists the researcher's public disclosures", async () => {
    const r = await get("/api/v1/researchers/alice");
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ handle: "alice", rank: 1, totalEarnedNear: 0.7, paid: 2, highestSeverity: "critical", bio: "Alice bio" });
    expect(r.json.disclosures.map((d: any) => d.id).sort()).toEqual(["rl-aaaaaaaaaaaa", "rl-bbbbbbbbbbbb"]);
    expect(r.json.disclosures[0].links.payoutTx).toContain("https://testnet.nearblocks.io/txns/PAY");
    noLeaks(r.text);
    expect((await get("/api/v1/researchers/BOB")).json.disclosures).toHaveLength(1);
  });

  it("returns JSON errors for unknown, invalid and researchers with nothing public", async () => {
    expect((await get("/api/v1/researchers/nobody")).json.code).toBe("not_found");
    expect((await get("/api/v1/researchers/a")).status).toBe(400);
    const carol = await get("/api/v1/researchers/carol");
    expect(carol.json).toMatchObject({ disclosures: [], totalEarnedNear: 0, rank: null });
  });

  it("is listed in the index, llms.txt and manifest", async () => {
    for (const p of ["/api/v1", "/.well-known/redline.json", "/llms.txt"]) {
      const t = (await fetch(url + p).then((r) => r.text()));
      expect(t).toContain("/api/v1/leaderboard");
      expect(t).toContain("/api/v1/researchers/");
    }
  });
});
