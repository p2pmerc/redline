import { useEffect, useRef, useState } from "react";
import { escrowReportKey, fetchEscrowedKey } from "@/lib/data-source";
import { getReportKey, saveReportKey } from "@/lib/report-key-vault";

const POLL_MS = 5000;
const escrowed = new Set<string>();

/**
 * Automatic key access, with no clicks and nothing to paste.
 *  - Locked (no working key in this browser): ask the key vault. It releases the key only to the
 *    signed-in owner and the verified, redeemed invitee, so any signed-in device unlocks itself.
 *  - Unlocked owner: make sure the vault holds the key too (covers reports sealed before the vault),
 *    once per session.
 */
export function useReportKeyAccess(reportId: string, locked: boolean, isOwner: boolean, onUnlocked: () => void): { checking: boolean } {
  const [checking, setChecking] = useState(locked);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const unlocked = useRef(onUnlocked);
  unlocked.current = onUnlocked;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async (): Promise<boolean> => {
      if (!lockedRef.current) {
        const held = getReportKey(reportId);
        if (isOwner && held && !escrowed.has(reportId)) {
          await escrowReportKey(reportId, held);
          escrowed.add(reportId);
        }
        return false;
      }
      const stored = getReportKey(reportId);
      const vaulted = await fetchEscrowedKey(reportId);
      // A stored key that does not open the report is wrong; only a different vaulted key helps.
      if (vaulted && vaulted !== stored) {
        saveReportKey(reportId, vaulted);
        return true;
      }
      return false;
    };

    const loop = async () => {
      let justUnlocked = false;
      try {
        justUnlocked = await tick();
      } catch { /* offline or signed out: try again on the next round */ }
      if (cancelled) return;
      if (justUnlocked) {
        setChecking(false);
        unlocked.current();
        return;
      }
      if (!lockedRef.current) { setChecking(false); if (!isOwner || escrowed.has(reportId)) return; }
      timer = setTimeout(() => void loop(), POLL_MS);
    };
    void loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reportId, isOwner]);

  return { checking };
}
