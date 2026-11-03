import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { CalendarBlank, Coins, GitBranch, CaretRight } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { daysUntil, formatNear, relativeTime } from "@/lib/format";
import { pipelineIndex, severityTone, stageLabels, stagePipeline, stageTone } from "@/lib/report-stages";
import type { Report } from "@/lib/redline-types";

/** Seven thin segments, one per pipeline stage. */
export function StageProgressBar({ stage }: { stage: Report["stage"] }) {
  const index = pipelineIndex(stage);
  const exited = index === -1;
  return (
    <div className="flex gap-1" role="img" aria-label={`Stage: ${stageLabels[stage]}`}>
      {stagePipeline.map((s, i) => (
        <span
          key={s.id}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors",
            exited ? "bg-redline/60" : i < index ? "bg-foreground/70" : i === index ? "bg-fluid-accent" : "bg-foreground/10",
          )}
        />
      ))}
    </div>
  );
}

export function ReportCard({ report, index = 0, to }: { report: Report; index?: number; to?: string }) {
  const left = daysUntil(report.disclosureDeadline);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.45, bounce: 0, delay: Math.min(index * 0.05, 0.3) }}
    >
      <Link
        to={to ?? `/app/reports/${report.id}`}
        className="group block rounded-2xl bg-surface-3 p-5 shadow-surface-2 transition-shadow duration-200 hover:shadow-surface-4 focus-visible:outline-offset-4"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge color={severityTone[report.severity]} className="capitalize">{report.severity}</Badge>
          <Badge color={stageTone[report.stage]}>{stageLabels[report.stage]}</Badge>
          <span className="ml-auto text-caption text-muted-foreground">{relativeTime(report.updatedAt)}</span>
        </div>
        <h3 className="mt-3 text-title font-semibold leading-snug tracking-tight">{report.title}</h3>
        <p className="mt-1 line-clamp-2 text-body text-muted-foreground">{report.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><GitBranch size={14} />{report.repo ?? report.target}</span>
          <span className="inline-flex items-center gap-1.5"><Coins size={14} />{formatNear(report.rewardNear)}</span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarBlank size={14} />
            {left > 0 ? `${left}d to disclosure` : "Disclosure open"}
          </span>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <div className="flex-1"><StageProgressBar stage={report.stage} /></div>
          <CaretRight size={14} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    </motion.div>
  );
}
