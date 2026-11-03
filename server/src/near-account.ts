/** NEAR testnet account ids: validation and an on-chain existence check. */

const ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/** A named `*.testnet` account (2 to 64 chars) or a 64-hex implicit account. */
export function isTestnetAccountId(value: string): boolean {
  if (/^[0-9a-f]{64}$/.test(value)) return true;
  return value.length >= 8 && value.length <= 64 && ACCOUNT.test(value) && value.endsWith(".testnet");
}

export type AccountChecker = (accountId: string) => Promise<boolean>;

/** Asks the testnet RPC whether the account exists. Network errors throw, they never read as "missing". */
export function createAccountChecker(rpcUrl = "https://rpc.testnet.near.org", fetchImpl: typeof fetch = fetch): AccountChecker {
  return async (accountId) => {
    const res = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_account", finality: "final", account_id: accountId } }),
    });
    if (!res.ok) throw new Error(`NEAR RPC answered ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: { cause?: { name?: string } } };
    if (body.result) return true;
    if (body.error?.cause?.name === "UNKNOWN_ACCOUNT") return false;
    throw new Error("NEAR RPC could not look up the account");
  };
}
