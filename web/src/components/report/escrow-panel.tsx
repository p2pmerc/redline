import { AccountChip } from "@/components/ui/account-chip";
import { Link } from "react-router-dom";
import { useState } from "react";
import {
  Vault, GitPullRequest, ArrowsClockwise, HandCoins, ArrowUUpLeft, CheckCircle, Hourglass, WarningCircle, Coins, Timer, Signature, GitBranch, Flask, GithubLogo,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { useToast } from "@/components/feedback/toast-provider";
import { acceptTerms, bindPayoutAccount, checkMerge, claimPayout, confirmPullRequest, fundEscrow, linkPullRequest, proposeTerms, refundEscrow } from "@/lib/data-source";
import { daysUntil, formatNear, shortDate } from "@/lib/format";
import type { EscrowState, Report } from "@/lib/redline-types";

const mergeCopy: Record<EscrowState["mergeCheck"], { label: string; color: "gray" | "green" | "amber" | "red"; icon: typeof CheckCircle }> = {
  pending: { label: "Waiting for the pull request", color: "gray", icon: Hourglass },
  not_merged: { label: "Not merged yet", color: "amber", icon: Hourglass },
  merged: { label: "Merged into the default branch", color: "green", icon: CheckCircle },
  unknown: { label: "GitHub did not answer, will retry", color: "red", icon: WarningCircle },
};

type Busy = null | "payout" | "propose" | "accept" | "fund" | "link" | "confirm" | "check" | "claim" | "refund";

export function EscrowPanel({ report, onChange }: { report: Report; onChange: (next: Report) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<Busy>(null);
  const [prUrl, setPrUrl] = useState(report.escrow?.pullRequestUrl ?? "");
  const [amount, setAmount] = useState(report.terms ? String(report.terms.amountNear) : "");
  const [repo, setRepo] = useState(report.terms?.repo ?? report.repo ?? "");

  const isTeam = report.role === "team";
  const escrow = report.escrow;
  const paid = report.stage === "paid" || (report.stage === "published" && !!escrow && !escrow.funded && report.rewardNear !== undefined && escrow.mergeCheck === "merged");
  const refunded = report.stage === "refunded";
  const confirmed = report.stage === "fix_merged";
  const expired = escrow ? daysUntil(escrow.expiresAt) <= 0 : false;
  const funded = !!escrow?.funded;

  async function run(kind: Exclude<Busy, null>, pending: string, success: string, action: () => Promise<Report>) {
    setBusy(kind);
    try {
      const next = await toast.promise(action(), { pending, success, error: "That did not go through" });
      onChange(next);
    } catch {
      /* the toast already explains */
    } finally {
      setBusy(null);
    }
  }

  const amountValue = Number(amount);
  const repoOk = /^[\w.-]+\/[\w.-]+$/.test(repo.trim());
  const merge = mergeCopy[escrow?.mergeCheck ?? "pending"];
  const MergeIcon = merge.icon;

  return (
    <Panel preview={escrow?.mode === "preview"}>
      {escrow || report.terms ? (
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
          <div>
            <p className="text-caption text-muted-foreground">Reward</p>
            <p className="text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums">{formatNear(escrow?.amountNear ?? report.terms?.amountNear)}</p>
          </div>
          <Badge color={paid ? "green" : refunded ? "gray" : funded ? "accent" : report.terms?.accepted ? "amber" : "gray"}>
            {paid ? "Paid" : refunded ? "Refunded" : funded ? "In escrow" : report.terms?.accepted ? "Agreed, not funded" : "Proposed"}
          </Badge>
        </div>
      ) : null}

      {report.payoutAccount && (
        <dl className="mt-5 space-y-2.5 text-body">
          <Row icon={<HandCoins size={15} />} label="Pays to" value={<AccountChip account={report.payoutAccount} />} />
        </dl>
      )}

      {escrow && !refunded && (
        <dl className="mt-5 space-y-2.5 text-body">
          <Row icon={<Timer size={15} />} label="Refund window" value={expired ? "Expired" : `Until ${shortDate(escrow.expiresAt)}`} />
          <Row icon={<Vault size={15} />} label="Ledger" value={<span className="text-[12px]">{escrow.contractId}</span>} />
          <Row icon={<MergeIcon size={15} />} label="Merge check" value={<Badge color={merge.color}>{merge.label}</Badge>} />
        </dl>
      )}

      <div className="mt-5 space-y-3">
        {/* 1. the team proposes a reward */}
        {!escrow && !report.terms?.accepted && isTeam && (
          <>
            <InputGroup>
              <InputField index={0} label="Reward in NEAR" icon={Coins} placeholder="5" value={amount} onChange={setAmount} disabled={busy !== null} inputMode="decimal" />
              <InputField index={1} label="Repository for the fix" icon={GitBranch} placeholder="owner/name" value={repo} onChange={setRepo} disabled={busy !== null} error={repo && !repoOk ? "Use the form owner/name" : undefined} />
            </InputGroup>
            <Button className="w-full" leadingIcon={Signature} loading={busy === "propose"} disabled={!(amountValue > 0) || !repoOk || busy !== null}
              onClick={() => run("propose", "Proposing terms…", "Terms proposed", () => proposeTerms(report.id, amountValue, repo.trim()))}>
              {report.terms ? "Replace proposal" : "Propose reward"}
            </Button>
          </>
        )}
        {!escrow && !report.terms && !isTeam && (
          <p className="text-body text-muted-foreground">No reward has been proposed yet. The security team proposes one after you talk in the chat.</p>
        )}

        {/* 2. the researcher accepts */}
        {report.terms && !report.terms.accepted && !isTeam && (
          <Button className="w-full" leadingIcon={Signature} loading={busy === "accept"} disabled={busy !== null}
            onClick={() => run("accept", "Signing the terms…", "Terms accepted", () => acceptTerms(report.id))}>
            Accept {formatNear(report.terms.amountNear)} for {report.terms.repo}
          </Button>
        )}
        {report.terms && !report.terms.accepted && isTeam && <p className="text-caption text-muted-foreground">Waiting for the researcher to accept. Proposing again replaces these terms.</p>}

        {/* the reward goes to the researcher's own wallet, bound on chain before funding */}
        {!escrow && !report.payoutAccount && !isTeam && report.stage !== "paid" && (
          <div className="space-y-2 rounded-xl bg-[color-mix(in_srgb,var(--fluid-accent)_10%,var(--background))] p-3">
            <p className="text-body font-medium">Set where you get paid</p>
            <p className="text-caption text-muted-foreground">Funding stays blocked until your payout NEAR account is bound to this report. Add it to your profile, then bind it here.</p>
            <div className="flex flex-wrap gap-2">
              <Link to="/app/settings" className="inline-flex items-center rounded-full bg-surface-3 px-3 py-1.5 text-caption font-medium shadow-surface-2">Open profile settings</Link>
              <Button size="compact" variant="secondary" loading={busy === "payout"} disabled={busy !== null}
                onClick={() => run("payout", "Binding your payout account…", "Payout account bound", () => bindPayoutAccount(report.id))}>
                Bind my profile account
              </Button>
            </div>
          </div>
        )}
        {report.terms?.accepted && !escrow && isTeam && !report.payoutAccount && (
          <p className="text-caption text-muted-foreground">Funding is blocked until the researcher sets a payout NEAR account for this report. They have been asked to.</p>
        )}

        {/* 3. the team funds */}
        {report.terms?.accepted && !escrow && isTeam && (
          <Button className="w-full" loading={busy === "fund"} leadingIcon={Coins} disabled={busy !== null || !report.payoutAccount}
            onClick={() => run("fund", "Funding the escrow…", "Escrow funded", () => fundEscrow(report.id))}>
            Fund {formatNear(report.terms.amountNear)}
          </Button>
        )}
        {report.terms?.accepted && !escrow && !isTeam && <p className="text-caption text-muted-foreground">Terms are signed. Waiting for the team to fund the escrow.</p>}

        {/* 4. team submits fix PR → researcher confirms → check / claim */}
        {funded && (
          <>
            {isTeam && !escrow?.prConfirmed && !confirmed && (
              <>
                <InputGroup>
                  <InputField index={0} label="Fix pull request" icon={GitPullRequest} placeholder={`https://github.com/${report.repo ?? "owner/repo"}/pull/123`} value={prUrl} onChange={setPrUrl} disabled={busy !== null} />
                </InputGroup>
                <Button variant="secondary" className="w-full" loading={busy === "link"} disabled={!prUrl.trim() || busy !== null}
                  onClick={() => run("link", "Submitting pull request…", "Pull request submitted", () => linkPullRequest(report.id, prUrl.trim()))}>
                  Submit fix PR
                </Button>
              </>
            )}
            {!isTeam && !escrow?.pullRequestUrl && !confirmed && (
              <p className="text-caption text-muted-foreground">Waiting for the team to submit the fix pull request.</p>
            )}
            {escrow?.pullRequestUrl && (
              <p className="break-all text-caption text-muted-foreground">
                <GithubLogo size={14} className="mr-1 inline-block align-[-2px]" aria-hidden />Fix: {escrow.pullRequestUrl}
                {escrow.prConfirmed || confirmed ? (report.githubLogin ? ` · @${report.githubLogin}` : " · confirmed") : " · awaiting confirmation"}
              </p>
            )}
            {!isTeam && !!escrow?.pullRequestUrl && !escrow.prConfirmed && !confirmed && (
              <Button className="w-full" loading={busy === "confirm"} leadingIcon={Signature} disabled={busy !== null}
                onClick={() => run("confirm", "Confirming pull request…", "Pull request confirmed", () => confirmPullRequest(report.id))}>
                Confirm this fix PR
              </Button>
            )}
            {isTeam && !!escrow?.pullRequestUrl && !escrow.prConfirmed && !confirmed && (
              <p className="text-caption text-muted-foreground">Waiting for the researcher to confirm this pull request. Once confirmed it is locked.</p>
            )}

            {!confirmed && escrow?.prConfirmed && <p className="text-caption text-muted-foreground">Payout is automatic: once this pull request is merged by @{report.githubLogin ?? "the expected author"}, the escrow pays out within a few minutes.</p>}
            {!confirmed && (
              <Button variant="secondary" className="w-full" loading={busy === "check"} leadingIcon={ArrowsClockwise} disabled={!escrow?.prConfirmed || busy !== null}
                onClick={() => run("check", "Checking GitHub…", "Merge check complete", () => checkMerge(report.id))}>
                Check merge
              </Button>
            )}
            {confirmed && !isTeam && (
              <Button className="w-full" loading={busy === "claim"} leadingIcon={HandCoins} disabled={busy !== null}
                onClick={() => run("claim", "Checking the merge again…", "Reward released", () => claimPayout(report.id))}>
                Claim reward
              </Button>
            )}
            {confirmed && isTeam && <p className="text-caption text-muted-foreground">The merge is confirmed. The researcher can claim, after one more check.</p>}
            {isTeam && expired && (
              <Button className="w-full" variant="secondary" loading={busy === "refund"} leadingIcon={ArrowUUpLeft} disabled={busy !== null}
                onClick={() => run("refund", "Re-checking the pull request…", "Refund processed", () => refundEscrow(report.id))}>
                Refund escrow
              </Button>
            )}
          </>
        )}
        {paid && <p className="flex items-center gap-2 text-body text-success"><CheckCircle size={16} weight="fill" /> Released after the merge was confirmed twice.</p>}
        {refunded && <p className="flex items-center gap-2 text-body text-muted-foreground"><ArrowUUpLeft size={16} /> Returned to the team after expiry.</p>}
      </div>
    </Panel>
  );
}

function Panel({ children, preview }: { children: React.ReactNode; preview: boolean }) {
  return (
    <section className="card-hairline p-5" aria-label="Escrow">
      <h2 className="mb-4 flex items-center gap-2 text-subtitle font-semibold">
        <Vault size={16} /> Escrow
        {preview && <Badge color="gray" className="ml-auto"><Flask size={11} /> Preview ledger</Badge>}
      </h2>
      {children}
    </section>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">{icon}{label}</dt>
      <dd className="min-w-0 break-all text-right">{value}</dd>
    </div>
  );
}
