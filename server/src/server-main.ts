import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createApiRouter } from "./api-routes.js";
import { createAgentRouter, createDiscoveryRouter } from "./agent-api.js";
import { createChainReader } from "./chain-reader.js";
import { enclaveFromEnv } from "./enclave-client.js";
import { createMergeLookup, createPrAuthorLookup } from "./github-merge-lookup.js";
import { createPrivyVerifier } from "./privy-token-verifier.js";
import { ReportStore } from "./report-store.js";
import { ProfileStore } from "./profile-store.js";
import { relayFromEnv } from "./chain-relay.js";
import { combineVerifiers, createKeyChecker, createWalletAuth } from "./wallet-auth.js";
import { createAccountChecker } from "./near-account.js";
import { createPayoutAutomation } from "./payout-automation.js";
import { loadConfig, type ServerConfig } from "./server-config.js";
import { githubLoginFromLink, type ApiDeps } from "./api-routes.js";

export function createApp(deps: ApiDeps): express.Express {
  const { config } = deps;
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" } }));
  app.use("/api", rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests. Slow down for a minute." } }));
  app.use("/api", express.json({ limit: "3mb" }));
  app.use("/api/v1", createAgentRouter(deps));
  app.use("/api", createApiRouter(deps));
  app.use(createDiscoveryRouter(deps));

  if (existsSync(path.join(config.webDist, "index.html"))) {
    // Hashed build assets never change, so cache them forever; a miss is a real 404, never index.html.
    app.use("/assets", express.static(path.join(config.webDist, "assets"), { index: false, immutable: true, maxAge: "1y", fallthrough: false }));
    app.use(express.static(config.webDist, { index: false, maxAge: "1h", setHeaders: (res, file) => { if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache"); } }));
    // index.html must always revalidate so open tabs pick up the newest entry chunk after a deploy.
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(config.webDist, "index.html"));
    });
  }
  return app;
}

export function startServer(config: ServerConfig = loadConfig()) {
  const store = new ReportStore(config.dataFile);
  const profiles = new ProfileStore(config.dataFile ? path.join(path.dirname(config.dataFile), "profiles.json") : null);
  const mergeLookup = createMergeLookup(undefined, config.githubToken);
  const relay = config.ledgerMode === "testnet" ? relayFromEnv(process.env, config.escrowContractId) : undefined;
  const walletAuth = createWalletAuth({ secret: process.env.SESSION_SECRET, keyBelongs: createKeyChecker(process.env.NEAR_RPC_URL || undefined) });
  const enclave = config.ledgerMode === "testnet" ? enclaveFromEnv({ ...process.env, ESCROW_CONTRACT_ID: config.escrowContractId }) : undefined;
  // Report keys are held by the enclave only. Drop any server-side key copies from earlier builds.
  let scrubbed = 0;
  for (const r of store.all()) {
    const legacy = r as unknown as Record<string, unknown>;
    if (legacy.escrowedKeyHex !== undefined || legacy.keyWraps !== undefined || legacy.deviceKeys !== undefined) {
      delete legacy.escrowedKeyHex; delete legacy.keyWraps; delete legacy.deviceKeys;
      store.save(r);
      scrubbed += 1;
    }
  }
  if (scrubbed) console.log(`removed server-side key copies from ${scrubbed} reports`);
  // One-shot: drop the six tabtester seed copies so they never appear beside the real @p2pmerch reports.
  const tabtesterFlag = config.dataFile ? path.join(path.dirname(config.dataFile), ".purged-tabtester-v1") : null;
  const TABTESTER_IDS = [
    "rl-c0721702dbf8", "rl-80de675eeb56", "rl-127be007d08f",
    "rl-3d5ea8ddebcb", "rl-876a7a7563c3", "rl-d63157c7bc69",
  ];
  if (tabtesterFlag && !existsSync(tabtesterFlag)) {
    let removed = 0;
    for (const id of TABTESTER_IDS) if (store.delete(id)) removed += 1;
    writeFileSync(tabtesterFlag, new Date().toISOString());
    console.log(`purged ${removed} tabtester seed reports`);
  }
  const prAuthorLookup = createPrAuthorLookup(undefined, config.githubToken);
  const app = createApp({ config, store, profiles, walletAuth, enclave, verifyToken: combineVerifiers(walletAuth, createPrivyVerifier(config.privyAppId)), mergeLookup, prAuthorLookup, relay, accountExists: createAccountChecker(process.env.NEAR_RPC_URL || undefined), chainReader: config.ledgerMode === "testnet" ? createChainReader(process.env.NEAR_RPC_URL || undefined) : undefined });
  const githubLoginOf = (userId: string): string | undefined => githubLoginFromLink(profiles.get(userId)?.links.github);
  if (config.ledgerMode === "testnet" && relay && process.env.PAYOUT_AUTOMATION !== "off") {
    const pollMs = Number(process.env.PAYOUT_POLL_MS) || (config.githubToken ? 65_000 : 300_000);
    createPayoutAutomation({
      store, pollMs, log: (m) => console.log(`payout-automation ${m}`),
      ctx: { live: true, relay, mergeLookup, now: () => new Date(), githubLoginOf },
    }).start();
  }
  return app.listen(config.port, () => console.log(`redline server on :${config.port} (${config.ledgerMode} ledger)`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) startServer();
