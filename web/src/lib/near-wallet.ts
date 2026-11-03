// External NEAR wallets through HOT Labs' NEAR Connect. The wallet code runs in a sandboxed iframe and shows its own
// picker. The wallet signs one short NEP-413 message; the server checks it and answers with a 24 hour session token.
import { NearConnector } from "@hot-labs/near-connect";
import { redlineConfig } from "./redline-config";

export const WALLET_RECIPIENT = "redline.app";
const STORAGE = "redline-near-wallet";

export interface WalletSession { account: string; walletId: string; token: string; expiresAt: number }

const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const base58 = (bytes: Uint8Array) => {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = "";
  while (n > 0n) { s = ALPHA[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b) break; s = "1" + s; }
  return s;
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

export function readWalletSession(storage: Pick<Storage, "getItem" | "removeItem"> = localStorage, now = Date.now()): WalletSession | null {
  try {
    const s = JSON.parse(storage.getItem(STORAGE) ?? "null") as WalletSession | null;
    if (s && s.token && s.expiresAt > now) return s;
    if (s) storage.removeItem(STORAGE);
  } catch { /* corrupt entry */ }
  return null;
}
const saveWalletSession = (s: WalletSession | null) => { if (s) localStorage.setItem(STORAGE, JSON.stringify(s)); else localStorage.removeItem(STORAGE); };

let connector: NearConnector | null = null;
const listeners = new Set<() => void>();
export const onWalletChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const notify = () => listeners.forEach((f) => f());

function getConnector(): NearConnector {
  if (!connector) {
    connector = new NearConnector({ network: "testnet", features: { signMessage: true } });
    // Signing out inside the wallet drops our session too.
    connector.on("wallet:signOut", () => { if (readWalletSession()) { saveWalletSession(null); notify(); } });
  }
  return connector;
}

/** Opens the wallet picker, asks the chosen wallet to sign in, and stores the session. */
export async function connectHotWallet(): Promise<WalletSession> {
  const wallet = await getConnector().connect();
  const accounts = await wallet.getAccounts();
  const account = accounts[0]?.accountId;
  if (!account) throw new Error("The wallet did not share an account.");
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const message = JSON.stringify({ redline_login: account, ts: Date.now() });
  const r = await wallet.signMessage!({ message, recipient: WALLET_RECIPIENT, nonce });
  if (!r?.signature) throw new Error("The wallet did not return a signature.");
  if (r.accountId && r.accountId !== account) throw new Error("The wallet signed with a different account.");
  const raw = /^[A-Za-z0-9+/=]+$/.test(r.signature) && r.signature.length % 4 === 0 ? base58(fromB64(r.signature)) : r.signature.replace(/^ed25519:/, "");
  const signed = {
    standard: "nep413",
    payload: { message, nonce: toB64(nonce), recipient: WALLET_RECIPIENT },
    public_key: r.publicKey.startsWith("ed25519:") ? r.publicKey : `ed25519:${r.publicKey}`,
    signature: `ed25519:${raw}`,
  };
  const res = await fetch(`${redlineConfig.apiBase}/auth/wallet`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signed }) });
  const body = (await res.json().catch(() => null)) as { token?: string; account?: string; expiresAt?: string; error?: string } | null;
  if (!res.ok || !body?.token) throw new Error(body?.error ?? "Wallet sign-in failed.");
  const session: WalletSession = { account: body.account ?? account, walletId: wallet.manifest.id, token: body.token, expiresAt: Date.parse(body.expiresAt ?? "") || Date.now() + 23 * 3600e3 };
  saveWalletSession(session);
  notify();
  return session;
}

export async function disconnectHotWallet(): Promise<void> {
  saveWalletSession(null);
  notify();
  try { await getConnector().disconnect(); } catch { /* already disconnected */ }
}
