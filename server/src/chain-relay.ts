/**
 * Testnet relay. In live mode every ledger step is also a call on the escrow contract. The two
 * demo parties (researcher and team) are sub-accounts of the Redline account, and the relay signs
 * for them. Testnet only: their keys come from the environment and never leave the server.
 */
import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";

export type PartyRole = "researcher" | "team";

export interface ChainCallResult {
  txHash: string;
  logs: string[];
}

export interface ContractReport {
  status: string;
  escrow?: { pull_request?: number | null; merge_confirmed_at_ns?: number | null } | null;
}

export interface ChainRelay {
  readonly contractId: string;
  readonly teamAccountId: string;
  call(role: PartyRole, method: string, args: Record<string, unknown>, depositYocto?: bigint, gasTgas?: number): Promise<ChainCallResult>;
  getReport(reportId: string): Promise<ContractReport | null>;
  /** Poll until `done` accepts the contract's record, or give up after `timeoutMs`. */
  waitForReport(reportId: string, done: (r: ContractReport) => boolean, timeoutMs?: number): Promise<ContractReport | null>;
}

export class ChainError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export interface RelayOptions {
  contractId: string;
  rpcUrl?: string;
  accounts: Record<PartyRole, { accountId: string; secretKey: string }>;
}

const TGAS = 1_000_000_000_000n;

function failureText(outcome: unknown): string | undefined {
  const status = (outcome as { status?: Record<string, unknown> })?.status;
  if (!status || !("Failure" in status)) return undefined;
  const text = JSON.stringify(status.Failure);
  const panic = /Smart contract panicked: ([^"\\]+)/.exec(text);
  return panic ? panic[1]!.trim() : "the contract rejected the call";
}

/** JSON for contract arguments. A bigint becomes a bare number, which u64 and u128-as-number fields need. */
export function contractArgs(args: Record<string, unknown>): Uint8Array {
  const text = JSON.stringify(args, (_k, v) => (typeof v === "bigint" ? `__BIG__${v}` : v)).replace(/"__BIG__(\d+)"/g, "$1");
  return new TextEncoder().encode(text);
}

export function createChainRelay(options: RelayOptions): ChainRelay {
  const provider = new JsonRpcProvider({ url: options.rpcUrl ?? "https://rpc.testnet.near.org" });
  const accounts = Object.fromEntries(
    (Object.keys(options.accounts) as PartyRole[]).map((role) => {
      const { accountId, secretKey } = options.accounts[role];
      return [role, new Account(accountId, provider, KeyPairSigner.fromSecretKey(secretKey as `ed25519:${string}`))];
    }),
  ) as Record<PartyRole, Account>;

  return {
    contractId: options.contractId,
    teamAccountId: options.accounts.team.accountId,
    async call(role, method, args, depositYocto = 0n, gasTgas = 100) {
      let result;
      try {
        result = await accounts[role].callFunctionRaw({
          contractId: options.contractId, methodName: method, args: contractArgs(args), deposit: depositYocto, gas: BigInt(gasTgas) * TGAS, waitUntil: "FINAL",
        });
      } catch (err) {
        throw new ChainError(`NEAR testnet did not accept the ${method} call: ${err instanceof Error ? err.message.slice(0, 160) : "unknown error"}`);
      }
      const failed = failureText(result.transaction_outcome) ?? failureText(result.status ? { status: result.status } : undefined)
        ?? (result.receipts_outcome ?? []).map((r) => failureText(r.outcome)).find(Boolean);
      if (failed) throw new ChainError(`The contract refused ${method}: ${failed}`, 409);
      const logs = (result.receipts_outcome ?? []).flatMap((r) => r.outcome.logs ?? []);
      return { txHash: result.transaction.hash, logs };
    },
    async getReport(reportId) {
      const view = await provider.callFunction<ContractReport>({ contractId: options.contractId, method: "get_report", args: { report_id: reportId } });
      return (view as ContractReport | undefined) ?? null;
    },
    async waitForReport(reportId, done, timeoutMs = 90_000) {
      const deadline = Date.now() + timeoutMs;
      let last: ContractReport | null = null;
      while (Date.now() < deadline) {
        last = await this.getReport(reportId).catch(() => last);
        if (last && done(last)) return last;
        await new Promise((r) => setTimeout(r, 2500));
      }
      return last;
    },
  };
}

/** Builds the relay from the environment, or returns undefined when its keys are not set. */
export function relayFromEnv(env: NodeJS.ProcessEnv, contractId: string): ChainRelay | undefined {
  const researcherKey = env.RELAY_RESEARCHER_KEY;
  const teamKey = env.RELAY_TEAM_KEY;
  if (!contractId || !researcherKey || !teamKey) return undefined;
  return createChainRelay({
    contractId,
    rpcUrl: env.NEAR_RPC_URL || undefined,
    accounts: {
      researcher: { accountId: env.RELAY_RESEARCHER_ACCOUNT ?? `researcher.${contractId}`, secretKey: researcherKey },
      team: { accountId: env.RELAY_TEAM_ACCOUNT ?? `team.${contractId}`, secretKey: teamKey },
    },
  });
}
