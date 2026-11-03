import path from "node:path";

export interface ServerConfig {
  port: number;
  dataFile: string | null;
  webDist: string;
  privyAppId: string;
  /** "preview" runs the escrow state machine on the server. "testnet" also mirrors each step on the deployed contract. */
  ledgerMode: "preview" | "testnet";
  escrowContractId: string;
  enclavePublicKey: string;
  githubToken?: string;
  allowedOrigin?: string;
  /** AgentMail API key — Railway only. Never log or return it. */
  agentMailApiKey?: string;
  /** Dedicated Redline sender inbox id (email address). */
  agentMailInboxId?: string;
  /** Public app origin used in invite emails and absolute links. */
  appOrigin: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = env.DATA_DIR ?? path.resolve(process.cwd(), ".data");
  return {
    port: Number(env.PORT ?? 8791),
    dataFile: path.join(dataDir, "redline-store.json"),
    webDist: env.WEB_DIST ?? path.resolve(process.cwd(), "../web/dist"),
    privyAppId: env.PRIVY_APP_ID ?? "cmw091k5e006v0glbrx3ouzry",
    ledgerMode: env.LEDGER_MODE === "testnet" ? "testnet" : "preview",
    escrowContractId: env.ESCROW_CONTRACT_ID ?? "",
    enclavePublicKey: env.ENCLAVE_PUBLIC_KEY ?? "",
    githubToken: env.GITHUB_TOKEN || undefined,
    allowedOrigin: env.ALLOWED_ORIGIN || undefined,
    agentMailApiKey: env.AGENTMAIL_API_KEY || undefined,
    agentMailInboxId: env.AGENTMAIL_INBOX_ID || undefined,
    appOrigin: (env.APP_ORIGIN || env.ALLOWED_ORIGIN || "https://redline-app-production-b0e6.up.railway.app").replace(/\/$/, ""),
  };
}
