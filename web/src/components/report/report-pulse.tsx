import { useMemo } from "react";
import { Pulse, ChartLineUp } from "@phosphor-icons/react";
import { Skeleton } from "@/components/feedback/skeleton";
import type { Report } from "@/lib/redline-types";

const WEEK = 7 * 24 * 3600 * 1000;
const WEEKS = 12;

function Card({ icon: CardIcon, title, children }: { icon: typeof Pulse; title: string; children: React.ReactNode }) {
  return (
    <section className="card-hairline p-5">
      <h2 className="mb-4 flex items-center gap-2 text-title font-semibold"><CardIcon size={18} className="chart-orange" />{title}</h2>
      {children}
    </section>
  );
}

/** Settled, in-progress and refunded reports as green, amber and red bars on a beige track. */
export function ReportPulse({ reports, loading }: { reports: Report[]; loading: boolean }) {
  const rows = useMemo(() => {
    const settled = reports.filter((r) => r.stage === "paid" || r.stage === "published").length;
    const refunded = reports.filter((r) => r.stage === "refunded").length;
    const progress = reports.length - settled - refunded;
    const max = Math.max(1, reports.length);
    return [
      { label: "Settled", count: settled, fill: "bar-fill-green", pct: settled / max },
      { label: "In progress", count: progress, fill: "bar-fill-amber", pct: progress / max },
      { label: "Refunded", count: refunded, fill: "bar-fill-red", pct: refunded / max },
    ];
  }, [reports]);
  return (
    <Card icon={Pulse} title="Report pulse">
      <ul className="space-y-4">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="mb-1.5 flex items-baseline justify-between text-body">
              <span>{row.label}</span>
              {loading ? <Skeleton className="h-4 w-6" /> : <span className="font-semibold tabular-nums">{row.count}</span>}
            </div>
            <div className="bar-track h-2" role="img" aria-label={`${row.label}: ${row.count}`}>
              <div className={`h-full rounded-full transition-[width] duration-500 ${row.fill}`} style={{ width: `${Math.round(row.pct * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Orange area chart of how many reports changed each week for the last twelve weeks. */
export function ReportActivity({ reports, loading }: { reports: Report[]; loading: boolean }) {
  const { points, total } = useMemo(() => {
    const now = Date.now();
    const buckets = Array<number>(WEEKS).fill(0);
    for (const r of reports) {
      const age = Math.floor((now - new Date(r.updatedAt).getTime()) / WEEK);
      if (age >= 0 && age < WEEKS) buckets[WEEKS - 1 - age] += 1;
    }
    return { points: buckets, total: buckets.reduce((a, b) => a + b, 0) };
  }, [reports]);

  const W = 240, H = 64, max = Math.max(1, ...points);
  const xy = points.map((v, i) => [(i / (WEEKS - 1)) * W, H - 4 - (v / max) * (H - 12)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;

  return (
    <Card icon={ChartLineUp} title="Activity">
      <div className="mb-3 flex items-baseline gap-2">
        {loading ? <Skeleton className="h-7 w-10" /> : <span className="text-[1.5rem] font-semibold tabular-nums">{total}</span>}
        <span className="text-caption text-muted-foreground">updates in the last 12 weeks</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-orange h-16 w-full" preserveAspectRatio="none" role="img" aria-label="Weekly report activity">
        <defs>
          <linearGradient id="activity-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#activity-fill)" />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </Card>
  );
}
