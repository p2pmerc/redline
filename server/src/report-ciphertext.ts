import { createDecipheriv } from "node:crypto";

/** Opens iv(12) | ciphertext | tag(16) under AES-256-GCM. Returns undefined when the key is wrong. */
export function openCiphertext(ciphertextHex: string, keyHex: string): string | undefined {
  try {
    const packed = Buffer.from(ciphertextHex, "hex");
    const key = Buffer.from(keyHex, "hex");
    if (key.length !== 32 || packed.length < 12 + 16) return undefined;
    const decipher = createDecipheriv("aes-256-gcm", key, packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(packed.length - 16));
    return Buffer.concat([decipher.update(packed.subarray(12, packed.length - 16)), decipher.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}
