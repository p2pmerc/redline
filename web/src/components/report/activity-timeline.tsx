import {
  LockKey, PaperPlaneTilt, UserCheck, ChatCircleText, Signature, Coins, GitPullRequest, GitMerge,
  HandCoins, ArrowUUpLeft, BellRinging, Megaphone, ArrowSquareOut, type Icon,
} from "@phosphor-icons/react";
import { explorerTxUrl } from "@/lib/redline-config";
import { relativeTime, shortHash } from "@/lib/format";
import type { TimelineEvent } from "@/lib/redline-types";

const kindIcon: Record<TimelineEvent["kind"], Icon> = {
  sealed: LockKey,
  invite_sent: PaperPlaneTilt,
  invite_redeemed: UserCheck,
  message: ChatCircleText,
  agreement_signed: Signature,
  escrow_funded: Coins,
  pr_linked: GitPullRequest,
  pr_merged: GitMerge,
  payout: HandCoins,
  refund: ArrowUUpLeft,
  disclosure_notice: BellRinging,
  published: Megaphone,
};

export function ActivityTimeline({ events }: { events: TimelineEvent[] }) {
  const ordered = [...events].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <ol className="relative space-y-1">
      <span aria-hidden className="absolute bottom-3 left-[17px] top-3 w-px bg-border" />
      {ordered.map((e) => {
        const EventIcon = kindIcon[e.kind];
        return (
          <li key={e.id} className="relative flex gap-3 rounded-xl p-2 transition-colors hover:bg-hover">
            <span className="relative z-10 flex size-[34px] shrink-0 items-center justify-center rounded-full bg-surface-3 text-foreground shadow-surface-2">
              <EventIcon size={16} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-subtitle font-medium">{e.title}</p>
                <time className="shrink-0 text-caption text-muted-foreground" dateTime={e.at}>{relativeTime(e.at)}</time>
              </div>
              {e.detail && <p className="text-body text-muted-foreground">{e.detail}</p>}
              {e.txHash && (
                <a
                  href={explorerTxUrl(e.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {shortHash(e.txHash)} <ArrowSquareOut size={11} />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
