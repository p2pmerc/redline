import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { storeSealedKey } from "@/lib/data-source";
import { readKeyFromEnclave } from "@/lib/enclave-key";
import { redlineConfig } from "@/lib/redline-config";
import { sealKeyToEnclave } from "@/lib/report-encryption";
import { getReportKey, saveReportKey } from "@/lib/report-key-vault";

const RETRY_MS = 20_000;
const resealed = new Set<string>();

/**
 * Automatic key access, with no clicks and nothing to paste.
 *  - Locked (no working key in this browser): ask the enclave. It checks your sign-in and the on-chain
 *    access list, and releases the key only to the owner and a redeemed, non-revoked invitee.
 *  - Owner of a report with no enclave-sealed key yet (older reports): seal it to the enclave, once.
 */
export function useReportKeyAccess(
  report: { id: string; contentHash: string; hasSealedKey?: boolean },
  locked: boolean,
  isOwner: boolean,
  onUnlocked: () => void,
): { checking: boolean; error?: string } {
  const [checking, setChecking] = useState(locked);
  const [error, setError] = useState<string>();
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const unlocked = useRef(onUnlocked);
  unlocked.current = onUnlocked;
  const { id, contentHash, hasSealedKey } = report;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const loop = async () => {
      if (!lockedRef.current) {
        const held = getReportKey(id);
        if (isOwner && held && !hasSealedKey && !resealed.has(id) && redlineConfig.enclavePublicKey) {
          resealed.add(id);
          try { await storeSealedKey(id, sealKeyToEnclave(held, contentHash, redlineConfig.enclavePublicKey)); } catch { resealed.delete(id); }
        }
        setChecking(false);
        return;
      }
      try {
        const key = await readKeyFromEnclave(id);
        if (cancelled) return;
        saveReportKey(id, key);
        setError(undefined);
        setChecking(false);
        unlocked.current();
        return;
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError || e instanceof Error ? e.message : "The enclave did not answer.");
      }
      if (!cancelled) timer = setTimeout(() => void loop(), RETRY_MS);
    };
    void loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, isOwner, contentHash, hasSealedKey]);

  return { checking, error };
}
