import { useState } from "react";
import {
  EnvelopeSimple, XLogo, TelegramLogo, GithubLogo, PaperPlaneTilt, UserPlus, LinkSimple, Check, UserMinus, type Icon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useToast } from "@/components/feedback/toast-provider";
import { createInvite, revokeInvite } from "@/lib/data-source";
import { getReportKey, inviteLink } from "@/lib/report-key-vault";
import type { InviteRecipient, Report } from "@/lib/redline-types";

const channelMeta: Record<InviteRecipient["channel"], { label: string; icon: Icon; placeholder: string }> = {
  email: { label: "Email", icon: EnvelopeSimple, placeholder: "security@company.com" },
  x: { label: "X", icon: XLogo, placeholder: "@handle" },
  telegram: { label: "Telegram", icon: TelegramLogo, placeholder: "@username" },
  github: { label: "GitHub", icon: GithubLogo, placeholder: "username or organisation" },
};

const statusColor = { pending: "amber", redeemed: "green", expired: "gray", revoked: "red" } as const;

export function InvitePanel({ report, onChange }: { report: Report; onChange: (next: Report) => void }) {
  const invites = report.invites;
  const canInvite = report.role === "researcher";
  const [channel, setChannel] = useState<InviteRecipient["channel"]>("email");
  const [handle, setHandle] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const toast = useToast();

  async function send() {
    const value = handle.trim();
    if (!value) return;
    setSending(true);
    try {
      const next = await toast.promise(createInvite(report.id, channel, value), {
        pending: "Creating invite…", success: "Invite link ready", error: "Could not create the invite",
      });
      onChange(next);
      setHandle("");
    } catch {
      /* toast shown */
    } finally {
      setSending(false);
    }
  }

  async function withdraw(invite: InviteRecipient) {
    if (confirming !== invite.id) {
      setConfirming(invite.id);
      setTimeout(() => setConfirming((c) => (c === invite.id ? null : c)), 4000);
      return;
    }
    setConfirming(null);
    setWithdrawing(invite.id);
    try {
      onChange(await toast.promise(revokeInvite(report.id, invite.id), {
        pending: "Withdrawing access…", success: "Access withdrawn", error: "Could not withdraw access",
      }));
    } catch {
      /* toast shown */
    } finally {
      setWithdrawing(null);
    }
  }

  async function copy(invite: InviteRecipient) {
    if (!invite.token) return;
    try {
      await navigator.clipboard.writeText(inviteLink(invite.token, getReportKey(report.id)));
      setCopied(invite.id);
      setTimeout(() => setCopied((c) => (c === invite.id ? null : c)), 1800);
    } catch {
      toast.show({ tone: "error", title: "Could not copy", description: "Your browser blocked clipboard access." });
    }
  }

  return (
    <section className="rounded-2xl bg-surface-3 p-5 shadow-surface-2" aria-label="Invites">
      <h2 className="mb-4 flex items-center gap-2 text-subtitle font-semibold"><UserPlus size={16} /> Invited people</h2>
      {invites.length === 0 ? (
        <p className="text-body text-muted-foreground">Nobody has been invited yet. Invite the security contact of the affected project.</p>
      ) : (
        <ul className="space-y-1">
          {invites.map((invite) => {
            const meta = channelMeta[invite.channel];
            return (
              <li key={invite.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-hover">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06]"><meta.icon size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-subtitle font-medium">{invite.handle}</p>
                  <p className="text-caption text-muted-foreground">{meta.label}</p>
                </div>
                {invite.status === "pending" && invite.token && (
                  <Button variant="secondary" size="compact" leadingIcon={copied === invite.id ? Check : LinkSimple} onClick={() => void copy(invite)}>
                    {copied === invite.id ? "Copied" : "Copy link"}
                  </Button>
                )}
                {canInvite && invite.status !== "revoked" && (
                  <Button
                    variant={confirming === invite.id ? "primary" : "ghost"} size="compact" leadingIcon={UserMinus}
                    loading={withdrawing === invite.id} onClick={() => void withdraw(invite)}
                    aria-label={`Withdraw access for ${invite.handle}`}
                  >
                    {confirming === invite.id ? "Confirm" : "Withdraw"}
                  </Button>
                )}
                <Badge color={statusColor[invite.status]} className="capitalize">{invite.status}</Badge>
              </li>
            );
          })}
        </ul>
      )}
      {canInvite && (
        <form className="mt-4 space-y-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <Select value={channel} onValueChange={(v) => setChannel(v as InviteRecipient["channel"])}>
            <SelectTrigger placeholder="Channel" icon={channelMeta[channel].icon} />
            <SelectContent>
              {(Object.keys(channelMeta) as InviteRecipient["channel"][]).map((key, i) => (
                <SelectItem key={key} index={i} value={key} icon={channelMeta[key].icon}>{channelMeta[key].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <InputGroup>
            <InputField index={0} label="Recipient" placeholder={channelMeta[channel].placeholder} value={handle} onChange={setHandle} disabled={sending} />
          </InputGroup>
          <Button type="submit" className="w-full" loading={sending} leadingIcon={PaperPlaneTilt} disabled={!handle.trim()}>
            {sending ? "Creating…" : "Create invite link"}
          </Button>
          <p className="text-caption text-muted-foreground">Share the link privately. It carries the report key after the # sign, which browsers never send to a server. Anyone with the link can join, so send it only to the person you mean.</p>
        </form>
      )}
    </section>
  );
}
