import { beforeEach, describe, expect, it } from "vitest";
import { encryptWithKey, isValidKeyHex, openReportBody, sealReportBody, sha256Hex, fromHex } from "./report-encryption";
import { captureInviteKey, getReportKey, inviteLink, saveReportKey, takeInviteKey } from "./report-key-vault";
import { robohashUrl } from "@/components/ui/profile-avatar";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.assign(globalThis, {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    location: { origin: "https://redline.example" },
  });
});

describe("report encryption", () => {
  it("round-trips and registers the hash of the ciphertext", async () => {
    const sealed = await sealReportBody("# Finding\n\n```js\nalert(1)\n```");
    expect(isValidKeyHex(sealed.keyHex)).toBe(true);
    expect(await sha256Hex(fromHex(sealed.ciphertextHex))).toBe(sealed.contentHash);
    expect(await openReportBody(sealed.ciphertextHex, sealed.keyHex)).toContain("alert(1)");
  });

  it("refuses the wrong key and does not leak the text in the ciphertext", async () => {
    const sealed = await sealReportBody("secret exploit path");
    const other = await sealReportBody("x");
    await expect(openReportBody(sealed.ciphertextHex, other.keyHex)).rejects.toThrow();
    expect(sealed.ciphertextHex).not.toContain(Buffer.from("secret").toString("hex"));
  });

  it("encrypts chat messages with the report key, with a fresh nonce each time", async () => {
    const { keyHex } = await sealReportBody("body");
    const a = await encryptWithKey("hi", keyHex);
    const b = await encryptWithKey("hi", keyHex);
    expect(a.ciphertextHex).not.toBe(b.ciphertextHex);
    expect(await openReportBody(a.ciphertextHex, keyHex)).toBe("hi");
  });
});

describe("key vault", () => {
  const key = "ab".repeat(32);
  it("keeps keys per report and ignores malformed values", () => {
    saveReportKey("r1", key.toUpperCase());
    expect(getReportKey("r1")).toBe(key);
    store.set("redline:report-key:r2", "nope");
    expect(getReportKey("r2")).toBeNull();
  });

  it("captures the key from an invite link fragment and builds the same link back", () => {
    const token = "t".repeat(24);
    captureInviteKey(`/app/invite/${token}`, `#k=${key}`);
    expect(takeInviteKey(token)).toBe(key);
    expect(inviteLink(token, key)).toBe(`https://redline.example/app/invite/${token}#k=${key}`);
    captureInviteKey("/app/reports/x", `#k=${key}`);
    expect(takeInviteKey("x")).toBeNull();
  });
});

describe("avatars", () => {
  it("builds RoboHash addresses from the seed only", () => {
    const url = robohashUrl("a".repeat(32), 32);
    expect(url).toBe(`https://robohash.org/${"a".repeat(32)}?set=set1&size=64x64`);
  });
});
