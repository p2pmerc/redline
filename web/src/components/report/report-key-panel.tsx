import { useEffect, useState } from "react";
import { Key, LockKeyOpen, Copy, Check, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { useToast } from "@/components/feedback/toast-provider";
import { ensureDeviceKeypair, isValidKeyHex, unwrapReportKeyForDevice, wrapReportKeyForDevice } from "@/lib/report-encryption";
import { depositKeyWraps, fetchMyKeyWraps, listPartyDeviceKeys, registerDeviceKey } from "@/lib/data-source";
import { getReportKey, saveReportKey } from "@/lib/report-key-vault";
import type { Report } from "@/lib/redline-types";

/** Shows the report key to the researcher for backup, or asks anyone whose browser lacks it to paste it.
 *  Also registers a per-browser device key and, when this browser holds the report key, escrows wraps
 *  for other party devices so they can unlock without reopening the invite link. */
export function ReportKeyPanel({ report, onUnlocked }: { report: Report; onUnlocked: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);
  const [tryingWrap, setTryingWrap] = useState(false);
  const key = getReportKey(report.id);
  const valid = isValidKeyHex(value.trim());

  // Register this device; if locked, try unwraps; if unlocked, deposit wraps for other devices.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { publicKeyHex } = await ensureDeviceKeypair();
        await registerDeviceKey(report.id, publicKeyHex);
        if (cancelled) return;

        if (!getReportKey(report.id)) {
          setTryingWrap(true);
          const { wraps } = await fetchMyKeyWraps(report.id);
          for (const w of wraps) {
            if (w.devicePubHex.toLowerCase() !== publicKeyHex.toLowerCase()) continue;
            try {
              const opened = await unwrapReportKeyForDevice(w.wrapHex);
              if (!isValidKeyHex(opened)) continue;
              saveReportKey(report.id, opened);
              if (!cancelled) {
                toast.show({ tone: "success", title: "Unlocked from another device" });
                onUnlocked();
              }
              return;
            } catch {
              /* try next */
            }
          }
        } else {
          const reportKey = getReportKey(report.id);
          if (!reportKey) return;
          const { keys } = await listPartyDeviceKeys(report.id);
          const missing = keys.filter((d) => d.devicePubHex.toLowerCase() !== publicKeyHex.toLowerCase());
          if (missing.length === 0) return;
          const wraps = [];
          for (const d of missing) {
            try {
              wraps.push({ userId: d.userId, devicePubHex: d.devicePubHex, wrapHex: await wrapReportKeyForDevice(reportKey, d.devicePubHex) });
            } catch {
              /* skip bad pub */
            }
          }
          if (wraps.length > 0) await depositKeyWraps(report.id, wraps);
        }
      } catch {
        /* soft-fail: paste/invite still work */
      } finally {
        if (!cancelled) setTryingWrap(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run on report identity / lock flips only
  }, [report.id, report.bodyLocked]);

  if (report.bodyLocked) {
    return (
      <section className="card-hairline p-5" aria-label="Report key">
        <h2 className="mb-2 flex items-center gap-2 text-subtitle font-semibold"><Key size={16} /> Report key needed</h2>
        <p className="mb-3 text-body text-muted-foreground">
          {tryingWrap
            ? "Checking for a key left by another of your signed-in browsers…"
            : "This browser does not hold the key for this report, so the text and chat stay encrypted. Open the invite link you were sent again, or paste the 64-character key. After one unlock here, other signed-in browsers can pick it up automatically."}
        </p>
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          saveReportKey(report.id, value);
          setValue("");
          toast.show({ tone: "success", title: "Key saved in this browser" });
          onUnlocked();
        }} className="space-y-2">
          <InputGroup>
            <InputField index={0} label="Report key" placeholder="64 hex characters" value={value} onChange={setValue} autoComplete="off" spellCheck={false} />
          </InputGroup>
          {value.trim() && !valid && <p className="flex items-center gap-1.5 text-caption text-red-500"><Warning size={13} /> That does not look like a report key.</p>}
          <Button type="submit" className="w-full" leadingIcon={LockKeyOpen} disabled={!valid}>Unlock in this browser</Button>
        </form>
      </section>
    );
  }

  if (report.role !== "researcher" || !key) return null;
  return (
    <section className="card-hairline p-5" aria-label="Report key backup">
      <h2 className="mb-2 flex items-center gap-2 text-subtitle font-semibold"><Key size={16} /> Your report key</h2>
      <p className="mb-3 text-body text-muted-foreground">It lives only in this browser. Back it up now: lose it and the report cannot be opened here again. When you unlock on another signed-in device, this browser can leave a sealed copy for it.</p>
      <Button
        variant="secondary" size="compact" leadingIcon={copied ? Check : Copy}
        onClick={async () => {
          try { await navigator.clipboard.writeText(key); setCopied(true); setTimeout(() => setCopied(false), 1800); }
          catch { toast.show({ tone: "error", title: "Could not copy", description: "Your browser blocked clipboard access." }); }
        }}
      >
        {copied ? "Copied" : "Copy key"}
      </Button>
    </section>
  );
}
