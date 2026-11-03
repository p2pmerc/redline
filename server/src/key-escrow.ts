import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Report keys held wrapped (AES-256-GCM) under a service secret, released only to the signed-in
 * owner and the verified, redeemed invitee. Stored as iv(12) | ciphertext | tag(16), hex.
 */
export interface KeyEscrow {
  wrap(keyHex: string): string;
  unwrap(wrappedHex: string): string | undefined;
}

export function createKeyEscrow(secret: string): KeyEscrow {
  const kek = createHash("sha256").update(`redline:key-escrow:v1:${secret}`).digest();
  return {
    wrap(keyHex) {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", kek, iv);
      const ct = Buffer.concat([c.update(Buffer.from(keyHex, "hex")), c.final()]);
      return Buffer.concat([iv, ct, c.getAuthTag()]).toString("hex");
    },
    unwrap(wrappedHex) {
      try {
        const p = Buffer.from(wrappedHex, "hex");
        const d = createDecipheriv("aes-256-gcm", kek, p.subarray(0, 12));
        d.setAuthTag(p.subarray(p.length - 16));
        return Buffer.concat([d.update(p.subarray(12, p.length - 16)), d.final()]).toString("hex");
      } catch {
        return undefined;
      }
    },
  };
}
