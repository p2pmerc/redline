/**
 * Calls the Redline enclave through OutLayer (outlayer.testnet.request_execution, NEAR yield/resume).
 * The server only relays: inputs that matter are ECIES-sealed to the enclave key by the browser and
 * answers are sealed to a one-time browser key, so this module never sees a report key or a sign-in token.
 */
import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";

export interface EnclaveClient {
  /** Runs one enclave action and returns its `result`, or throws with the enclave's error text. */
  call(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class EnclaveError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export interface EnclaveClientOptions {
  accountId: string;
  secretKey: string;
  projectId: string;
  /** wasm sha256 of one version, or null for the active version. */
  versionKey?: string | null;
  rpcUrl?: string;
  outlayer?: string;
  /** Unused part is refunded by OutLayer. */
  depositYocto?: bigint;
}

const TGAS = 1_000_000_000_000n;

export function createEnclaveClient(o: EnclaveClientOptions): EnclaveClient {
  const provider = new JsonRpcProvider({ url: o.rpcUrl ?? "https://rpc.testnet.near.org" });
  const account = new Account(o.accountId, provider, KeyPairSigner.fromSecretKey(o.secretKey as `ed25519:${string}`));
  const owner = o.projectId.split("/")[0]!;
  return {
    async call(input) {
      let outcome;
      try {
        outcome = await account.callFunctionRaw({
          contractId: o.outlayer ?? "outlayer.testnet",
          methodName: "request_execution",
          args: new TextEncoder().encode(JSON.stringify({
            source: { Project: { project_id: o.projectId, version_key: o.versionKey ?? null } },
            resource_limits: { max_instructions: 20_000_000_000, max_memory_mb: 128, max_execution_seconds: 60 },
            input_data: JSON.stringify(input),
            secrets_ref: { profile: "default", account_id: owner },
            response_format: "Json",
            payer_account_id: null,
          })),
          deposit: o.depositYocto ?? 20_000_000_000_000_000_000_000n,
          gas: 300n * TGAS,
          waitUntil: "FINAL",
        });
      } catch (err) {
        throw new EnclaveError(`The enclave could not be reached: ${err instanceof Error ? err.message.slice(0, 140) : "unknown error"}`);
      }
      const status = outcome.status as { SuccessValue?: string; Failure?: unknown } | undefined;
      if (!status || status.SuccessValue === undefined || status.SuccessValue === "") throw new EnclaveError("The enclave did not answer.");
      let answer: { success?: boolean; result?: Record<string, unknown>; error?: string };
      try {
        answer = JSON.parse(Buffer.from(status.SuccessValue, "base64").toString("utf8"));
      } catch {
        throw new EnclaveError("The enclave answer was not understood.");
      }
      if (!answer.success) throw new EnclaveError(answer.error ?? "The enclave refused.", 403);
      return answer.result ?? {};
    },
  };
}

/** Builds the client from the environment (the relay's team account pays), or undefined when not configured. */
export function enclaveFromEnv(env: NodeJS.ProcessEnv): EnclaveClient | undefined {
  const key = env.RELAY_TEAM_KEY;
  const projectId = env.ENCLAVE_PROJECT_ID ?? "redline-escrow.testnet/redline-enclave";
  const contract = env.ESCROW_CONTRACT_ID;
  if (!key || !contract) return undefined;
  return createEnclaveClient({
    accountId: env.RELAY_TEAM_ACCOUNT ?? `team.${contract}`,
    secretKey: key,
    projectId,
    versionKey: env.ENCLAVE_VERSION_KEY || null,
    rpcUrl: env.NEAR_RPC_URL || undefined,
  });
}
