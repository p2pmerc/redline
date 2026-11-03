import { Key, LockKey, SpinnerGap } from "@phosphor-icons/react";
import { useReportKeyAccess } from "@/lib/use-report-key-access";
import type { Report } from "@/lib/redline-types";

/** Key access is automatic (see useReportKeyAccess). There is nothing to paste, copy or back up. */
export function ReportKeyPanel({ report, onUnlocked }: { report: Report; onUnlocked: () => void }) {
  useReportKeyAccess(report.id, !!report.bodyLocked, report.role === "researcher", onUnlocked);

  if (report.bodyLocked) {
    return (
      <section className="card-hairline p-5" aria-label="Report key" aria-live="polite">
        <h2 className="mb-2 flex items-center gap-2 text-subtitle font-semibold"><Key size={16} /> Unlocking this report</h2>
        <p className="flex items-start gap-2 text-body text-muted-foreground">
          <SpinnerGap size={16} className="mt-0.5 shrink-0 animate-spin" />
          <span>Checking your account. This unlocks automatically for the owner and verified invitees.</span>
        </p>
      </section>
    );
  }

  return (
    <p className="flex items-center gap-2 text-caption text-muted-foreground">
      <LockKey size={14} /> Sealed: only you and verified invitees can read this, on any signed-in device.
    </p>
  );
}
