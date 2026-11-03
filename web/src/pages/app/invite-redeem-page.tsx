import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Lock, SignIn, ShieldCheck, WarningOctagon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/feedback/empty-state";
import { Skeleton } from "@/components/feedback/skeleton";
import { useToast } from "@/components/feedback/toast-provider";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { previewInvite, redeemInvite } from "@/lib/data-source";
import { useAsync } from "@/lib/use-async";
import { severityTone } from "@/lib/report-stages";

/** Where an invite link lands. Shows who invited you and what, then joins on one click. */
export function InviteRedeemPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => previewInvite(token), [token]);
  const [joining, setJoining] = useState(false);

  async function join() {
    setJoining(true);
    try {
      const report = await redeemInvite(token);
      toast.show({ tone: "success", title: "You joined the report" });
      navigate(`/app/reports/${report.id}`, { replace: true });
    } catch (e) {
      toast.show({ tone: "error", title: "Could not join", description: e instanceof Error ? e.message : undefined });
      setJoining(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-10">
      {loading ? (
        <div className="space-y-3 rounded-2xl bg-surface-3 p-6 shadow-surface-2" aria-busy="true" aria-label="Loading invite">
          <Skeleton className="h-5 w-24" /><Skeleton className="h-7 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-9 w-full" />
        </div>
      ) : error ? (
        error.message.toLowerCase().includes("not found") || /404/.test(error.message)
          ? <EmptyState icon={WarningOctagon} title="This invite is no longer valid" description="The researcher may have withdrawn it, or the link is wrong. Ask them for a new one."
              action={<Button variant="secondary" render={<Link to="/app" />}>Go to your reports</Button>} />
          : <ErrorState message={error.message} onRetry={reload} />
      ) : data && (
        <div className="space-y-5 rounded-2xl bg-surface-3 p-6 shadow-surface-2">
          <div className="flex items-center gap-3">
            <ProfileAvatar size="lg" name={data.from} />
            <p className="text-subtitle"><span className="font-medium">{data.from}</span> invited you to a sealed report</p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <Badge color={severityTone[data.severity]} className="capitalize">{data.severity}</Badge>
            <h1 className="text-title font-semibold leading-snug tracking-tight">{data.title}</h1>
          </div>
          <p className="flex items-start gap-2 text-body text-muted-foreground"><Lock size={16} className="mt-0.5 shrink-0" /> The text is encrypted. Your link carries the key, so it opens here after you join.</p>
          {data.taken ? (
            <p className="text-body text-muted-foreground">Another team account already joined this report.</p>
          ) : data.alreadyJoined ? (
            <Button className="w-full" leadingIcon={ShieldCheck} render={<Link to={`/app/reports/${data.reportId}`} />}>Open the report</Button>
          ) : (
            <Button className="w-full" leadingIcon={SignIn} loading={joining} onClick={() => void join()}>Join as the security team</Button>
          )}
        </div>
      )}
    </div>
  );
}
