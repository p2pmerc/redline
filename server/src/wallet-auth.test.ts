import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { combineVerifiers, createWalletAuth, nep413Hash, WALLET_RECIPIENT, type SignedMessage } from "./wallet-auth.js";

const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const b58 = (bytes: Uint8Array) => { let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b); let s = ""; while (n > 0n) { s = ALPHA[Number(n % 58n)] + s; n /= 58n; } for (const b of bytes) { if (b) break; s = "1" + s; } return s; };

function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = new Uint8Array(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
  return {
    pub,
    sign(account: string, ts: number, recipient = WALLET_RECIPIENT): SignedMessage {
      const nonce = Buffer.alloc(32, 7);
      const message = JSON.stringify({ redline_login: account, ts });
      const sig = sign(null, nep413Hash(message, nonce, recipient), privateKey);
      return { standard: "nep413", payload: { message, nonce: nonce.toString("base64"), recipient }, public_key: `ed25519:${b58(pub)}`, signature: `ed25519:${b58(sig)}` };
    },
  };
}

describe("wallet sign-in", () => {
  const T = 1_800_000_000_000;
  const auth = (belongs = true) => createWalletAuth({ secret: "s", keyBelongs: async () => belongs, now: () => T });

  it("issues a session for a valid NEP-413 signature", async () => {
    const w = wallet();
    const out = await auth().login(w.sign("ada.testnet", T));
    expect(out.account).toBe("ada.testnet");
    expect(await auth().verify(out.token)).toBe("near:ada.testnet");
  });
  it("rejects a key that does not control the account", async () => {
    await expect(auth(false).login(wallet().sign("ada.testnet", T))).rejects.toThrow(/does not control/);
  });
  it("rejects stale, wrong-app and tampered signatures", async () => {
    const w = wallet();
    await expect(auth().login(w.sign("ada.testnet", T - 3_600_000))).rejects.toThrow(/expired/);
    await expect(auth().login(w.sign("ada.testnet", T, "other.app"))).rejects.toThrow(/another app/);
    const s = w.sign("ada.testnet", T);
    s.payload.message = s.payload.message.replace("ada", "eve");
    await expect(auth().login(s)).rejects.toThrow(/not valid/);
  });
  it("routes wallet tokens away from Privy and everything else to it", async () => {
    const a = auth();
    const { token } = await a.login(wallet().sign("ada.testnet", T));
    const v = combineVerifiers(a, async (t) => `privy:${t}`);
    expect(await v(token)).toBe("near:ada.testnet");
    expect(await v("abc.def.ghi")).toBe("privy:abc.def.ghi");
  });
});
