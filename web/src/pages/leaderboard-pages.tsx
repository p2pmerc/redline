import { Link, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, ArrowSquareOut, CalendarBlank, Coins, Crown, GitBranch, GithubLogo, GitPullRequest, Globe, LockKey, Medal, Megaphone, Receipt, Trophy, UserCircle, Users, XLogo } from "@phosphor-icons/react";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/feedback/skeleton";
import { EmptyState, ErrorState } from "@/components/feedback/empty-state";
import { getLeaderboard, getResearcherRecord, type LeaderboardEntry, type ResearcherDisclosure } from "@/lib/data-source";
import { useAsync } from "@/lib/use-async";
import { formatNear, shortDate, shortHash } from "@/lib/format";
import { severityTone } from "@/lib/report-stages";
import { cn } from "@/lib/utils";
import { PublicLayout } from "@/pages/public-pages";

const rankStyle = ["text-[#d4a017]", "text-[#9ca3af]", "text-[#c2410c]"];

/** Gold, silver and bronze for the top three, a plain number after that. */
export function RankMark({ rank, className }: { rank: number; className?: string }) {
  const Icon = rank === 1 ? Crown : Medal;
  return rank <= 3
    ? <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06]", rankStyle[rank - 1], className)} aria-label={`Rank ${rank}`}><Icon size={20} weight="fill" /></span>
    : <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/[0.04] text-subtitle font-semibold tabular-nums text-muted-foreground", className)} aria-label={`Rank ${rank}`}>{rank}</span>;
}

function SeverityBadge({ severity }: { severity: LeaderboardEntry["highestSeverity"] }) {
  return severity ? <Badge color={severityTone[severity]} className="capitalize">{severity}</Badge> : <span className="text-muted-foreground">·</span>;
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-caption text-muted-foreground">{label}</p>
      <div className="text-subtitle font-medium tabular-nums">{children}</div>
    </div>
  );
}

function LeaderboardRow({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.45, bounce: 0, delay: Math.min(index * 0.04, 0.3) }}
    >
      <Link
        to={`/researchers/${entry.handle}`}
        className="card-hairline group grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 p-4 transition-shadow duration-200 hover:shadow-surface-4 focus-visible:outline-offset-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5"
      >
        <RankMark rank={entry.rank} />
        <div className="flex min-w-0 items-center gap-3">
          <ProfileAvatar size="lg" name={entry.displayName} seed={entry.avatarSeed} />
          <div className="min-w-0">
            <p className="truncate text-title font-semibold leading-tight tracking-tight">{entry.displayName}</p>
            <p className="truncate text-caption text-muted-foreground">@{entry.handle}</p>
          </div>
        </div>
        <dl className="col-span-2 grid grid-cols-4 gap-3 border-t border-border/60 pt-3 sm:col-span-1 sm:flex sm:items-center sm:gap-6 sm:border-0 sm:pt-0">
          <Stat label="Disclosures">{entry.disclosures}</Stat>
          <Stat label="Paid">{entry.paid}</Stat>
          <Stat label="Highest"><SeverityBadge severity={entry.highestSeverity} /></Stat>
          <Stat label="Earned"><span className="inline-flex items-center gap-1 font-semibold text-foreground"><Coins size={14} />{formatNear(entry.totalEarnedNear)}</span></Stat>
        </dl>
      </Link>
    </motion.li>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading the leaderboard">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="card-hairline flex items-center gap-4 p-5">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="size-11 rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/5" /></div>
          <Skeleton className="hidden h-8 w-48 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function LeaderboardPage() {
  const { data, error, loading, reload } = useAsync(getLeaderboard, []);
  const totalNear = data?.reduce((sum, e) => sum + e.totalEarnedNear, 0) ?? 0;
  const totalDisclosures = data?.reduce((sum, e) => sum + e.disclosures, 0) ?? 0;
  return (
    <PublicLayout>
      <div className="mb-8 space-y-2">
        <p className="eyebrow">Public record</p>
        <h1 className="flex items-center gap-2 text-[1.75rem] font-semibold tracking-tight"><Trophy size={26} /> Researcher leaderboard</h1>
        <p className="text-body text-muted-foreground">Researchers ranked by NEAR earned from fixed-and-paid reports. Only public disclosures count. Sealed reports, emails and wallets are never shown.</p>
      </div>
      {error ? <ErrorState message={error.message} onRetry={reload} />
        : loading ? <LeaderboardSkeleton />
        : !data?.length ? (
          <EmptyState icon={Trophy} title="No one is on the board yet"
            description="A researcher appears here once a report of theirs is fixed and paid, or unsealed publicly. Everything else stays sealed."
            action={<Button render={<Link to="/disclosures" />} leadingIcon={Megaphone}>Public disclosures</Button>} />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {[
                [Users, "Researchers", String(data.length)],
                [Megaphone, "Disclosures", String(totalDisclosures)],
                [Coins, "Paid out", formatNear(totalNear)],
              ].map(([Icon, label, value]) => {
                const I = Icon as typeof Users;
                return (
                  <div key={label as string} className="card-hairline p-3 sm:p-4">
                    <p className="flex items-center gap-1.5 text-caption text-muted-foreground"><I size={13} />{label as string}</p>
                    <p className="text-title font-semibold tabular-nums">{value as string}</p>
                  </div>
                );
              })}
            </div>
            <ol className="space-y-3">{data.map((e, i) => <LeaderboardRow key={e.handle} entry={e} index={i} />)}</ol>
          </div>
        )}
    </PublicLayout>
  );
}

