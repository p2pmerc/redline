import { Key, LockKey, SpinnerGap } from "@phosphor-icons/react";
import { useReportKeyAccess } from "@/lib/use-report-key-access";
import type { Report } from "@/lib/redline-types";

/** Key access is automatic (see useReportKeyAccess). The key is held by the enclave; nothing to paste. */
export function ReportKeyPanel({ report, onUnlocked }: { report: Report; onUnlocked: () => void }) {
  const { error } = useReportKeyAccess(report, !!report.bodyLocked, report.role === "researcher", onUnlocked);

  if (report.bodyLocked) {
    return (
      <section className="card-hairline p-5" aria-label="Report key" aria-live="polite">
        <h2 className="mb-2 flex items-center gap-2 text-subtitle font-semibold"><Key size={16} /> Unlocking this report</h2>
        <p className="flex items-start gap-2 text-body text-muted-foreground">
          <SpinnerGap size={16} className="mt-0.5 shrink-0 animate-spin" />
          <span>Asking the enclave for the key. It checks your sign-in and the on-chain access list, which takes about 15 seconds.</span>
        </p>
        {error && <p className="mt-2 text-caption text-muted-foreground">{error} Trying again shortly.</p>}
      </section>
    );
  }

  return (
    <p className="flex items-center gap-2 text-caption text-muted-foreground">
      <LockKey size={14} /> Sealed in the enclave: operators cannot read this report. Only you and verified invitees can.
    </p>
  );
}
