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

/** Long-lived per-browser keypair so a report key can be escrowed as ciphertext the server cannot open. */
const DEVICE_PRIV = "redline:device-priv";
const DEVICE_PUB = "redline:device-pub";

export async function ensureDeviceKeypair(): Promise<{ publicKeyHex: string }> {
  const existing = localStorage.getItem(DEVICE_PUB);
  if (existing && localStorage.getItem(DEVICE_PRIV)) return { publicKeyHex: existing };
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = await crypto.subtle.exportKey("raw", pair.publicKey);
  const priv = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const publicKeyHex = toHex(new Uint8Array(pub));
  localStorage.setItem(DEVICE_PUB, publicKeyHex);
  localStorage.setItem(DEVICE_PRIV, toHex(new Uint8Array(priv)));
  return { publicKeyHex };
}

export function getDevicePublicKeyHex(): string | null {
  try { return localStorage.getItem(DEVICE_PUB); } catch { return null; }
}

async function importDeviceKeys() {
  const pubHex = localStorage.getItem(DEVICE_PUB);
  const privHex = localStorage.getItem(DEVICE_PRIV);
  if (!pubHex || !privHex) throw new Error("This browser has no device key yet.");
  const publicKey = await crypto.subtle.importKey("raw", fromHex(pubHex) as BufferSource, { name: "ECDH", namedCurve: "P-256" }, true, []);
  const privateKey = await crypto.subtle.importKey("pkcs8", fromHex(privHex) as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  return { publicKey, privateKey };
}

/** Seal a report key to another browser's device public key (raw P-256, hex). Server stores only the ciphertext. */
export async function wrapReportKeyForDevice(reportKeyHex: string, recipientPublicKeyHex: string): Promise<string> {
  const recipient = await crypto.subtle.importKey("raw", fromHex(recipientPublicKeyHex) as BufferSource, { name: "ECDH", namedCurve: "P-256" }, true, []);
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: recipient }, ephemeral.privateKey, 256);
  const wrapKey = await crypto.subtle.importKey("raw", shared, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, fromHex(reportKeyHex) as BufferSource));
  const ephPub = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const packed = new Uint8Array(ephPub.length + iv.length + cipher.length);
  packed.set(ephPub, 0);
  packed.set(iv, ephPub.length);
  packed.set(cipher, ephPub.length + iv.length);
  return toHex(packed);
}

/** Open a wrap produced by wrapReportKeyForDevice, using this browser's device private key. */
export async function unwrapReportKeyForDevice(wrapHex: string): Promise<string> {
  const { privateKey } = await importDeviceKeys();
  const packed = fromHex(wrapHex);
  if (packed.length < 65 + 12 + 16) throw new Error("That wrap is the wrong length.");
  const ephPub = packed.slice(0, 65);
  const iv = packed.slice(65, 77);
  const cipher = packed.slice(77);
  const ephemeral = await crypto.subtle.importKey("raw", ephPub as BufferSource, { name: "ECDH", namedCurve: "P-256" }, true, []);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: ephemeral }, privateKey, 256);
  const wrapKey = await crypto.subtle.importKey("raw", shared, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, wrapKey, cipher as BufferSource));
  return toHex(plain);
}
