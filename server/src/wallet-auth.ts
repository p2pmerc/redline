import { createHash, createPublicKey, randomBytes, verify as edVerify } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { TokenVerifier } from "./privy-token-verifier.js";

/** Sign-in with a NEAR wallet: the wallet signs a short NEP-413 message, we check the signature and that the key
 *  controls the account, then hand back a signed session token. No private key or seed ever reaches the server. */
export const WALLET_RECIPIENT = "redline.app";
const ISSUER = "redline-wallet";
const SESSION_HOURS = 24;
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

export function unb58(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error("bad base58"); n = n * 58n + BigInt(i); }
  const out: number[] = [];
  while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of s) { if (c !== "1") break; out.unshift(0); }
  return Uint8Array.from(out);
}

const borshString = (s: string) => { const b = Buffer.from(s, "utf8"); const len = Buffer.alloc(4); len.writeUInt32LE(b.length); return Buffer.concat([len, b]); };

/** sha256(borsh(tag) || borsh(Nep413Payload{ message, nonce[32], recipient, callback_url: None })) */
export function nep413Hash(message: string, nonce: Buffer, recipient: string): Buffer {
  const tag = Buffer.alloc(4);
  tag.writeUInt32LE(2 ** 31 + 413);
  return createHash("sha256").update(Buffer.concat([tag, borshString(message), nonce, borshString(recipient), Buffer.from([0])])).digest();
}

export interface SignedMessage {
  standard?: string;
  payload: { message: string; nonce: string; recipient: string };
  public_key: string;
  signature: string;
}

export type KeyBelongs = (account: string, publicKey: string) => Promise<boolean>;

/** The key must be a full-access key of the account, or the account must be the implicit account of that key. */
export function createKeyChecker(rpcUrl = "https://rpc.testnet.near.org", fetchImpl: typeof fetch = fetch): KeyBelongs {
  return async (account, publicKey) => {
    const raw = Buffer.from(unb58(publicKey.replace(/^ed25519:/, "")));
    if (/^[0-9a-f]{64}$/.test(account)) return raw.toString("hex") === account;
    const res = await fetchImpl(rpcUrl, {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_access_key", finality: "final", account_id: account, public_key: publicKey } }),
    });
    const body = (await res.json()) as { result?: { permission?: unknown } };
    return body.result?.permission === "FullAccess";
  };
}

export function verifyNep413(signed: SignedMessage): string {
  const p = signed?.payload;
  if (!p || p.recipient !== WALLET_RECIPIENT) throw new Error("This signature was made for another app.");
  const nonce = Buffer.from(p.nonce, "base64");
  if (nonce.length !== 32) throw new Error("Bad nonce.");
  const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(unb58(signed.public_key.replace(/^ed25519:/, "")))]), format: "der", type: "spki" });
  const ok = edVerify(null, nep413Hash(p.message, nonce, p.recipient), key, Buffer.from(unb58(signed.signature.replace(/^ed25519:/, ""))));
  if (!ok) throw new Error("The signature is not valid.");
  return p.message;
}

export interface WalletAuth {
  login: (signed: SignedMessage) => Promise<{ token: string; account: string; expiresAt: string }>;
  verify: TokenVerifier;
  /** True when a token was issued by wallet sign-in, so the Privy verifier is not asked about it. */
  owns: (token: string) => boolean;
}

export function createWalletAuth(opts: { secret?: string; keyBelongs: KeyBelongs; now?: () => number }): WalletAuth {
  const secret = new TextEncoder().encode(opts.secret || randomBytes(32).toString("hex"));
  const now = opts.now ?? Date.now;
  const peek = (token: string): { iss?: unknown } => {
    try { return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")); } catch { return {}; }
  };
  return {
    owns: (token) => peek(token).iss === ISSUER,
    async login(signed) {
      const message = verifyNep413(signed);
      let body: { redline_login?: unknown; ts?: unknown };
      try { body = JSON.parse(message); } catch { throw new Error("Unreadable sign-in message."); }
      const account = String(body.redline_login ?? "");
      const ts = Number(body.ts);
      if (!account || !(ts > now() - 10 * 60_000 && ts < now() + 5 * 60_000)) throw new Error("This sign-in expired. Try again.");
      if (!(await opts.keyBelongs(account, signed.public_key))) throw new Error("That key does not control this NEAR account.");
      const exp = Math.floor(now() / 1000) + SESSION_HOURS * 3600;
      const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setIssuer(ISSUER).setSubject(`near:${account}`).setIssuedAt().setExpirationTime(exp).sign(secret);
      return { token, account, expiresAt: new Date(exp * 1000).toISOString() };
    },
    async verify(token) {
      const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
      if (typeof payload.sub !== "string" || !payload.sub.startsWith("near:")) throw new Error("token has no subject");
      return payload.sub;
    },
  };
}

/** Wallet tokens go to the wallet verifier, everything else to Privy. */
export function combineVerifiers(wallet: WalletAuth, privy: TokenVerifier): TokenVerifier {
  return (token) => (wallet.owns(token) ? wallet.verify(token) : privy(token));
}
