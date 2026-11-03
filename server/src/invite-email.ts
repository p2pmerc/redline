/**
 * Branded Redline invite emails via AgentMail.
 * The invite URL may carry #k=<reportKey>; that fragment must never be logged or stored in delivery metadata.
 */
export interface InviteEmailInput {
  to: string;
  inviteUrl: string; // may include #k=… — never log this string
  researcherName: string;
  researcherHandle?: string;
  repo?: string;
  severity: string;
  title: string;
  summary?: string;
  disclosureDeadline: string; // ISO date
  appOrigin: string;
}

export interface AgentMailConfig {
  apiKey: string;
  inboxId: string; // e.g. redline-invites@agentmail.to
}

export interface SendResult {
  messageId: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) + " (UTC)";
}

function researcherLine(name: string, handle?: string): string {
  const h = handle?.trim();
  if (h && h !== name) return `${name} (@${h.replace(/^@/, "")})`;
  if (h) return `@${h.replace(/^@/, "")}`;
  return name;
}

export function buildInviteEmail(input: InviteEmailInput): { subject: string; text: string; html: string } {
  const who = researcherLine(input.researcherName, input.researcherHandle);
  const repo = input.repo?.trim() || "a repository they named in the report";
  const severity = input.severity.trim().toLowerCase();
  const deadline = formatDeadline(input.disclosureDeadline);
  const summary = input.summary?.trim();

  const subject = `${who} invited you to a sealed ${severity} report on Redline`;

  const text = [
    `${who} filed a sealed vulnerability report on Redline and invited you as the security contact.`,
    ``,
    `Report: ${input.title}`,
    `Severity: ${severity}`,
    `Affected repo: ${repo}`,
    `Disclosure deadline: ${deadline}`,
    summary ? `` : null,
    summary ? `Their short summary (no exploit details):` : null,
    summary ? summary : null,
    ``,
    `What Redline is`,
    `The full report stays sealed until you verify who you are. After you open it, you and the researcher negotiate the bounty privately. When a fix pull request merges, escrow pays the agreed reward automatically.`,
    ``,
    `Open your invite (this link is private — do not forward it):`,
    input.inviteUrl,
    ``,
    `If the button or link does not work, paste the URL into your browser while signed in to Redline.`,
    ``,
    `— Redline`,
    input.appOrigin,
  ].filter((line) => line !== null).join("\n");

  const summaryBlock = summary
    ? `<tr><td style="padding:0 0 16px;font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#44403c">
        <div style="background:#fff7ed;border:1px solid #fdba74;border-radius:12px;padding:14px 16px">
          <div style="font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#c2410c;margin-bottom:6px">Researcher summary</div>
          <div>${escapeHtml(summary)}</div>
        </div>
      </td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>Redline invite</title></head>
<body style="margin:0;padding:0;background:#f5f5f4">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f4;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e7e5e4">
        <tr><td style="background:linear-gradient(135deg,#ea580c,#f97316);padding:28px 28px 24px">
          <div style="font-family:Inter,system-ui,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.85)">Redline invite</div>
          <div style="font-family:Inter,system-ui,sans-serif;font-size:22px;font-weight:700;line-height:1.25;color:#fff;margin-top:8px">You're invited to open a sealed report</div>
        </td></tr>
        <tr><td style="padding:28px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr><td style="padding:0 0 16px;font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.55;color:#292524">
              <strong>${escapeHtml(who)}</strong> filed a sealed vulnerability report and invited you as the security contact. Nothing in this email contains exploit details or the report body.
            </td></tr>
            <tr><td style="padding:0 0 16px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px">
                <tr><td style="padding:14px 16px;font-family:Inter,system-ui,sans-serif;font-size:14px;color:#292524">
                  <div style="margin-bottom:10px"><span style="color:#78716c;font-size:12px">Title</span><br/><strong>${escapeHtml(input.title)}</strong></div>
                  <div style="margin-bottom:10px"><span style="color:#78716c;font-size:12px">Severity</span><br/><strong style="text-transform:capitalize;color:#c2410c">${escapeHtml(severity)}</strong></div>
                  <div style="margin-bottom:10px"><span style="color:#78716c;font-size:12px">Affected repository</span><br/><strong>${escapeHtml(repo)}</strong></div>
                  <div><span style="color:#78716c;font-size:12px">Disclosure deadline</span><br/><strong>${escapeHtml(deadline)}</strong></div>
                </td></tr>
              </table>
            </td></tr>
            ${summaryBlock}
            <tr><td style="padding:0 0 20px;font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#44403c">
              <strong style="color:#292524">How Redline works</strong><br/>
              The report is sealed. You verify your identity to read it. You negotiate the bounty privately with the researcher. Escrow pays out when the fix pull request merges.
            </td></tr>
            <tr><td align="center" style="padding:4px 0 8px">
              <a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;background:#ea580c;color:#ffffff;font-family:Inter,system-ui,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:999px">
                Open sealed report
              </a>
            </td></tr>
            <tr><td style="padding:16px 0 0;font-family:Inter,system-ui,sans-serif;font-size:12px;line-height:1.5;color:#a8a29e">
              This invite link is private. Do not forward it. The report key, if present, sits after the <code style="font-size:11px">#</code> in the URL and is never sent to our servers.
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

/** Sends via AgentMail REST. Never log inviteUrl (may contain #k=). */
export async function sendInviteEmail(
  mail: AgentMailConfig,
  input: InviteEmailInput,
  fetcher: typeof fetch = fetch,
): Promise<SendResult> {
  const { subject, text, html } = buildInviteEmail(input);
  const res = await fetcher(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(mail.inboxId)}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mail.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: [input.to],
      subject,
      text,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Strip any accidental invite URL from error text before surfacing.
    const safe = body.replace(/https?:\/\/\S+#k=[0-9a-fA-F]{64}/g, "[invite-url]").slice(0, 300);
    throw new Error(`AgentMail send failed (${res.status})${safe ? `: ${safe}` : ""}`);
  }
  const json = (await res.json().catch(() => ({}))) as { message_id?: string; messageId?: string; id?: string };
  const messageId = json.message_id ?? json.messageId ?? json.id ?? "sent";
  return { messageId };
}
