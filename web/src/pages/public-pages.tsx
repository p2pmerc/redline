import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Megaphone, FileMd, FilePdf, ShieldCheck, ArrowSquareOut, Compass, HouseLine } from "@phosphor-icons/react";
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

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">{children}</main>
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
        <p className="text-body text-muted-foreground">Reports that were fixed, paid and then unsealed, each with its on-chain evidence.</p>
      </div>
      {error ? <ErrorState message={error.message} onRetry={reload} />
        : loading ? <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <ReportCardSkeleton key={i} />)}</div>
        : !data?.length ? <EmptyState icon={Megaphone} title="Nothing published yet" description="Disclosures appear here after their window closes." />
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
                <Badge color="green"><ShieldCheck size={11} /> Fixed and paid</Badge>
              </div>
              <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{data.title}</h1>
              <p className="text-caption text-muted-foreground">
                {data.target} · published {shortDate(data.updatedAt)} · reward {formatNear(data.rewardNear)} · body hash <span className="font-mono">{shortHash(data.contentHash)}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="compact" leadingIcon={FileMd} onClick={() => exportMarkdown(data.title, data.body)}>Export .md</Button>
                <Button variant="secondary" size="compact" leadingIcon={FilePdf} onClick={() => void exportPdf(data.title, data.body)}>Export PDF</Button>
                {data.escrow?.pullRequestUrl && (
                  <Button variant="secondary" size="compact" trailingIcon={ArrowSquareOut} render={<a href={data.escrow.pullRequestUrl} target="_blank" rel="noreferrer" />}>Fix pull request</Button>
                )}
              </div>
            </div>
            <ReportEditor value={data.body} editable={false} />
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
