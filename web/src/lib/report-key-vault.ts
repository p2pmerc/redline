/**
 * A per-browser cache of report keys. The key itself is held by the OutLayer enclave: this browser
 * asks the enclave for it (see enclave-key.ts) and keeps a copy here for the session's reads.
 */
import { isValidKeyHex } from "./report-encryption";

const prefix = "redline:report-key:";

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
