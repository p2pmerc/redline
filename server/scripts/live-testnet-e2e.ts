/**
 * Drives the API in live mode against the deployed testnet contract and enclave, with throwaway
 * test identities. Needs RELAY_RESEARCHER_KEY and RELAY_TEAM_KEY in the environment.
 *   ESCROW_CONTRACT_ID=redline-escrow.testnet RELAY_... npx tsx scripts/live-testnet-e2e.ts [owner/repo] [pr]
 */
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/server-main.js";
import { relayFromEnv } from "../src/chain-relay.js";
import { createMergeLookup } from "../src/github-merge-lookup.js";
import { ReportStore } from "../src/report-store.js";

const contractId = process.env.ESCROW_CONTRACT_ID ?? "redline-escrow.testnet";
const repo = process.argv[2] ?? "octocat/Hello-World";
const pr = Number(process.argv[3] ?? 6);
const relay = relayFromEnv(process.env, contractId);
if (!relay) throw new Error("relay keys are not set");

const app = createApp({
  config: { port: 0, dataFile: null, webDist: "/nonexistent", privyAppId: "test", ledgerMode: "testnet", escrowContractId: contractId, enclavePublicKey: "" },
  store: new ReportStore(null),
  verifyToken: async (t) => t,
  mergeLookup: createMergeLookup(),
  relay,
});
const server = await new Promise<ReturnType<typeof app.listen>>((r) => { const s = app.listen(0, () => r(s)); });
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

async function call(user: string, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method, headers: { "content-type": "application/json", authorization: `Bearer ${user}`, "x-redline-name": user },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as any;
  if (res.status >= 300) throw new Error(`${method} ${path} -> ${res.status} ${json.error}`);
  return json;
}
const step = (name: string, detail = "") => console.log(`ok  ${name}${detail ? "  " + detail : ""}`);

try {
  const key = randomBytes(32); const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const packed = Buffer.concat([iv, c.update("## Demo finding\nsealed", "utf8"), c.final()]);
  const ciphertextHex = Buffer.concat([packed, c.getAuthTag()]).toString("hex");
  const contentHash = createHash("sha256").update(Buffer.from(ciphertextHex, "hex")).digest("hex");

  const created = await call("researcher-test", "POST", "/reports", { title: "Live testnet end to end", severity: "high", repo, disclosureDays: 7, summary: "e2e", ciphertextHex, contentHash });
  const id = created.id as string;
  step("seal + register", `${id} tx ${created.timeline.at(-1).txHash}`);
  const invite = await call("researcher-test", "POST", `/reports/${id}/invites`, { channel: "github", handle: "team-test" });
  await call("team-test", "POST", `/invites/${invite.invites[0].token}/redeem`);
  step("invite + redeem");
  const msgCipher = randomBytes(40).toString("hex");
  await call("team-test", "POST", `/reports/${id}/messages`, { ciphertextHex: msgCipher, hash: createHash("sha256").update(Buffer.from(msgCipher, "hex")).digest("hex") });
  step("sealed chat message");
  let v = await call("team-test", "POST", `/reports/${id}/terms`, { amountNear: 0.05, repo });
  step("propose terms", v.timeline.at(-1).txHash);
  v = await call("researcher-test", "POST", `/reports/${id}/terms/accept`);
  step("accept terms", v.timeline.at(-1).txHash);
  v = await call("team-test", "POST", `/reports/${id}/fund`);
  step("fund 0.05 NEAR", v.timeline.at(-1).txHash);
  v = await call("researcher-test", "POST", `/reports/${id}/pull-request`, { url: `https://github.com/${repo}/pull/${pr}` });
  step("link PR", v.timeline.at(-1).txHash);
  v = await call("team-test", "POST", `/reports/${id}/check-merge`);
  step("check merge (enclave)", `${v.stage} ${v.timeline.at(-1).txHash}`);
  v = await call("researcher-test", "POST", `/reports/${id}/claim`);
  step("payout", `${v.stage} ${v.timeline.at(-1).txHash}`);
} catch (err) {
  console.error("FAILED", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  server.close();
}
