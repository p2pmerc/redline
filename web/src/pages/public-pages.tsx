import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { Link, useParams } from "react-router-dom";
import { GithubLogo, XLogo, Globe, ArrowLeft, Megaphone, LockKey, UserCircle, FileMd, FilePdf, ShieldCheck, ArrowSquareOut, Compass, HouseLine } from "@phosphor-icons/react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/landing/cta-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportCard } from "@/components/report/report-card";
import { ReportEditor } from "@/components/report/report-editor";
import { ActivityTimeline } from "@/components/report/activity-timeline";
import { ReportCardSkeleton, ReportPageSkeleton } from "@/components/feedback/skeleton";
import { EmptyState, ErrorState } from "@/components/feedback/empty-state";
import { getPublicDisclosure, getPublicResearcher, listPublicDisclosures } from "@/lib/data-source";
import { useAsync } from "@/lib/use-async";
import { exportMarkdown, exportPdf } from "@/lib/report-export";
import { formatNear, shortDate, shortHash } from "@/lib/format";
import { severityTone } from "@/lib/report-stages";

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function DisclosuresPage() {
  const { data, error, loading, reload } = useAsync(listPublicDisclosures, []);
  return (
    <PublicLayout>
      <div className="mb-8 space-y-2">
        <h1 className="flex items-center gap-2 text-[1.75rem] font-semibold tracking-tight"><Megaphone size={26} /> Public disclosures</h1>
        <p className="text-body text-muted-foreground">Reports that were unsealed after their window closed, or fixed and paid through escrow. Sealed reports are never listed.</p>
      </div>
      {error ? <ErrorState message={error.message} onRetry={reload} />
        : loading ? <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <ReportCardSkeleton key={i} />)}</div>
        : !data?.length ? <EmptyState icon={Megaphone} title="Nothing public yet" description="A report appears here once its researcher unseals it, or once its fix is merged and the bounty is paid. Everything else stays sealed."
          action={<Button render={<Link to="/app" />} leadingIcon={LockKey}>File a sealed report</Button>} />
        : <div className="grid gap-4 md:grid-cols-2">{data.map((r, i) => <ReportCard key={r.id} report={r} index={i} to={`/disclosures/${r.id}`} />)}</div>}
    </PublicLayout>
  );
}

export function DisclosureDetailPage() {
  const { id = "" } = useParams();
  const { data, error, loading, reload } = useAsync(() => getPublicDisclosure(id), [id]);
  return (
    <PublicLayout>
      <Link to="/disclosures" className="mb-6 inline-flex items-center gap-1.5 text-subtitle text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft size={14} /> All disclosures
      </Link>
      {loading ? <ReportPageSkeleton />
        : error || !data ? <ErrorState message={error?.message ?? "Not found."} onRetry={reload} />
        : (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge color={severityTone[data.severity]} className="capitalize">{data.severity}</Badge>
                {data.escrow ? <Badge color="green"><ShieldCheck size={11} /> Fixed and paid</Badge> : <Badge color="gray"><ShieldCheck size={11} /> Disclosed</Badge>}
              </div>
              <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{data.title}</h1>
              {data.researcherHandle ? (
                <Link to={`/researchers/${data.researcherHandle}`} className="inline-flex items-center gap-2 text-subtitle hover:underline">
                  <ProfileAvatar size="md" name={data.researcherName ?? data.researcherHandle} seed={data.researcherSeed} />
                  <span className="font-medium">{data.researcherName}</span>
                  <span className="text-muted-foreground">@{data.researcherHandle}</span>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-2 text-subtitle">
                  <ProfileAvatar size="md" name="Researcher" seed={data.researcherSeed} />
                  <span className="font-medium">Researcher</span>
                </span>
              )}
              <p className="text-caption text-muted-foreground">
                {data.target} · {data.bodyPublished ? "published" : "paid"} {shortDate(data.updatedAt)} · reward {formatNear(data.rewardNear)} · body hash <span className="font-mono">{shortHash(data.contentHash)}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {data.bodyPublished && <Button variant="secondary" size="compact" leadingIcon={FileMd} onClick={() => exportMarkdown(data.title, data.body)}>Export .md</Button>}
                {data.bodyPublished && <Button variant="secondary" size="compact" leadingIcon={FilePdf} onClick={() => void exportPdf(data.title, data.body)}>Export PDF</Button>}
                {data.escrow?.pullRequestUrl && (
                  <Button variant="secondary" size="compact" trailingIcon={ArrowSquareOut} render={<a href={data.escrow.pullRequestUrl} target="_blank" rel="noreferrer" />}>Fix pull request</Button>
                )}
              </div>
            </div>
            {data.bodyPublished ? <ReportEditor value={data.body} editable={false} />
              : <EmptyState icon={LockKey} title="The write-up is still sealed" description={data.summary || "The researcher has not unsealed this report. The fix was merged and the payout is on-chain below."} />}
            <section className="rounded-2xl bg-surface-3 p-3 shadow-surface-2">
              <h2 className="px-2 py-2 text-subtitle font-semibold">On-chain evidence</h2>
              <ActivityTimeline events={data.timeline} />
            </section>
          </div>
        )}
    </PublicLayout>
  );
}

