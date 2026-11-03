/**
 * Read-only NEAR testnet lookups for the public verify endpoint. No keys, no signing: plain JSON-RPC views.
 */
import { DEFAULT_TESTNET_RPC } from "./near-account.js";

export interface ChainTransfer { to: string; amountNear: number }
export interface TxFacts {
  found: boolean;
  success?: boolean;
  signer?: string;
  receiver?: string;
  methods?: string[];
  transfers?: ChainTransfer[];
}

export interface ChainReader {
  /** The raw escrow record for a report id, or null when the contract has none. */
  report(contractId: string, reportId: string): Promise<Record<string, any> | null>;
  config(contractId: string): Promise<Record<string, any>>;
  /** Facts about one transaction, looked up by hash and any of the candidate signer accounts. */
  tx(txHash: string, signers: string[]): Promise<TxFacts>;
}

const YOCTO = 10n ** 24n;
const near = (yocto: string | bigint) => Number((BigInt(yocto) * 1_000_000n) / YOCTO) / 1_000_000;

export function createChainReader(rpcUrl: string = DEFAULT_TESTNET_RPC, fetchImpl: typeof fetch = fetch): ChainReader {
  const rpc = async (method: string, params: unknown) => {
    const res = await fetchImpl(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    if (!res.ok) throw new Error(`NEAR RPC answered ${res.status}`);
    return (await res.json()) as { result?: any; error?: any };
  };
  const view = async (contractId: string, methodName: string, args: Record<string, unknown>) => {
    const body = await rpc("query", { request_type: "call_function", finality: "final", account_id: contractId, method_name: methodName, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") });
    if (body.error || !body.result || body.result.error) throw new Error("NEAR RPC could not run the view call");
    return JSON.parse(Buffer.from(body.result.result as number[]).toString("utf8")) as unknown;
  };
  return {
    async report(contractId, reportId) {
      return ((await view(contractId, "get_report", { report_id: reportId })) as Record<string, any> | null) ?? null;
    },
    async config(contractId) {
      return (await view(contractId, "get_config", {})) as Record<string, any>;
    },
    async tx(txHash, signers) {
      for (const signer of signers) {
        const body = await rpc("tx", { tx_hash: txHash, sender_account_id: signer, wait_until: "FINAL" });
        const r = body.result;
        if (!r?.transaction) continue;
        const actions = (r.transaction.actions ?? []) as Array<Record<string, any>>;
        const transfers: ChainTransfer[] = [];
        for (const rc of (r.receipts ?? []) as Array<Record<string, any>>) {
          for (const a of (rc.receipt?.Action?.actions ?? []) as Array<Record<string, any>>) {
            if (a.Transfer && rc.receiver_id) transfers.push({ to: String(rc.receiver_id), amountNear: near(String(a.Transfer.deposit)) });
          }
        }
        return {
          found: true,
          success: !!r.status && ("SuccessValue" in r.status || "SuccessReceiptId" in r.status),
          signer: r.transaction.signer_id,
          receiver: r.transaction.receiver_id,
          methods: actions.filter((a) => a.FunctionCall).map((a) => String(a.FunctionCall.method_name)),
          transfers,
        };
      }
      return { found: false };
    },
  };
}
