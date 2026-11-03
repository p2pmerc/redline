import { motion } from "motion/react";
import {
  Check, LockKey, EnvelopeSimple, ChatsCircle, Signature, Coins, GitMerge, HandCoins,
  type Icon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/springs";
import { stagePipeline, pipelineIndex } from "@/lib/report-stages";
import type { ReportStage } from "@/lib/redline-types";

export const stageIcons: Record<string, Icon> = {
  sealed: LockKey,
  invited: EnvelopeSimple,
  negotiating: ChatsCircle,
  agreed: Signature,
  funded: Coins,
  fix_merged: GitMerge,
  paid: HandCoins,
};

interface StageStepperProps {
  current: ReportStage;
  /** Makes each step a button, used on the landing page. */
  onSelect?: (stage: ReportStage) => void;
  selected?: ReportStage;
  className?: string;
}

/** The full status pipeline. Horizontal from md up, vertical below. */
export function StageStepper({ current, onSelect, selected, className }: StageStepperProps) {
  const currentIndex = pipelineIndex(current);
  const exited = currentIndex === -1;

  return (
    <ol className={cn("grid gap-3 md:grid-cols-7 md:gap-2", className)} aria-label="Report status pipeline">
      {stagePipeline.map((stage, i) => {
        const done = !exited && i < currentIndex;
        const active = !exited && i === currentIndex;
        const StageIcon = stageIcons[stage.id];
        const isSelected = selected === stage.id;
        const content = (
          <>
            <div className="relative flex items-center md:w-full">
              <motion.span
                layout
                transition={spring.moderate}
                className={cn(
                  "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground shadow-surface-2",
                  done && "bg-foreground text-background",
                  active && "bg-fluid-accent text-white shadow-surface-3",
                  !done && !active && "bg-surface-3",
                )}
              >
                {done ? <Check size={16} weight="bold" /> : <StageIcon size={17} weight={active ? "fill" : "regular"} />}
                {active && (
                  <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-fluid-accent/30" aria-hidden />
                )}
              </motion.span>
              {i < stagePipeline.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-9 right-[-0.5rem] hidden h-px md:block",
                    done ? "bg-foreground/70" : "bg-border",
                  )}
                />
              )}
            </div>
            <div className="min-w-0 text-left md:mt-3">
              <p className={cn("text-subtitle font-medium", !done && !active && "text-muted-foreground")}>{stage.label}</p>
              <p className="mt-0.5 text-caption text-muted-foreground">{stage.summary}</p>
            </div>
          </>
        );
        return (
          <li key={stage.id} aria-current={active ? "step" : undefined} className="min-w-0">
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(stage.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-hover md:flex-col md:items-start md:gap-0",
                  isSelected && "bg-hover",
                )}
              >
                {content}
              </button>
            ) : (
              <div className="flex items-center gap-3 p-2 md:flex-col md:items-start md:gap-0">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