const linkIcons = { github: GithubLogo, x: XLogo, website: Globe } as const;

function DisclosureTile({ d, index }: { d: ResearcherDisclosure; index: number }) {
  const paid = d.outcome === "fixed_and_paid";
  const date = d.timestamps.paidAt ?? d.timestamps.publishedAt ?? d.timestamps.listedAt;
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.45, bounce: 0, delay: Math.min(index * 0.05, 0.3) }}
      className="card-hairline flex flex-col p-5"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge color={severityTone[d.severity]} className="capitalize">{d.severity}</Badge>
        <Badge color={paid ? "green" : "gray"}>{paid ? "Fixed and paid" : "Disclosed"}</Badge>
      </div>
      <h3 className="mt-3 text-title font-semibold leading-snug tracking-tight">
        <Link to={`/disclosures/${d.id}`} className="hover:underline focus-visible:outline-offset-4">{d.title}</Link>
      </h3>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><GitBranch size={14} />{d.repo ?? d.target}</span>
        <span className="inline-flex items-center gap-1.5"><Coins size={14} />{formatNear(d.bountyNear)}</span>
        <span className="inline-flex items-center gap-1.5"><CalendarBlank size={14} />{paid ? "Paid" : "Published"} {shortDate(date)}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 pt-1">
        <Button variant="secondary" size="compact" render={<Link to={`/disclosures/${d.id}`} />}>Open disclosure</Button>
        {d.pullRequestUrl && <Button variant="secondary" size="compact" leadingIcon={GitPullRequest} trailingIcon={ArrowSquareOut} render={<a href={d.pullRequestUrl} target="_blank" rel="noreferrer" />}>Fix PR</Button>}
        {d.links.payoutTx && <Button variant="secondary" size="compact" leadingIcon={Receipt} trailingIcon={ArrowSquareOut} render={<a href={d.links.payoutTx} target="_blank" rel="noreferrer" title={d.payoutTxHash} />}>Payout {d.payoutTxHash ? shortHash(d.payoutTxHash, 4, 4) : ""}</Button>}
        {d.links.fundTx && <Button variant="ghost" size="compact" trailingIcon={ArrowSquareOut} render={<a href={d.links.fundTx} target="_blank" rel="noreferrer" title={d.fundTxHash} />}>Escrow tx</Button>}
      </div>
    </motion.li>
  );
}

