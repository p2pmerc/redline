import { useState } from "react";
import {
  EnvelopeSimple, XLogo, TelegramLogo, GithubLogo, PaperPlaneTilt, UserPlus, type Icon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useToast } from "@/components/feedback/toast-provider";
import type { InviteRecipient } from "@/lib/redline-types";

const channelMeta: Record<InviteRecipient["channel"], { label: string; icon: Icon; placeholder: string }> = {
  email: { label: "Email", icon: EnvelopeSimple, placeholder: "security@company.com" },
  x: { label: "X", icon: XLogo, placeholder: "@handle" },
  telegram: { label: "Telegram", icon: TelegramLogo, placeholder: "@username" },
  github: { label: "GitHub", icon: GithubLogo, placeholder: "username or organisation" },
};

const statusColor = { pending: "amber", redeemed: "green", expired: "gray" } as const;

export function InvitePanel({ invites: initial, canInvite }: { invites: InviteRecipient[]; canInvite: boolean }) {
  const [invites, setInvites] = useState(initial);
  const [channel, setChannel] = useState<InviteRecipient["channel"]>("email");
  const [handle, setHandle] = useState("");
  const [sending, setSending] = useState(false);
  const toast = useToast();

  async function send() {
    const value = handle.trim();
    if (!value) return;
    setSending(true);
    try {
      await toast.promise(new Promise((r) => setTimeout(r, 1000)), {
        pending: "Sending invite…", success: "Invite sent", error: "Could not send the invite",
      });
      setInvites((all) => [...all, { id: crypto.randomUUID(), channel, handle: value, status: "pending" }]);
      setHandle("");
    } catch {
      /* toast shown */
    } finally {
      setSending(false);
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
            {sending ? "Sending…" : "Send invite"}
          </Button>
          <p className="text-caption text-muted-foreground">The report key is released only after the enclave matches the verified account to this invite.</p>
        </form>
      )}
    </section>
  );
}
