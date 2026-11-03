/**
 * Where report keys live in the browser while the enclave is not deployed. A key never goes to the
 * server. The researcher's browser keeps it, and invite links carry it in the URL fragment, which
 * browsers do not send over the network.
 */
import { isValidKeyHex } from "./report-encryption";

const prefix = "redline:report-key:";
const pendingPrefix = "redline:invite-key:";

const read = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* storage blocked: the key can still be pasted */ }
};

export const saveReportKey = (reportId: string, keyHex: string) => write(prefix + reportId, keyHex.trim().toLowerCase());
export const getReportKey = (reportId: string): string | null => {
  const value = read(prefix + reportId);
  return value && isValidKeyHex(value) ? value : null;
};

export const rememberInviteKey = (token: string, keyHex: string) => { if (isValidKeyHex(keyHex)) write(pendingPrefix + token, keyHex.trim().toLowerCase()); };
export const takeInviteKey = (token: string): string | null => read(pendingPrefix + token);

/** `/app/invite/<token>#k=<key>` pulled from a location, so the key survives a sign-in redirect. */
export function captureInviteKey(pathname: string, hash: string): void {
  const match = /^\/app\/invite\/([\w-]{16,64})$/.exec(pathname);
  const key = /(?:^#|&)k=([0-9a-fA-F]{64})/.exec(hash)?.[1];
  if (match && key) rememberInviteKey(match[1]!, key);
}

export const inviteLink = (token: string, keyHex: string | null): string =>
  `${location.origin}/app/invite/${token}${keyHex ? `#k=${keyHex}` : ""}`;
