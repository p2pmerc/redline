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

const deliveryLabel: Record<NonNullable<InviteRecipient["delivery"]>["state"], string> = {
  idle: "Not sent",
  sending: "Sending…",
  sent: "Email sent",
  failed: "Send failed",
  ready: "Ready to DM",
};

const deliveryColor: Record<NonNullable<InviteRecipient["delivery"]>["state"], "gray" | "amber" | "green" | "red"> = {
  idle: "gray",
  sending: "amber",
  sent: "green",
  failed: "red",
  ready: "amber",
};

function stripAt(handle: string) {
  return handle.trim().replace(/^@/, "");
}

function dmUrl(invite: InviteRecipient, url: string): string | null {
  const h = stripAt(invite.handle);
  if (!h) return null;
  if (invite.channel === "x") {
    return `https://x.com/messages/compose?text=${encodeURIComponent(`@${h} You're invited to a sealed Redline report. Open this private link (do not forward): ${url}`)}`;
  }
  if (invite.channel === "telegram") {
    return `https://t.me/${encodeURIComponent(h)}?text=${encodeURIComponent(`You're invited to a sealed Redline report. Open this private link (do not forward):\n${url}`)}`;
  }
  return null;
}

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
      const key = getReportKey(report.id);
      const next = await toast.promise(createInvite(report.id, channel, value, key), {
        pending: channel === "email" ? "Sending invite email…" : "Creating invite…",
        success: channel === "email" ? "Invite email sent (or queued)" : "Invite ready — open Send as DM",
        error: "Could not create the invite",
      });
      onChange(next);
      setHandle("");
      const created = next.invites[next.invites.length - 1];
      if (created && (created.channel === "x" || created.channel === "telegram") && created.token) {
        const url = inviteLink(created.token, key);
        const open = dmUrl(created, url);
        if (open) window.open(open, "_blank", "noopener,noreferrer");
      }
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

  function openDm(invite: InviteRecipient) {
    if (!invite.token) return;
    const url = inviteLink(invite.token, getReportKey(report.id));
    const open = dmUrl(invite, url);
    if (open) window.open(open, "_blank", "noopener,noreferrer");
  }

  const submitLabel =
    channel === "email" ? (sending ? "Sending…" : "Send invite email")
      : channel === "x" || channel === "telegram" ? (sending ? "Creating…" : "Create & open DM")
        : (sending ? "Creating…" : "Create invite link");

  return (
    <section className="card-hairline p-5" aria-label="Invites">
      <h2 className="mb-4 flex items-center gap-2 text-subtitle font-semibold"><UserPlus size={16} /> Invited people</h2>
      {invites.length === 0 ? (
        <p className="text-body text-muted-foreground">Nobody has been invited yet. Invite the security contact of the affected project.</p>
      ) : (
        <ul className="space-y-1.5">
          {invites.map((invite) => {
            const meta = channelMeta[invite.channel];
            const status: string = invite.status;
            const showCopy = status === "pending" && !!invite.token;
            const showWithdraw = canInvite && status !== "revoked";
            const showDm = showCopy && (invite.channel === "x" || invite.channel === "telegram");
            const delivery = invite.delivery;
            return (
              <li key={invite.id} className="space-y-2 rounded-xl px-2 py-2.5 transition-colors hover:bg-hover">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06]"><meta.icon size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-subtitle font-medium leading-snug">{invite.handle}</p>
                    <p className="text-caption text-muted-foreground">{meta.label}</p>
                    {delivery && canInvite && (
                      <p className="mt-1 text-caption text-muted-foreground">
                        {deliveryLabel[delivery.state]}
                        {delivery.state === "failed" && delivery.error ? ` — ${delivery.error}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-col items-end gap-1">
                    <Badge color={statusColor[invite.status]} className="capitalize">{invite.status}</Badge>
                    {delivery && canInvite && (
                      <Badge color={deliveryColor[delivery.state]} className="capitalize">{deliveryLabel[delivery.state]}</Badge>
                    )}
                  </div>
                </div>
                {(showCopy || showWithdraw || showDm) && (
                  <div className="flex flex-wrap items-center gap-2 pl-11">
                    {showCopy && (
                      <Button variant="secondary" size="compact" leadingIcon={copied === invite.id ? Check : LinkSimple} onClick={() => void copy(invite)}>
                        {copied === invite.id ? "Copied" : "Copy link"}
                      </Button>
                    )}
                    {showDm && (
                      <Button variant="secondary" size="compact" leadingIcon={invite.channel === "x" ? XLogo : TelegramLogo} onClick={() => openDm(invite)}>
                        Send as DM
                      </Button>
                    )}
                    {showWithdraw && (
                      <Button
                        variant={confirming === invite.id ? "primary" : "ghost"} size="compact" leadingIcon={UserMinus}
                        loading={withdrawing === invite.id} onClick={() => void withdraw(invite)}
                        aria-label={`Withdraw access for ${invite.handle}`}
                      >
                        {confirming === invite.id ? "Confirm" : "Withdraw"}
                      </Button>
                    )}
                  </div>
                )}
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
            {submitLabel}
          </Button>
          <p className="text-caption text-muted-foreground">
            {channel === "email"
              ? "We email them a branded invite. The report key rides in the # fragment of the link and is never logged."
              : channel === "x" || channel === "telegram"
                ? "We create the private invite link, then open a one-click DM composer with it. The #key fragment stays in your browser."
                : "Share the link privately. It carries the report key after the # sign, which browsers never send to a server."}
          </p>
        </form>
      )}
    </section>
  );
}
