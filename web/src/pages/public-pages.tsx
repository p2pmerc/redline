import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Megaphone, LockKey, FileMd, FilePdf, ShieldCheck, ArrowSquareOut, Compass, HouseLine, Trophy } from "@phosphor-icons/react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/landing/cta-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportCard } from "@/components/report/report-card";
import { ReportEditor } from "@/components/report/report-editor";
import { ActivityTimeline } from "@/components/report/activity-timeline";
import { ReportCardSkeleton, ReportPageSkeleton } from "@/components/feedback/skeleton";
import { EmptyState, ErrorState } from "@/components/feedback/empty-state";
import { getPublicDisclosure, listPublicDisclosures } from "@/lib/data-source";
import { useAsync } from "@/lib/use-async";
import { exportMarkdown, exportPdf } from "@/lib/report-export";
import { formatNear, shortDate, shortHash } from "@/lib/format";
import { severityTone } from "@/lib/report-stages";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-glow flex min-h-dvh flex-col bg-background">
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
        <p className="eyebrow">Public record</p>
        <h1 className="flex items-center gap-2 text-[1.75rem] font-semibold tracking-tight"><Megaphone size={26} /> Public disclosures</h1>
        <p className="text-body text-muted-foreground">Reports that were unsealed after their window closed, or fixed and paid through escrow. Sealed reports are never listed.</p>
        <Button variant="secondary" size="compact" leadingIcon={Trophy} render={<Link to="/leaderboard" />}>Researcher leaderboard</Button>
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
            <section className="card-hairline p-3">
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