export function NotFoundPage() {
  return (
    <PublicLayout>
      <EmptyState icon={Compass} title="Page not found" description="That address does not lead anywhere in Redline."
        action={<Button render={<Link to="/" />} leadingIcon={HouseLine}>Back home</Button>} />
    </PublicLayout>
  );
}

const linkIcons = { github: GithubLogo, x: XLogo, website: Globe } as const;

export function ResearcherPage() {
  const { handle = "" } = useParams();
  const { data, error, loading, reload } = useAsync(() => getPublicResearcher(handle), [handle]);
  return (
    <PublicLayout>
      {loading ? (
        <div className="space-y-6" aria-busy="true">
          <div className="h-40 animate-pulse rounded-2xl bg-surface-3 shadow-surface-2" />
          <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <ReportCardSkeleton key={i} />)}</div>
        </div>
      ) : error?.message.includes("No researcher") ? (
        <EmptyState icon={UserCircle} title="No researcher with that handle" description="Check the address, or browse the public disclosures."
          action={<Button render={<Link to="/disclosures" />} leadingIcon={Megaphone}>Public disclosures</Button>} />
      ) : error || !data ? <ErrorState message={error?.message ?? "Not found."} onRetry={reload} />
      : (
        <div className="space-y-8">
          <section className="flex flex-col gap-5 rounded-2xl bg-surface-3 p-6 shadow-surface-2 sm:flex-row">
            <ProfileAvatar size="xl" name={data.profile.displayName} seed={data.profile.avatarSeed} className="size-20" />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight">{data.profile.displayName}</h1>
                <p className="text-body text-muted-foreground">@{data.profile.handle}{data.profile.joinedAt ? ` · joined ${shortDate(data.profile.joinedAt)}` : ""}</p>
              </div>
              {data.profile.bio && <p className="text-body">{data.profile.bio}</p>}
              {data.profile.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">{data.profile.skills.map((s) => <Badge key={s} color="orange">{s}</Badge>)}</div>
              )}
              <div className="flex flex-wrap gap-2">
                {(Object.keys(linkIcons) as (keyof typeof linkIcons)[]).filter((k) => data.profile.links[k]).map((k) => {
                  const Icon = linkIcons[k];
                  return <Button key={k} variant="secondary" size="compact" leadingIcon={Icon} render={<a href={data.profile.links[k]} target="_blank" rel="noopener noreferrer nofollow" />}>{k === "x" ? "X" : k === "github" ? "GitHub" : "Website"}</Button>;
                })}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Public reports", String(data.stats.reports)],
              ["Fixed and paid", String(data.stats.paid)],
              ["Disclosed", String(data.stats.disclosed)],
              ["Earned", formatNear(data.stats.totalPaidNear)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-surface-3 p-4 shadow-surface-2">
                <p className="text-caption text-muted-foreground">{label}</p>
                <p className="text-title font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          <section className="space-y-4">
            <h2 className="text-title font-semibold">Disclosed and paid reports</h2>
            {data.reports.length === 0
              ? <EmptyState icon={LockKey} title="Nothing public yet" description={`${data.profile.displayName} has not disclosed a report or been paid for a fix yet. Sealed reports are never shown.`} />
              : <div className="grid gap-4 md:grid-cols-2">{data.reports.map((r, i) => <ReportCard key={r.id} report={r} index={i} to={`/disclosures/${r.id}`} />)}</div>}
          </section>
        </div>
      )}
    </PublicLayout>
  );
}