export function ResearcherPage() {
  const { handle = "" } = useParams();
  const { data, error, loading, reload } = useAsync(() => getResearcherRecord(handle), [handle]);
  return (
    <PublicLayout>
      <Link to="/leaderboard" className="mb-6 inline-flex items-center gap-1.5 text-subtitle text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft size={14} /> Leaderboard
      </Link>
      {loading ? (
        <div className="space-y-6" aria-busy="true" aria-label="Loading the researcher">
          <div className="card-hairline flex gap-5 p-6"><Skeleton className="size-20 rounded-full" /><div className="flex-1 space-y-3"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-1/4" /><Skeleton className="h-4 w-2/3" /></div></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[72px] rounded-2xl" />)}</div>
          <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
        </div>
      ) : error?.message.includes("No researcher") ? (
        <EmptyState icon={UserCircle} title="No researcher with that handle" description="Check the address, or browse the leaderboard."
          action={<Button render={<Link to="/leaderboard" />} leadingIcon={Trophy}>Leaderboard</Button>} />
      ) : error || !data ? <ErrorState message={error?.message ?? "Not found."} onRetry={reload} />
      : (
        <div className="space-y-8">
          <section className="card-hairline flex flex-col gap-5 p-6 sm:flex-row">
            <ProfileAvatar size="xl" name={data.displayName} seed={data.avatarSeed} className="size-20" />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight">{data.displayName}</h1>
                  {data.rank && <Badge color={data.rank <= 3 ? "amber" : "gray"}><Trophy size={11} /> Rank #{data.rank}</Badge>}
                </div>
                <p className="text-body text-muted-foreground">@{data.handle}{data.joinedAt ? ` · joined ${shortDate(data.joinedAt)}` : ""}</p>
              </div>
              {data.bio && <p className="text-body">{data.bio}</p>}
              {data.skills.length > 0 && <div className="flex flex-wrap gap-1.5">{data.skills.map((s) => <Badge key={s} color="orange">{s}</Badge>)}</div>}
              <div className="flex flex-wrap gap-2">
                {(Object.keys(linkIcons) as (keyof typeof linkIcons)[]).filter((k) => data.links[k]).map((k) => (
                  <Button key={k} variant="secondary" size="compact" leadingIcon={linkIcons[k]} render={<a href={data.links[k]} target="_blank" rel="noopener noreferrer nofollow" />}>{k === "x" ? "X" : k === "github" ? "GitHub" : "Website"}</Button>
                ))}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card-hairline col-span-2 p-4 sm:col-span-1">
              <p className="flex items-center gap-1.5 text-caption text-muted-foreground"><Coins size={13} /> Total earned</p>
              <p className="text-[1.5rem] font-semibold leading-tight tabular-nums">{formatNear(data.totalEarnedNear)}</p>
            </div>
            {[["Disclosures", String(data.disclosures.length)], ["Fixed and paid", String(data.paid)]].map(([label, value]) => (
              <div key={label} className="card-hairline p-4"><p className="text-caption text-muted-foreground">{label}</p><p className="text-title font-semibold tabular-nums">{value}</p></div>
            ))}
            <div className="card-hairline p-4"><p className="text-caption text-muted-foreground">Highest severity</p><div className="pt-1"><SeverityBadge severity={data.highestSeverity} /></div></div>
          </div>

          <section className="space-y-4">
            <div><p className="eyebrow mb-1">Public record</p><h2 className="text-title font-semibold">Disclosures</h2></div>
            {data.disclosures.length === 0
              ? <EmptyState icon={LockKey} title="Nothing public yet" description={`${data.displayName} has not disclosed a report or been paid for a fix yet. Sealed reports are never shown.`} />
              : <ul className="grid gap-4 md:grid-cols-2">{data.disclosures.map((d, i) => <DisclosureTile key={d.id} d={d} index={i} />)}</ul>}
          </section>
        </div>
      )}
    </PublicLayout>
  );
}
