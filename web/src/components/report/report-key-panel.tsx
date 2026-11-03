import { useState } from "react";
import { Key, LockKeyOpen, Copy, Check, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { useToast } from "@/components/feedback/toast-provider";
import { isValidKeyHex } from "@/lib/report-encryption";
import { getReportKey, saveReportKey } from "@/lib/report-key-vault";
import type { Report } from "@/lib/redline-types";

/** Shows the report key to the researcher for backup, or asks anyone whose browser lacks it to paste it. */
export function ReportKeyPanel({ report, onUnlocked }: { report: Report; onUnlocked: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);
  const key = getReportKey(report.id);
  const valid = isValidKeyHex(value.trim());

  if (report.bodyLocked) {
    return (
      <section className="rounded-2xl bg-surface-3 p-5 shadow-surface-2" aria-label="Report key">
        <h2 className="mb-2 flex items-center gap-2 text-subtitle font-semibold"><Key size={16} /> Report key needed</h2>
        <p className="mb-3 text-body text-muted-foreground">This browser does not hold the key for this report, so the text and chat stay encrypted. Open the invite link you were sent again, or paste the 64-character key.</p>
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

  if (report.role !== "researcher" || !key || report.sample) return null;
  return (
    <section className="rounded-2xl bg-surface-3 p-5 shadow-surface-2" aria-label="Report key backup">
      <h2 className="mb-2 flex items-center gap-2 text-subtitle font-semibold"><Key size={16} /> Your report key</h2>
      <p className="mb-3 text-body text-muted-foreground">It lives only in this browser. Back it up now: lose it and the report cannot be opened here again.</p>
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
