import { createCipheriv, createHash, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./server-main.js";
import { ReportStore } from "./report-store.js";
import type { MergeAnswer } from "./escrow-ledger.js";

const sha = (hex: string) => createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");

function seal(text: string) {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  const packed = Buffer.concat([iv, body, c.getAuthTag()]).toString("hex");
  return { ciphertextHex: packed, contentHash: sha(packed), keyHex: key.toString("hex") };
}

let server: Server;
let base: string;
let clockMs: number;
let answers: MergeAnswer[];
let enclaveCalls: Record<string, unknown>[];
let storeRef: ReportStore;

beforeEach(async () => {
  clockMs = Date.parse("2026-11-02T10:00:00Z");
  answers = [];
  enclaveCalls = [];
  storeRef = new ReportStore(null);
  const app = createApp({
    config: { port: 0, dataFile: null, webDist: "/nonexistent", privyAppId: "app", ledgerMode: "preview", escrowContractId: "", enclavePublicKey: "" },
    store: storeRef,
    enclave: { call: async (input) => { enclaveCalls.push(input); return { sealed_key: "sealed-answer" }; } },
    verifyToken: async (t) => { if (!t.startsWith("user-") && !t.startsWith("did:privy:")) throw new Error("bad"); return t; },
    mergeLookup: async () => answers.shift() ?? { status: "unknown" },
    accountExists: async (id) => id !== "ghost.testnet",
    now: () => new Date(clockMs),
  });
  await new Promise<void>((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

async function call(user: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(user ? { authorization: `Bearer ${user}`, "x-redline-name": user } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

const PROFILE = { handle: "alice", displayName: "Alice", avatarSeed: "abcdef12", payoutAccount: "alice.testnet" };

async function newReport(text = "## Bug\nsomething secret") {
  if (!(await call("user-alice", "GET", "/profile")).json.profile) await call("user-alice", "PUT", "/profile", PROFILE);
  const sealed = seal(text);
  const created = await call("user-alice", "POST", "/reports", {
    title: "Auth bypass in login", severity: "high", repo: "acme/widgets", disclosureDays: 30, summary: "s",
    ciphertextHex: sealed.ciphertextHex, contentHash: sealed.contentHash,
  });
  return { sealed, created };
}

async function joinTeam(id: string) {
  const invite = await call("user-alice", "POST", `/reports/${id}/invites`, { channel: "email", handle: "sec@acme.dev" });
  const token = invite.json.invites[0].token as string;
  return call("user-bob", "POST", `/invites/${token}/redeem`);
}

describe("auth and access", () => {
  it("rejects missing and bad tokens", async () => {
    expect((await call(null, "GET", "/reports")).status).toBe(401);
    expect((await call("nope", "GET", "/reports")).status).toBe(401);
  });

  it("hides reports from people who are not a party, with the same answer as missing ones", async () => {
    const { created } = await newReport();
    const other = await call("user-eve", "GET", `/reports/${created.json.id}`);
    const missing = await call("user-eve", "GET", "/reports/rl_000000000000");
    expect(other.status).toBe(404);
    expect(other.json).toEqual(missing.json);
  });
});

describe("sealed reports", () => {
  it("stores only ciphertext and checks the hash", async () => {
    const { created, sealed } = await newReport("top secret exploit details");
    expect(created.status).toBe(201);
    expect(JSON.stringify(created.json)).not.toContain("top secret");
    expect(created.json.stage).toBe("sealed");
    const bad = await call("user-alice", "POST", "/reports", {
      title: "Another report", severity: "low", disclosureDays: 30, ciphertextHex: sealed.ciphertextHex, contentHash: "0".repeat(64),
    });
    expect(bad.status).toBe(400);
  });

  it("validates input", async () => {
    const res = await call("user-alice", "POST", "/reports", { title: "x", severity: "nope" });
    expect(res.status).toBe(400);
  });

  it("lists reports for the people on them, without ciphertext", async () => {
    const { created } = await newReport();
    await joinTeam(created.json.id);
    const mine = await call("user-alice", "GET", "/reports");
    const theirs = await call("user-bob", "GET", "/reports");
    const nobody = await call("user-eve", "GET", "/reports");
    expect(mine.json.reports).toHaveLength(1);
    expect(theirs.json.reports[0].role).toBe("team");
    expect(theirs.json.reports[0].ciphertextHex).toBeUndefined();
    expect(nobody.json.reports).toHaveLength(0);
  });
});

describe("invites and chat", () => {
  it("keeps chat closed until the invite is redeemed, then stores ciphertext with a verified hash", async () => {
    const { created } = await newReport();
    const id = created.json.id as string;
    const msg = seal("hello team");
    expect((await call("user-alice", "POST", `/reports/${id}/messages`, { ciphertextHex: msg.ciphertextHex, hash: msg.contentHash })).status).toBe(409);
    const joined = await joinTeam(id);
    expect(joined.json.role).toBe("team");
    expect(joined.json.invites[0].token).toBeUndefined();
    const sent = await call("user-alice", "POST", `/reports/${id}/messages`, { ciphertextHex: msg.ciphertextHex, hash: msg.contentHash });
    expect(sent.status).toBe(201);
    expect(sent.json.messages[0].ciphertextHex).toBe(msg.ciphertextHex);
    const forged = await call("user-bob", "POST", `/reports/${id}/messages`, { ciphertextHex: msg.ciphertextHex, hash: "1".repeat(64) });
    expect(forged.status).toBe(400);
  });

  it("lets only one team account redeem, and never the researcher", async () => {
    const { created } = await newReport();
    const id = created.json.id as string;
    await joinTeam(id);
    const token = (await call("user-alice", "GET", `/reports/${id}`)).json.invites[0].token as string;
    expect((await call("user-eve", "POST", `/invites/${token}/redeem`)).status).toBe(409);
    expect((await call("user-alice", "POST", `/invites/${token}/redeem`)).status).toBe(400);
    expect((await call("user-bob", "POST", `/invites/${token}/redeem`)).status).toBe(200);
  });
});

describe("withdrawing access", () => {
  it("shuts a revoked member out of the report and chat, and the link stops working", async () => {
    const { created } = await newReport();
    const id = created.json.id as string;
    const invite = await call("user-alice", "POST", `/reports/${id}/invites`, { channel: "email", handle: "sec@acme.dev" });
    const { token, id: inviteId } = invite.json.invites[0];
    expect((await call("user-bob", "POST", `/invites/${token}/redeem`)).status).toBe(200);
    expect((await call("user-bob", "GET", `/reports/${id}`)).status).toBe(200);
    expect((await call("user-bob", "POST", `/reports/${id}/messages`, (() => { const m = seal("hi"); return { ciphertextHex: m.ciphertextHex, hash: m.contentHash }; })())).status).toBe(201);

    expect((await call("user-bob", "POST", `/reports/${id}/invites/${inviteId}/revoke`)).status).toBe(403);
    expect((await call("user-alice", "POST", `/reports/${id}/invites/${inviteId}/revoke`)).status).toBe(200);

    expect((await call("user-bob", "GET", `/reports/${id}`)).status).toBe(404);
    expect((await call("user-bob", "POST", `/reports/${id}/messages`, { ciphertextHex: "aa", hash: "bb" })).status).toBe(404);
    expect((await call("user-bob", "POST", `/invites/${token}/redeem`)).status).toBe(404);
    const after = await call("user-alice", "GET", `/reports/${id}`);
    expect(after.json.messages).toEqual([]);
    expect(after.json.invites[0].status).toBe("revoked");
  });

  it("does not let strangers or the team revoke, and keeps the team once money is in escrow", async () => {
    const { created } = await newReport();
    const id = created.json.id as string;
    const invite = await call("user-alice", "POST", `/reports/${id}/invites`, { channel: "email", handle: "sec@acme.dev" });
    const { token, id: inviteId } = invite.json.invites[0];
    expect((await call("user-eve", "POST", `/reports/${id}/invites/${inviteId}/revoke`)).status).toBe(404);
    await call("user-bob", "POST", `/invites/${token}/redeem`);
    await call("user-bob", "POST", `/reports/${id}/terms`, { amountNear: 5, repo: "acme/widgets" });
    await call("user-alice", "POST", `/reports/${id}/terms/accept`);
    await call("user-bob", "POST", `/reports/${id}/fund`);
    expect((await call("user-alice", "POST", `/reports/${id}/invites/${inviteId}/revoke`)).status).toBe(409);
  });
});

describe("escrow flow on the preview ledger", () => {
  async function agreed() {
    const { created, sealed } = await newReport();
    const id = created.json.id as string;
    await joinTeam(id);
    return { id, sealed };
  }

  it("enforces who may act at each step", async () => {
    const { id } = await agreed();
    expect((await call("user-alice", "POST", `/reports/${id}/terms`, { amountNear: 5, repo: "acme/widgets" })).status).toBe(403);
    expect((await call("user-bob", "POST", `/reports/${id}/terms`, { amountNear: 5, repo: "acme/widgets" })).status).toBe(200);
    expect((await call("user-bob", "POST", `/reports/${id}/terms/accept`)).status).toBe(403);
    expect((await call("user-alice", "POST", `/reports/${id}/fund`)).status).toBe(403);
    expect((await call("user-bob", "POST", `/reports/${id}/fund`)).status).toBe(409); // not accepted yet
    expect((await call("user-alice", "POST", `/reports/${id}/terms/accept`)).json.stage).toBe("agreed");
    expect((await call("user-bob", "POST", `/reports/${id}/fund`)).json.stage).toBe("funded");
  });

  it("pays only after two merged answers and rejects pull requests from other repos", async () => {
    const { id } = await agreed();
    await call("user-bob", "POST", `/reports/${id}/terms`, { amountNear: 5, repo: "acme/widgets" });
    await call("user-alice", "POST", `/reports/${id}/terms/accept`);
    await call("user-bob", "POST", `/reports/${id}/fund`);
    expect((await call("user-alice", "POST", `/reports/${id}/pull-request`, { url: "https://github.com/evil/other/pull/1" })).status).toBe(400);
    expect((await call("user-alice", "POST", `/reports/${id}/pull-request`, { url: "https://github.com/acme/widgets/pull/42" })).status).toBe(200);

    answers = [{ status: "unknown" }];
    expect((await call("user-bob", "POST", `/reports/${id}/check-merge`)).json.stage).toBe("funded");
    answers = [{ status: "merged", mergeCommit: "a".repeat(40) }];
    expect((await call("user-bob", "POST", `/reports/${id}/check-merge`)).json.stage).toBe("fix_merged");

    answers = [{ status: "unknown" }];
    const failed = await call("user-alice", "POST", `/reports/${id}/claim`);
    expect(failed.json.stage).toBe("funded"); // fail closed, state restarts
    answers = [{ status: "merged", mergeCommit: "a".repeat(40) }, { status: "merged", mergeCommit: "a".repeat(40) }];
    await call("user-bob", "POST", `/reports/${id}/check-merge`);
    expect((await call("user-bob", "POST", `/reports/${id}/claim`)).status).toBe(403);
    const paid = await call("user-alice", "POST", `/reports/${id}/claim`);
    expect(paid.json.stage).toBe("paid");
    expect(paid.json.timeline.at(-1).kind).toBe("payout");

    // Paid but never unsealed: public with summary and payout, body stays sealed.
    const pub = await call(null, "GET", `/public/disclosures/${id}`);
    expect(pub.status).toBe(200);
    expect(pub.json.outcome).toBe("fixed_and_paid");
    expect(pub.json.bodyPublished).toBe(false);
    expect(pub.json.body).toBe("");
    expect(JSON.stringify(pub.json)).not.toContain("ciphertext");
  });

  it("refunds only after expiry and only when the pull request is not merged", async () => {
    const { id } = await agreed();
    await call("user-bob", "POST", `/reports/${id}/terms`, { amountNear: 2, repo: "acme/widgets" });
    await call("user-alice", "POST", `/reports/${id}/terms/accept`);
    await call("user-bob", "POST", `/reports/${id}/fund`);
    await call("user-alice", "POST", `/reports/${id}/pull-request`, { url: "https://github.com/acme/widgets/pull/7" });
    expect((await call("user-bob", "POST", `/reports/${id}/refund`)).status).toBe(409);
    clockMs += 31 * 86_400_000;
    answers = [{ status: "merged", mergeCommit: "b".repeat(40) }];
    expect((await call("user-bob", "POST", `/reports/${id}/refund`)).json.stage).toBe("funded");
    answers = [{ status: "unknown" }];
    expect((await call("user-bob", "POST", `/reports/${id}/refund`)).json.stage).toBe("funded");
    answers = [{ status: "not_merged" }];
    expect((await call("user-bob", "POST", `/reports/${id}/refund`)).json.stage).toBe("refunded");
  });
});

describe("publishing", () => {
  it("waits for the deadline, checks the key, and then shows only public data", async () => {
    const { created, sealed } = await newReport("the full write-up");
    const id = created.json.id as string;
    await joinTeam(id);
    const m = seal("private chat line");
    await call("user-alice", "POST", `/reports/${id}/messages`, { ciphertextHex: m.ciphertextHex, hash: m.contentHash });

    expect((await call("user-alice", "POST", `/reports/${id}/publish`, { body: "the full write-up", keyHex: sealed.keyHex })).status).toBe(409);
    clockMs += 31 * 86_400_000;
    expect((await call("user-bob", "POST", `/reports/${id}/publish`, { body: "the full write-up", keyHex: sealed.keyHex })).status).toBe(403);
    expect((await call("user-alice", "POST", `/reports/${id}/publish`, { body: "something else", keyHex: sealed.keyHex })).status).toBe(400);
    expect((await call("user-alice", "POST", `/reports/${id}/publish`, { body: "the full write-up", keyHex: "11".repeat(32) })).status).toBe(400);
    const ok = await call("user-alice", "POST", `/reports/${id}/publish`, { body: "the full write-up", keyHex: sealed.keyHex });
    expect(ok.json.stage).toBe("published");

    const list = await call(null, "GET", "/public/disclosures");
    expect(list.json.disclosures).toHaveLength(1);
    const text = JSON.stringify(list.json);
    expect(text).toContain("the full write-up");
    expect(text).not.toContain(m.ciphertextHex);
    expect(text).not.toContain("sec@acme.dev");
    expect((await call(null, "GET", `/public/disclosures/${id}`)).status).toBe(200);
  });

  it("does not expose unpublished reports", async () => {
    const { created } = await newReport();
    expect((await call(null, "GET", `/public/disclosures/${created.json.id}`)).status).toBe(404);
  });
});

describe("avatar seeds", () => {
  it("are stable hashes of the account id, not the name, and differ per person", async () => {
    const { created } = await newReport();
    const id = created.json.id as string;
    const first = (await call("user-alice", "GET", `/reports/${id}`)).json;
    expect(first.researcherSeed).toMatch(/^[0-9a-f]{32}$/);
    expect(first.researcherSeed).not.toContain("alice");
    await joinTeam(id);
    const second = (await call("user-alice", "GET", `/reports/${id}`)).json;
    expect(second.researcherSeed).toBe(first.researcherSeed);
    expect(second.teamSeed).toMatch(/^[0-9a-f]{32}$/);
    expect(second.teamSeed).not.toBe(second.researcherSeed);
    expect((await call("user-bob", "GET", `/reports/${id}`)).json.teamSeed).toBe(second.teamSeed);
  });
});

describe("researcher profiles and privacy", () => {
  const profile = { handle: "ada", displayName: "Ada L", bio: "Finds bugs.", skills: ["rust", "wasm"], links: { github: "https://github.com/ada" }, avatarSeed: "abc123def456" };

  it("saves a profile, keeps handles unique, and rejects bad links", async () => {
    expect((await call(null, "GET", "/profile")).status).toBe(401);
    expect((await call("user-alice", "GET", "/profile")).json.profile).toBeNull();
    expect((await call("user-alice", "PUT", "/profile", profile)).status).toBe(200);
    expect((await call("user-alice", "GET", "/profile")).json.profile.handle).toBe("ada");
    expect((await call("user-bob", "PUT", "/profile", profile)).status).toBe(409);
    expect((await call("user-alice", "PUT", "/profile", { ...profile, displayName: "Ada Lovelace" })).json.profile.displayName).toBe("Ada Lovelace");
    expect((await call("user-alice", "PUT", "/profile", { ...profile, links: { github: "https://evil.example/ada" } })).status).toBe(400);
    expect((await call("user-alice", "PUT", "/profile", { ...profile, handle: "A!" })).status).toBe(400);
    const saved = (await call("user-alice", "GET", "/profile")).json.profile;
    expect(JSON.stringify(saved)).not.toContain("user-alice");
  });

  it("lists only public reports on the profile page and keeps the workspace private", async () => {
    await call("user-alice", "PUT", "/profile", profile);
    const { created, sealed } = await newReport("the full write-up");
    const id = created.json.id as string;
    // A sealed report is invisible publicly and to other signed-in users.
    expect((await call(null, "GET", "/public/researchers/ada")).json.reports).toHaveLength(0);
    expect((await call("user-bob", "GET", "/reports")).json.reports).toHaveLength(0);
    expect((await call("user-bob", "GET", `/reports/${id}`)).status).toBe(404);
    expect((await call(null, "GET", "/public/disclosures")).json.disclosures).toHaveLength(0);

    clockMs = Date.parse("2027-03-01T10:00:00Z");
    await call("user-alice", "POST", `/reports/${id}/publish`, { body: "the full write-up", keyHex: sealed.keyHex });
    const page = (await call(null, "GET", "/public/researchers/ada")).json;
    expect(page.reports).toHaveLength(1);
    expect(page.stats.disclosed).toBe(1);
    expect(page.reports[0].researcherHandle).toBe("ada");
    expect(page.profile.avatarSeed).toBe("abc123def456");
    expect((await call(null, "GET", "/public/researchers/nobody")).status).toBe(404);
  });
});


describe("payout account", () => {
  it("validates the account and keeps it out of the public profile", async () => {
    expect((await call("user-alice", "PUT", "/profile", { ...PROFILE, payoutAccount: "alice.near" })).status).toBe(400);
    expect((await call("user-alice", "PUT", "/profile", { ...PROFILE, payoutAccount: "ghost.testnet" })).status).toBe(400);
    const ok = await call("user-alice", "PUT", "/profile", PROFILE);
    expect(ok.json.profile.payoutAccount).toBe("alice.testnet");
    expect((await call(null, "GET", "/public/researchers/alice")).json.profile.payoutAccount).toBeUndefined();
  });

  it("binds the profile account at report creation and shows it to both parties", async () => {
    const { created } = await newReport();
    expect(created.json.payoutAccount).toBe("alice.testnet");
    await joinTeam(created.json.id);
    expect((await call("user-bob", "GET", `/reports/${created.json.id}`)).json.payoutAccount).toBe("alice.testnet");
  });

  it("blocks funding until the researcher sets one, then binds it when they accept", async () => {
    const sealed = seal("x");
    const created = await call("user-carol", "POST", "/reports", { title: "No wallet yet", severity: "low", repo: "acme/widgets", disclosureDays: 30, ciphertextHex: sealed.ciphertextHex, contentHash: sealed.contentHash });
    const id = created.json.id as string;
    expect(created.json.payoutAccount).toBeUndefined();
    const invite = await call("user-carol", "POST", `/reports/${id}/invites`, { channel: "email", handle: "sec@acme.dev" });
    await call("user-bob", "POST", `/invites/${invite.json.invites[0].token}/redeem`);
    await call("user-bob", "POST", `/reports/${id}/terms`, { amountNear: 2, repo: "acme/widgets" });
    await call("user-carol", "POST", `/reports/${id}/terms/accept`);
    const blocked = await call("user-bob", "POST", `/reports/${id}/fund`);
    expect(blocked.status).toBe(409);
    expect(blocked.json.error).toMatch(/payout NEAR account/);
    expect((await call("user-carol", "POST", `/reports/${id}/payout-account`)).status).toBe(409); // profile has none
    await call("user-carol", "PUT", "/profile", { ...PROFILE, handle: "carol", payoutAccount: "carol.testnet" });
    expect((await call("user-bob", "POST", `/reports/${id}/payout-account`)).status).toBe(403);
    expect((await call("user-carol", "POST", `/reports/${id}/payout-account`)).json.payoutAccount).toBe("carol.testnet");
    expect((await call("user-bob", "POST", `/reports/${id}/fund`)).json.stage).toBe("funded");
    await call("user-carol", "PUT", "/profile", { ...PROFILE, handle: "carol", payoutAccount: "other.testnet" });
    expect((await call("user-carol", "POST", `/reports/${id}/payout-account`)).status).toBe(409); // locked once funded
  });
});

describe("key custody by the enclave", () => {
  const SEALED = "04" + "ab".repeat(80);

  async function sealedReport() {
    if (!(await call("did:privy:alice", "GET", "/profile")).json.profile) await call("did:privy:alice", "PUT", "/profile", PROFILE);
    const sealed = seal("enclave body");
    const created = await call("did:privy:alice", "POST", "/reports", {
      title: "Held by the enclave", severity: "high", repo: "acme/widgets", disclosureDays: 30, summary: "s",
      ciphertextHex: sealed.ciphertextHex, contentHash: sealed.contentHash, sealedKeyHex: SEALED,
    });
    return { sealed, id: created.json.id as string };
  }
  async function joinPrivyTeam(id: string) {
    const invite = await call("did:privy:alice", "POST", `/reports/${id}/invites`, { channel: "email", handle: "sec@acme.dev" });
    return call("did:privy:bob", "POST", `/invites/${invite.json.invites[0].token}/redeem`);
  }

  it("relays the sealed request to the enclave for the owner and the redeemed invitee only", async () => {
    const { id } = await sealedReport();
    const blob = "cd".repeat(100);
    const ownerRead = await call("did:privy:alice", "POST", `/reports/${id}/enclave-key`, { blob });
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.json.sealedKey).toBe("sealed-answer");
    expect(enclaveCalls.at(-1)).toMatchObject({ action: "sealed", blob, sealed_key: SEALED });
    expect((await call("did:privy:bob", "POST", `/reports/${id}/enclave-key`, { blob })).status).toBe(404); // not a party yet
    await joinPrivyTeam(id);
    clockMs += 20_000;
    expect((await call("did:privy:bob", "POST", `/reports/${id}/enclave-key`, { blob })).status).toBe(200);
    expect((await call("did:privy:eve", "POST", `/reports/${id}/enclave-key`, { blob })).status).toBe(404);
  });

  it("stops serving a revoked invitee at once and rate limits repeated reads", async () => {
    const { id } = await sealedReport();
    const joined = await joinPrivyTeam(id);
    expect(joined.status).toBe(200);
    const blob = "cd".repeat(100);
    expect((await call("did:privy:bob", "POST", `/reports/${id}/enclave-key`, { blob })).status).toBe(200);
    expect((await call("did:privy:bob", "POST", `/reports/${id}/enclave-key`, { blob })).status).toBe(429);
    const inviteId = (await call("did:privy:alice", "GET", `/reports/${id}`)).json.invites[0].id;
    expect((await call("did:privy:alice", "POST", `/reports/${id}/invites/${inviteId}/revoke`)).status).toBe(200);
    clockMs += 20_000;
    expect((await call("did:privy:bob", "POST", `/reports/${id}/enclave-key`, { blob })).status).toBe(404);
  });

  it("refuses wallet logins and reports with no sealed key", async () => {
    const { created } = await newReport();
    const id = created.json.id as string;
    expect((await call("user-alice", "POST", `/reports/${id}/enclave-key`, { blob: "cd".repeat(100) })).status).toBe(409);
  });

  it("keeps no report key, wrap or device key in the stored report", async () => {
    const { sealed, id } = await sealedReport();
    await joinPrivyTeam(id);
    const dump = JSON.stringify(storeRef.get(id));
    expect(dump).not.toContain(sealed.keyHex);
    for (const field of ["escrowedKeyHex", "keyWraps", "deviceKeys"]) expect(dump).not.toContain(field);
    expect((await call("did:privy:alice", "GET", `/reports/${id}/key`)).status).toBe(404);
    expect((await call("did:privy:alice", "POST", `/reports/${id}/key-wraps`, {})).status).toBe(404);
  });

  it("lets only the owner re-seal the key", async () => {
    const { id } = await sealedReport();
    await joinPrivyTeam(id);
    expect((await call("did:privy:bob", "POST", `/reports/${id}/sealed-key`, { sealedKeyHex: SEALED })).status).toBe(403);
    expect((await call("did:privy:alice", "POST", `/reports/${id}/sealed-key`, { sealedKeyHex: "04" + "ef".repeat(80) })).status).toBe(200);
    expect(storeRef.get(id)?.sealedKeyHex).toBe("04" + "ef".repeat(80));
  });
});

describe("editing a report", () => {
  it("lets the owner replace the body, title and severity and logs 'Report edited'", async () => {
    const { created } = await newReport();
    const id = created.json.id as string;
    const next = seal("## Better body\n```js\nconst a = 1;\n```");
    const res = await call("user-alice", "POST", `/reports/${id}/edit`, {
      title: "Sharper title", summary: "New summary", severity: "critical", ciphertextHex: next.ciphertextHex, contentHash: next.contentHash,
    });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ title: "Sharper title", severity: "critical", contentHash: next.contentHash });
    expect(res.json.timeline.some((t: any) => t.title === "Report edited")).toBe(true);
    expect((await call("user-alice", "GET", `/reports/${id}`)).json.ciphertextHex).toBe(next.ciphertextHex);
  });

  it("refuses a wrong hash, a non-owner, and an edit once the report is paid or disclosed", async () => {
    const { created } = await newReport();
    const id = created.json.id as string;
    const next = seal("x".repeat(40));
    expect((await call("user-alice", "POST", `/reports/${id}/edit`, { ciphertextHex: next.ciphertextHex, contentHash: "00".repeat(32) })).status).toBe(400);
    await joinTeam(id);
    expect((await call("user-bob", "POST", `/reports/${id}/edit`, { ciphertextHex: next.ciphertextHex, contentHash: next.contentHash })).status).toBe(403);
    expect((await call("user-eve", "POST", `/reports/${id}/edit`, { ciphertextHex: next.ciphertextHex, contentHash: next.contentHash })).status).toBe(404);
    const record = storeRef.get(id)!;
    record.status = "paid";
    storeRef.save(record);
    expect((await call("user-alice", "POST", `/reports/${id}/edit`, { ciphertextHex: next.ciphertextHex, contentHash: next.contentHash })).status).toBe(409);
    record.status = "registered";
    record.published = { at: "2026-11-02T00:00:00Z", body: "x", evidenceHash: "y" };
    storeRef.save(record);
    expect((await call("user-alice", "POST", `/reports/${id}/edit`, { ciphertextHex: next.ciphertextHex, contentHash: next.contentHash })).status).toBe(409);
  });
});
