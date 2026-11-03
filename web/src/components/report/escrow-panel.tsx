import { useState } from "react";
import {
  Vault, GitPullRequest, ArrowsClockwise, HandCoins, ArrowUUpLeft, CheckCircle, Hourglass, WarningCircle, Coins, Timer,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { useToast } from "@/components/feedback/toast-provider";
import { daysUntil, formatNear, shortDate } from "@/lib/format";
import type { EscrowState, Report } from "@/lib/redline-types";

const mergeCopy: Record<EscrowState["mergeCheck"], { label: string; color: "gray" | "green" | "amber" | "red"; icon: typeof CheckCircle }> = {
  pending: { label: "Waiting for the pull request", color: "gray", icon: Hourglass },
  not_merged: { label: "Not merged yet", color: "amber", icon: Hourglass },
  merged: { label: "Merged into the default branch", color: "green", icon: CheckCircle },
  unknown: { label: "GitHub did not answer, will retry", color: "red", icon: WarningCircle },
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function EscrowPanel({ report }: { report: Report }) {
  const toast = useToast();
  const [escrow, setEscrow] = useState<EscrowState | undefined>(report.escrow);
  const [busy, setBusy] = useState<null | "fund" | "link" | "check" | "claim" | "refund">(null);
  const [prUrl, setPrUrl] = useState(escrow?.pullRequestUrl ?? "");

  async function run(kind: NonNullable<typeof busy>, pending: string, success: string, apply: () => void) {
    setBusy(kind);
    try {
      await toast.promise(wait(1400), { pending, success, error: "Transaction failed" });
      apply();
    } catch {
      /* toast already shown */
    } finally {
      setBusy(null);
    }
  }

  const amount = escrow?.amountNear ?? report.rewardNear;
  const isTeam = report.role === "team";

  if (!amount) {
    return (
      <Panel>
        <p className="text-body text-muted-foreground">
          No reward has been agreed yet. Once both sides sign the amount in the chat, the team can fund the escrow here.
        </p>
      </Panel>
    );
  }

  const merge = mergeCopy[escrow?.mergeCheck ?? "pending"];
  const MergeIcon = merge.icon;
  const expired = escrow ? daysUntil(escrow.expiresAt) <= 0 : false;
  const paid = report.stage === "paid" || report.stage === "published";

  return (
    <Panel>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-caption text-muted-foreground">Reward</p>
          <p className="text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums">{formatNear(amount)}</p>
        </div>
        <Badge color={paid ? "green" : escrow?.funded ? "accent" : "gray"}>{paid ? "Paid" : escrow?.funded ? "In escrow" : "Not funded"}</Badge>
      </div>

      {escrow?.funded && (
        <dl className="mt-5 space-y-2.5 text-body">
          <Row icon={<Timer size={15} />} label="Refund window" value={expired ? "Expired" : `Until ${shortDate(escrow.expiresAt)}`} />
          <Row icon={<Vault size={15} />} label="Contract" value={<span className="font-mono text-[12px]">{escrow.contractId}</span>} />
          <Row icon={<MergeIcon size={15} />} label="Merge check" value={<Badge color={merge.color}>{merge.label}</Badge>} />
        </dl>
      )}

      <div className="mt-5 space-y-3">
        {!escrow?.funded && isTeam && (
          <Button className="w-full" loading={busy === "fund"} leadingIcon={Coins}
            onClick={() => run("fund", "Funding escrow on testnet…", "Escrow funded", () => setEscrow({ amountNear: amount, funded: true, expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(), contractId: "escrow.redline.testnet", mergeCheck: "pending" }))}>
            {busy === "fund" ? "Funding…" : `Fund ${formatNear(amount)}`}
          </Button>
        )}
        {!escrow?.funded && !isTeam && <p className="text-caption text-muted-foreground">Waiting for the team to fund the escrow.</p>}

        {escrow?.funded && !paid && (
          <>
            <InputGroup>
              <InputField index={0} label="Fix pull request" icon={GitPullRequest} placeholder="https://github.com/owner/repo/pull/123" value={prUrl} onChange={setPrUrl} disabled={busy !== null} />
            </InputGroup>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" loading={busy === "link"} disabled={!prUrl.trim() || busy !== null}
                onClick={() => run("link", "Linking pull request…", "Pull request linked", () => setEscrow({ ...escrow, pullRequestUrl: prUrl, mergeCheck: "pending" }))}>
                Link PR
              </Button>
              <Button variant="secondary" loading={busy === "check"} leadingIcon={ArrowsClockwise} disabled={!escrow.pullRequestUrl || busy !== null}
                onClick={() => run("check", "Enclave is checking GitHub…", "Merge check complete", () => setEscrow({ ...escrow, mergeCheck: "not_merged" }))}>
                Check merge
              </Button>
            </div>
            {!isTeam && (
              <Button className="w-full" loading={busy === "claim"} leadingIcon={HandCoins} disabled={escrow.mergeCheck !== "merged" || busy !== null}
                onClick={() => run("claim", "Releasing payout…", "Payout sent to your wallet", () => setEscrow({ ...escrow }))}>
                Claim payout
              </Button>
            )}
            {isTeam && expired && (
              <Button className="w-full" variant="secondary" loading={busy === "refund"} leadingIcon={ArrowUUpLeft} disabled={busy !== null}
                onClick={() => run("refund", "Re-checking the pull request…", "Refund sent", () => setEscrow({ ...escrow, funded: false }))}>
                Refund escrow
              </Button>
            )}
          </>
        )}
        {paid && <p className="flex items-center gap-2 text-body text-success"><CheckCircle size={16} weight="fill" /> Released to the researcher after the merge was confirmed twice.</p>}
      </div>
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface-3 p-5 shadow-surface-2" aria-label="Escrow">
      <h2 className="mb-4 flex items-center gap-2 text-subtitle font-semibold"><Vault size={16} /> Escrow</h2>
      {children}
    </section>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-muted-foreground">{icon}{label}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  );
}
