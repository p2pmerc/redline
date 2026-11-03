import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createApiRouter } from "./api-routes.js";
import { createKeyEscrow } from "./key-escrow.js";
import { createMergeLookup } from "./github-merge-lookup.js";
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
  app.use("/api", createApiRouter(deps));

  if (existsSync(path.join(config.webDist, "index.html"))) {
    app.use(express.static(config.webDist, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(config.webDist, "index.html")));
  }
  return app;
}

export function startServer(config: ServerConfig = loadConfig()) {
  const store = new ReportStore(config.dataFile);
  const profiles = new ProfileStore(config.dataFile ? path.join(path.dirname(config.dataFile), "profiles.json") : null);
  const mergeLookup = createMergeLookup(undefined, config.githubToken);
  const relay = config.ledgerMode === "testnet" ? relayFromEnv(process.env, config.escrowContractId) : undefined;
  const walletAuth = createWalletAuth({ secret: process.env.SESSION_SECRET, keyBelongs: createKeyChecker(process.env.NEAR_RPC_URL || undefined) });
  const keyEscrow = createKeyEscrow(process.env.KEY_ESCROW_SECRET || process.env.SESSION_SECRET || randomBytes(32).toString("hex"));
  const app = createApp({ config, store, profiles, walletAuth, keyEscrow, verifyToken: combineVerifiers(walletAuth, createPrivyVerifier(config.privyAppId)), mergeLookup, relay, accountExists: createAccountChecker(process.env.NEAR_RPC_URL || undefined) });
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
