import { useState } from "react";
import { Megaphone, Timer } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/feedback/toast-provider";
import { publishReport } from "@/lib/data-source";
import { daysUntil, shortDate } from "@/lib/format";
import type { Report } from "@/lib/redline-types";

/** The researcher's way out: after the deadline, unseal the report for everyone. Not shown to the team. */
export function PublishPanel({ report, onChange }: { report: Report; onChange: (next: Report) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  if (report.role !== "researcher" || report.stage === "published" || report.bodyLocked) return null;
  const left = daysUntil(report.disclosureDeadline);
  const open = left <= 0;

  async function publish() {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 5000); return; }
    setBusy(true);
    try {
      onChange(await toast.promise(publishReport(report.id, report.body), { pending: "Unsealing…", success: "Report is public", error: "Could not publish" }));
    } catch { /* toast shown */ } finally { setBusy(false); setArmed(false); }
  }

  return (
    <section className="card-hairline p-5" aria-label="Publish">
      <h2 className="mb-2 flex items-center gap-2 text-subtitle font-semibold"><Megaphone size={16} /> Publish</h2>
      {open ? (
        <>
          <p className="mb-3 text-body text-muted-foreground">The disclosure window is open. Publishing unseals the report for everyone and records its hash on the ledger. It cannot be undone.</p>
          <Button className="w-full" variant={armed ? "primary" : "secondary"} leadingIcon={Megaphone} loading={busy} onClick={() => void publish()}>
            {armed ? "Click again to publish" : "Publish report"}
          </Button>
        </>
      ) : (
        <p className="flex items-start gap-2 text-body text-muted-foreground"><Timer size={16} className="mt-0.5 shrink-0" /> You can publish on {shortDate(report.disclosureDeadline)}, in {left} {left === 1 ? "day" : "days"}. Until then only invited people can read it.</p>
      )}
    </section>
  );
}
