import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Files, FilePlus, Lock, Coins, CheckCircle, Tray, HandWaving } from "@phosphor-icons/react";
import Tabs, { TabsItem } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ReportCard } from "@/components/report/report-card";
import { ReportActivity, ReportPulse } from "@/components/report/report-pulse";
import { useProfile } from "@/lib/profile-context";
import { useSession } from "@/lib/auth-context";
import { ReportCardSkeleton, Skeleton } from "@/components/feedback/skeleton";
import { EmptyState, ErrorState } from "@/components/feedback/empty-state";
import { listReports } from "@/lib/data-source";
import { useAsync } from "@/lib/use-async";
import { formatNear } from "@/lib/format";
import type { Report } from "@/lib/redline-types";

const filters: { label: string; icon: typeof Files; match: (r: Report) => boolean }[] = [
  { label: "All", icon: Files, match: () => true },
  { label: "Open", icon: Lock, match: (r) => !["paid", "published", "refunded"].includes(r.stage) },
  { label: "Settled", icon: CheckCircle, match: (r) => ["paid", "published", "refunded"].includes(r.stage) },
];

function greeting(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function DashboardPage() {
  const { profile } = useProfile();
  const { displayName } = useSession();
  const firstName = (profile?.displayName ?? displayName).split(/\s+/)[0];
  const { data, error, loading, reload } = useAsync(listReports, []);
  const [tab, setTab] = useState(0);
  const visible = useMemo(() => (data ?? []).filter(filters[tab].match), [data, tab]);
  const escrowed = (data ?? []).filter((r) => r.escrow?.funded && r.stage !== "paid").reduce((n, r) => n + (r.escrow?.amountNear ?? 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Reports</p>
          <h1 className="flex items-center gap-2 text-[1.75rem] font-semibold leading-tight tracking-tight">{greeting()}, {firstName} <HandWaving size={26} weight="fill" className="chart-orange" aria-hidden /></h1>
          <p className="text-body text-muted-foreground">Sealed disclosures you filed or were invited to. Only you and the people you invite can see them.</p>
        </div>
        <Button render={<Link to="/app/reports/new" />} leadingIcon={FilePlus}>New report</Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={Files} label="Reports" loading={loading} value={String(data?.length ?? 0)} />
        <Stat icon={Lock} label="Awaiting action" loading={loading} value={String((data ?? []).filter(filters[1].match).length)} />
        <Stat icon={Coins} label="Held in escrow" loading={loading} value={formatNear(escrowed)} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ReportPulse reports={data ?? []} loading={loading} />
        <ReportActivity reports={data ?? []} loading={loading} />
      </div>

      <section className="space-y-5">
        <div className="py-1">
          <Tabs selectedIndex={tab} onSelect={setTab} idPrefix="report-filter">
            {filters.map((f, i) => <TabsItem key={f.label} index={i} label={f.label} icon={f.icon} />)}
          </Tabs>
        </div>
        {error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : loading ? (
          <div className="grid gap-4 md:grid-cols-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <ReportCardSkeleton key={i} />)}</div>
        ) : visible.length === 0 ? (
          <EmptyState icon={Tray} title="Nothing here yet" description="File your first sealed report, or wait for an invite from a security team."
            action={<Button render={<Link to="/app/reports/new" />} leadingIcon={FilePlus}>New report</Button>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">{visible.map((r, i) => <ReportCard key={r.id} report={r} index={i} />)}</div>
        )}
      </section>
    </div>
  );
}

function Stat({ icon: StatIcon, label, value, loading }: { icon: typeof Files; label: string; value: string; loading: boolean }) {
  return (
    <div className="card-hairline flex items-center gap-4 p-4">
      <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[color:var(--redline)]"><StatIcon size={20} /></span>
      <div>
        <p className="text-caption text-muted-foreground">{label}</p>
        {loading ? <Skeleton className="mt-1 h-6 w-16" /> : <p className="text-title font-semibold tabular-nums">{value}</p>}
      </div>
    </div>
  );
}
