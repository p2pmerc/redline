import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./server-main.js";
import { ReportStore } from "./report-store.js";
import type { StoredReport } from "./report-records.js";
import type { ChainReader } from "./chain-reader.js";

const SECRET_BODY = "## Bug\nTOP-SECRET-PLAINTEXT";
const SECRET_CHAT = "CHAT-SECRET-CIPHERTEXT-aa";
const EMAIL = "invitee@acme.dev";
const CONTRACT = "redline-escrow.testnet";

const base = (id: string, over: Partial<StoredReport>): StoredReport => ({
  id, researcherId: "user-alice", researcherName: "Alice", title: "SQL injection in search", target: "acme/widgets", repo: "acme/widgets",
  severity: "high", summary: "A public summary", createdAt: "2026-11-01T10:00:00.000Z", updatedAt: "2026-11-02T10:00:00.000Z",
  disclosureDeadline: "2026-12-01T10:00:00.000Z", contentHash: "ab".repeat(32), ciphertextHex: "cd".repeat(40), sealedKeyHex: "ef".repeat(20),
  status: "registered", invites: [{ id: "i1", token: "TOKEN-SECRET", channel: "email", handle: EMAIL, status: "redeemed", createdAt: "2026-11-01T11:00:00.000Z" }],
  messages: [{ id: "m1", role: "team", authorName: "Bob", ciphertextHex: SECRET_CHAT, hash: "11".repeat(32), at: "2026-11-01T12:00:00.000Z" }],
  timeline: [], ...over,
});

const paid = base("rl-aaaaaaaaaaaa", {
  status: "paid", teamId: "user-bob", payoutAccount: "alice.testnet", githubLogin: "alice",
  escrow: { amountNear: 0.3, fundedAt: "2026-11-02T08:00:00.000Z", expiresAt: "2026-12-02T08:00:00.000Z", pullRequestUrl: "https://github.com/acme/widgets/pull/7", repo: "acme/widgets", pullRequest: 7, prConfirmed: true, mergeCheck: "merged", mergeCommit: "1".repeat(40) },
  timeline: [
    { id: "t1", at: "2026-11-02T08:00:00.000Z", kind: "escrow_funded", title: "Escrow funded", txHash: "FUNDTX" },
    { id: "t2", at: "2026-11-02T09:00:00.000Z", kind: "invite_sent", title: "Invite sent", detail: EMAIL },
    { id: "t3", at: "2026-11-02T10:00:00.000Z", kind: "payout", title: "Reward released", txHash: "PAYTX" },
  ],
});
const published = base("rl-bbbbbbbbbbbb", {
  status: "paid", published: { at: "2026-11-03T10:00:00.000Z", body: "public body text", evidenceHash: "99".repeat(32) },
  escrow: { amountNear: 0.4, fundedAt: "2026-11-02T08:00:00.000Z", expiresAt: "2026-12-02T08:00:00.000Z", repo: "acme/widgets", pullRequest: 8, prConfirmed: true, mergeCheck: "merged" },
});
const priv = base("rl-cccccccccccc", { status: "terms_accepted", teamId: "user-bob" });

const chain: ChainReader = {
  report: async (_c, id) => (id === paid.id
    ? { researcher: "researcher.redline-escrow.testnet", content_hash: paid.contentHash, status: "Paid", terms: { amount: "300000000000000000000000", repo: "acme/widgets" }, escrow: { pull_request: 7 }, message_count: 1 }
    : null),
  config: async () => ({ enclave_project_id: "redline-escrow.testnet/redline-enclave", enclave_version_key: "f".repeat(64) }),
  tx: async (hash) => (hash === "FUNDTX"
    ? { found: true, success: true, signer: `team.${CONTRACT}`, receiver: CONTRACT, methods: ["fund_escrow"], transfers: [] }
    : hash === "PAYTX"
      ? { found: true, success: true, signer: `researcher.${CONTRACT}`, receiver: CONTRACT, methods: ["claim_payout"], transfers: [{ to: "alice.testnet", amountNear: 0.3 }] }
      : { found: false }),
};

