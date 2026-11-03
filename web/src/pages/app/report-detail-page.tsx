import { useState } from "react";
import { ErrorBoundary } from "@/components/feedback/error-boundary";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, PencilSimpleLine, FileMd, FilePdf, Lock, Clock, ChatsCircle, ListChecks, FileText, Hash, Megaphone, ShieldCheck } from "@phosphor-icons/react";
import Tabs, { TabsItem } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportEditor } from "@/components/report/report-editor";
import { ReportEditForm } from "@/components/report/report-edit-form";
import { StageStepper } from "@/components/report/stage-stepper";
import { EscrowPanel } from "@/components/report/escrow-panel";
import { InvitePanel } from "@/components/report/invite-panel";
import { ReportKeyPanel } from "@/components/report/report-key-panel";
import { PublishPanel } from "@/components/report/publish-panel";
import { SealedChat } from "@/components/report/sealed-chat";
import { ActivityTimeline } from "@/components/report/activity-timeline";
import { ReportPageSkeleton } from "@/components/feedback/skeleton";
import { ErrorState } from "@/components/feedback/empty-state";
import { useToast } from "@/components/feedback/toast-provider";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { peopleOf } from "@/lib/report-people";
import { getReport } from "@/lib/data-source";
import { useAsync } from "@/lib/use-async";
import { exportMarkdown, exportPdf } from "@/lib/report-export";
import { daysUntil, relativeTime, shortDate, shortHash } from "@/lib/format";
import { severityTone, stageLabels, stageTone } from "@/lib/report-stages";
import type { Report } from "@/lib/redline-types";

export function ReportDetailPage() {
  const { id = "" } = useParams();
  const { data, error, loading, reload } = useAsync(() => getReport(id), [id]);

  if (loading) return <ReportPageSkeleton />;
  if (error || !data) return (
    <div className="space-y-4">
      <BackLink />
      <ErrorState message={error?.message ?? "Report not found."} onRetry={reload} />
    </div>
  );
  return <ErrorBoundary key={data.id} onRetry={reload}><ReportView initial={data} reload={reload} /></ErrorBoundary>;
}

function BackLink() {
  return (
    <Link to="/app" className="inline-flex items-center gap-1.5 text-subtitle text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft size={14} /> All reports
    </Link>
  );
}

export function ReportView({ initial, reload }: { initial: Report; reload: () => void }) {
  const [report, setReport] = useState(initial);
  const [tab, setTab] = useState(0);
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState<null | "md" | "pdf">(null);
  const toast = useToast();
  const left = daysUntil(report.disclosureDeadline);
  const people = peopleOf(report);
  const canEdit = report.role === "researcher" && !report.bodyLocked && report.stage !== "paid" && report.stage !== "fix_merged" && report.stage !== "published" && report.stage !== "refunded" ? true : false;

  async function doExport(kind: "md" | "pdf") {
    setExporting(kind);
    try {
      if (kind === "md") exportMarkdown(report.title, report.body);
      else await exportPdf(report.title, report.body);
      toast.show({ tone: "success", title: kind === "md" ? "Markdown downloaded" : "PDF dialog opened" });
    } catch {
      toast.show({ tone: "error", title: "Export failed", description: "Allow pop-ups and downloads, then try again." });
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <BackLink />
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge color={severityTone[report.severity]} className="capitalize">{report.severity}</Badge>
          <Badge color={stageTone[report.stage]}>{stageLabels[report.stage]}</Badge>
          <Badge color="gray"><Lock size={11} /> Sealed</Badge>
        </div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{report.title}</h1>
        <div className="flex flex-wrap items-center gap-3">
          {[people.researcher, people.team].map((person, i) =>
            person ? (
              <span key={i} className="inline-flex items-center gap-2 text-subtitle">
                <ProfileAvatar size="md" name={person.name} seed={person.seed} />
                <span className="leading-tight">
                  <span className="block font-medium">{person.name}</span>
                  <span className="block text-caption capitalize text-muted-foreground">{person.role === "team" ? "Security team" : "Researcher"}</span>
                </span>
              </span>
            ) : (
              <span key={i} className="inline-flex items-center gap-2 text-caption text-muted-foreground">
                <ProfileAvatar size="md" name="?" /> No team member has joined yet
              </span>
            ),
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-caption text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Clock size={14} /> Updated {relativeTime(report.updatedAt)}</span>
          <span className="inline-flex items-center gap-1.5"><Megaphone size={14} /> {left > 0 ? `Public ${shortDate(report.disclosureDeadline)} (${left}d)` : "Disclosure window open"}</span>
          <span className="inline-flex items-center gap-1.5 font-mono"><Hash size={14} /> {shortHash(report.contentHash)}</span>
        </div>
      </div>

      <div className="overflow-x-auto card-hairline p-4">
        <StageStepper current={report.stage} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pb-1">
            <Tabs selectedIndex={tab} onSelect={setTab} idPrefix="report-tabs">
              <TabsItem index={0} label="Report" icon={FileText} />
              <TabsItem index={1} label="Negotiation" icon={ChatsCircle} />
              <TabsItem index={2} label="Timeline" icon={ListChecks} />
            </Tabs>
            {tab === 0 && !editing && (
              <div className="flex items-center gap-2">
                {canEdit && <Button variant="secondary" size="compact" leadingIcon={PencilSimpleLine} onClick={() => setEditing(true)}>Edit report</Button>}
                <Button variant="secondary" size="compact" leadingIcon={FileMd} disabled={!!report.bodyLocked} loading={exporting === "md"} onClick={() => doExport("md")}>Export .md</Button>
                <Button variant="secondary" size="compact" leadingIcon={FilePdf} disabled={!!report.bodyLocked} loading={exporting === "pdf"} onClick={() => doExport("pdf")}>Export PDF</Button>
              </div>
            )}
          </div>

          {tab === 0 && editing && canEdit && (
            <ReportEditForm report={report} onCancel={() => setEditing(false)} onSaved={(next) => { setReport(next); setEditing(false); }} />
          )}
          {tab === 0 && !editing && (
            <div>
              {report.bodyLocked
                ? <div className="flex items-center gap-2 rounded-2xl bg-surface-2 p-6 text-body text-muted-foreground"><Lock size={16} /> Encrypted. Unlocking automatically with your account.</div>
                : <ReportEditor value={report.body} editable={false} />}
            </div>
          )}
          {tab === 1 && <SealedChat report={report} onChange={setReport} />}
          {tab === 2 && <div className="card-hairline p-3"><ActivityTimeline events={report.timeline} /></div>}
        </div>

        <div className="space-y-4">
          <ReportKeyPanel report={report} onUnlocked={reload} />
          <EscrowPanel report={report} onChange={setReport} />
          <InvitePanel report={report} onChange={setReport} />
          <PublishPanel report={report} onChange={setReport} />
          <div className="flex items-start gap-3 rounded-2xl bg-surface-2 p-4 text-caption text-muted-foreground">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-foreground" />
            <p>The body is encrypted in your browser. Only the enclave can unseal the key, and only for people it has verified.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
