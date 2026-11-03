import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createApiRouter } from "./api-routes.js";
import { createMergeLookup } from "./github-merge-lookup.js";
import { createPrivyVerifier } from "./privy-token-verifier.js";
import { ReportStore } from "./report-store.js";
import { relayFromEnv } from "./chain-relay.js";
import { loadConfig, type ServerConfig } from "./server-config.js";
import type { ApiDeps } from "./api-routes.js";

export function createApp(deps: ApiDeps): express.Express {
  const { config } = deps;
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
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
  const app = createApp({ config, store, verifyToken: createPrivyVerifier(config.privyAppId), mergeLookup: createMergeLookup(undefined, config.githubToken), relay: config.ledgerMode === "testnet" ? relayFromEnv(process.env, config.escrowContractId) : undefined });
  return app.listen(config.port, () => console.log(`redline server on :${config.port} (${config.ledgerMode} ledger)`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) startServer();