let server: Server;
let url: string;
beforeEach(async () => {
  const store = new ReportStore(null);
  [paid, published, priv].forEach((r) => store.save(structuredClone(r)));
  const app = createApp({
    config: { port: 0, dataFile: null, webDist: "/nonexistent", privyAppId: "app", ledgerMode: "testnet", escrowContractId: CONTRACT, enclavePublicKey: "enclave-pub", appOrigin: "https://redline.example" },
    store, chainReader: chain,
    verifyToken: async (t) => { if (!t.startsWith("user-")) throw new Error("bad"); return t; },
    mergeLookup: async () => ({ status: "merged", mergeCommit: "1".repeat(40) }),
  });
  await new Promise<void>((r) => { server = app.listen(0, r); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

const get = async (path: string, token?: string) => {
  const res = await fetch(url + path, { headers: token === undefined ? {} : { authorization: token } });
  const text = await res.text();
  return { status: res.status, text, json: text.startsWith("{") ? JSON.parse(text) : undefined };
};
const noLeaks = (text: string) => {
  for (const s of [SECRET_BODY, SECRET_CHAT, EMAIL, "TOKEN-SECRET", "ef".repeat(20), "cd".repeat(40)]) expect(text).not.toContain(s);
};

describe("agent API v1", () => {
  it("lists public disclosures with proof fields and no private data", async () => {
    const r = await get("/api/v1/disclosures");
    expect(r.status).toBe(200);
    expect(r.json.disclosures.map((d: any) => d.id).sort()).toEqual([paid.id, published.id].sort());
    const item = r.json.disclosures.find((d: any) => d.id === paid.id);
    expect(item).toMatchObject({ bountyNear: 0.3, pullRequestUrl: "https://github.com/acme/widgets/pull/7", fundTxHash: "FUNDTX", payoutTxHash: "PAYTX", status: "paid" });
    expect(item.links.payoutTx).toContain("/txns/PAYTX");
    noLeaks(r.text);
    expect((await get("/api/v1/disclosures?status=published")).json.disclosures.map((d: any) => d.id)).toEqual([published.id]);
  });

  it("shows the published body only when the researcher published it", async () => {
    const a = (await get(`/api/v1/disclosures/${published.id}`)).json;
    expect(a.body).toBe("public body text");
    expect(a.proof.evidenceHash).toBe("99".repeat(32));
    expect(a.proof.enclave).toMatchObject({ wasmSha256: "f".repeat(64), pinnedOnChain: true });
    const b = await get(`/api/v1/disclosures/${paid.id}`);
    expect(b.json.body).toBe("");
    expect(b.json.bodyPublished).toBe(false);
    noLeaks(b.text);
    expect((await get(`/api/v1/disclosures/${priv.id}`)).status).toBe(404);
    expect((await get("/api/v1/disclosures/nope")).status).toBe(400);
  });

  it("gives an anonymous caller only metadata for a private report", async () => {
    const r = await get(`/api/v1/reports/${priv.id}`);
    expect(r.status).toBe(200);
    expect(r.json.access).toBe("metadata_only");
    expect(r.json.report).toMatchObject({ contentHash: priv.contentHash, hasSealedKey: true, messageCount: 1 });
    expect(r.json.enclave.wasmSha256).toBe("f".repeat(64));
    expect(r.text).not.toContain(priv.title);
    expect(r.text).not.toContain(priv.summary);
    noLeaks(r.text);
  });

  it("answers wrong credentials with 401 or 403, and a party gets ciphertext without invites", async () => {
    expect((await get(`/api/v1/reports/${priv.id}`, "Bearer garbage")).json).toMatchObject({ code: "invalid_token" });
    expect((await get(`/api/v1/reports/${priv.id}`, "Bearer garbage")).status).toBe(401);
    const stranger = await get(`/api/v1/reports/${priv.id}`, "Bearer user-mallory");
    expect(stranger.status).toBe(403);
    expect(stranger.json.code).toBe("forbidden");
    const mine = await get(`/api/v1/reports/${priv.id}`, "Bearer user-alice");
    expect(mine.status).toBe(200);
    expect(mine.json.report.ciphertextHex).toBe(priv.ciphertextHex);
    expect(mine.text).not.toContain(EMAIL);
    expect(mine.text).not.toContain("TOKEN-SECRET");
    expect((await get("/api/v1/reports/rl-dddddddddddd")).status).toBe(404);
  });

  it("verifies chain, GitHub and transactions, and flags a mismatch", async () => {
    const ok = await get(`/api/v1/verify/${paid.id}`);
    expect(ok.status).toBe(200);
    expect(ok.json.verdict).toBe("verified");
    expect(ok.json.onChain).toMatchObject({ status: "Paid", agreedAmountNear: 0.3 });
    expect(ok.json.transactions.map((t: any) => [t.kind, t.verified])).toEqual([["escrow_funded", true], ["payout", true]]);
    expect(ok.json.github.status).toBe("merged");
    // The second report is not on chain here, so the contract check fails.
    expect((await get(`/api/v1/verify/${published.id}`)).json.verdict).toBe("mismatch");
    expect((await get(`/api/v1/verify/${priv.id}`)).status).toBe(404);
  });

  it("serves the index, discovery files, and rejects writes", async () => {
    expect((await get("/api/v1")).json.endpoints).toHaveLength(4);
    expect((await get("/.well-known/redline.json")).json.api).toBe("https://redline.example/api/v1");
    expect((await get("/llms.txt")).text).toContain("https://redline.example/api/v1/disclosures");
    const post = await fetch(`${url}/api/v1/disclosures`, { method: "POST" });
    expect(post.status).toBe(405);
    expect((await get("/api/v1/nothing")).json.code).toBe("unknown_route");
  });
});
