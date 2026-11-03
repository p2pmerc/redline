/**
 * Client-side sealing of a report.
 *
 * A fresh AES-256-GCM key encrypts the markdown body in the browser. The key
 * is then sealed to the enclave's public key with ECIES (secp256k1), so only
 * code running inside the enclave can unseal it. The server stores the
 * ciphertext, and the SHA-256 of the ciphertext goes on chain.
 */
import { encrypt as eciesEncrypt } from "eciesjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
export const fromHex = (hex: string): Uint8Array => Uint8Array.from(hex.match(/.{2}/g) ?? [], (h) => parseInt(h, 16));

export interface SealedReport {
  /** iv (12 bytes) followed by the AES-GCM ciphertext and tag, hex encoded. */
  ciphertextHex: string;
  /** SHA-256 of the ciphertext bytes, hex encoded. Registered on chain. */
  contentHash: string;
  /** The raw AES key, hex encoded. Held in memory only and shown to the author once. */
  keyHex: string;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return toHex(new Uint8Array(digest));
}

/** Encrypts text under an existing 32-byte key. Output is iv (12 bytes) followed by ciphertext and tag, hex. */
export async function encryptWithKey(text: string, keyHex: string): Promise<{ ciphertextHex: string; hash: string }> {
  const key = await crypto.subtle.importKey("raw", fromHex(keyHex) as BufferSource, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(text)));
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, iv.length);
  return { ciphertextHex: toHex(packed), hash: await sha256Hex(packed) };
}

export async function sealReportBody(markdown: string): Promise<SealedReport> {
  const keyHex = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const { ciphertextHex, hash } = await encryptWithKey(markdown, keyHex);
  return { ciphertextHex, contentHash: hash, keyHex };
}

export async function openReportBody(ciphertextHex: string, keyHex: string): Promise<string> {
  const packed = fromHex(ciphertextHex);
  const key = await crypto.subtle.importKey("raw", fromHex(keyHex) as BufferSource, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(0, 12) }, key, packed.slice(12));
  return decoder.decode(plain);
}

export const isValidKeyHex = (value: string): boolean => /^[0-9a-f]{64}$/i.test(value.trim());

/**
 * Seals the report key and the ciphertext hash so that only the enclave holding the matching private
 * key can read them. The enclave refuses the key if the hash does not match the registered report.
 */
export function sealKeyToEnclave(keyHex: string, contentHash: string, enclavePublicKeyHex: string): string {
  const envelope = JSON.stringify({ v: 1, key: keyHex, content_hash: contentHash });
  return toHex(eciesEncrypt(enclavePublicKeyHex, encoder.encode(envelope)));
}
