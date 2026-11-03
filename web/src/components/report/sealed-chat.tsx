import { useEffect, useRef, useState } from "react";
import { ChatsCircle, Hash, LockKey } from "@phosphor-icons/react";
import { ChatMessage } from "@/components/ui/chat-message";
import { InputMessage } from "@/components/ui/input-message";
import { EmptyState } from "@/components/feedback/empty-state";
import { useToast } from "@/components/feedback/toast-provider";
import { relativeTime, shortHash } from "@/lib/format";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { peopleOf } from "@/lib/report-people";
import { sendMessage } from "@/lib/data-source";
import type { Report } from "@/lib/redline-types";

interface SealedChatProps {
  report: Report;
  onChange: (next: Report) => void;
}

/** Private negotiation thread. Messages are encrypted with the report key before they leave the browser. */
export function SealedChat({ report, onChange }: SealedChatProps) {
  const messages = report.messages;
  const counterparty = report.counterparty;
  const people = peopleOf(report);
  const locked = report.invites.every((i) => i.status !== "redeemed") || !!report.bodyLocked;
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const toast = useToast();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length]);

  async function send(text: string) {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      onChange(await sendMessage(report.id, text.trim()));
      setDraft("");
    } catch (e) {
      toast.show({ tone: "error", title: "Message not sent", description: e instanceof Error ? e.message : "Try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[520px] flex-col card-hairline">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <LockKey size={16} className="text-muted-foreground" />
        <p className="text-subtitle font-medium">Sealed chat with {counterparty && !/^signed in$/i.test(counterparty.trim()) ? counterparty : "your counterpart"}</p>
        <span className="ml-auto inline-flex items-center gap-1 text-caption text-muted-foreground"><Hash size={12} /> encrypted</span>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <EmptyState icon={ChatsCircle} title="No messages yet" description="Once the invited person redeems their invite, you can negotiate the reward here." />
        ) : (
          messages.map((m) => (
            <div key={m.id} className="flex flex-col">
              {m.author !== "you" && (
                <p className="mb-1 flex items-center gap-1.5 self-start text-caption text-muted-foreground">
                  <ProfileAvatar size="sm" name={m.author} seed={m.from === "team" ? people.team?.seed : people.researcher.seed} /> {m.author}
                </p>
              )}
              <ChatMessage
                from={m.author === "you" ? "user" : "assistant"}
                time={relativeTime(m.at)}
                actions={<span className="font-mono text-[10px] text-muted-foreground" title={m.hash}>{shortHash(m.hash, 6, 4)}</span>}
              >
                {m.body}
              </ChatMessage>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t border-border/60 p-3">
        <InputMessage
          value={draft}
          onValueChange={setDraft}
          onSend={(text) => void send(text)}
          placeholder={report.bodyLocked ? "Unlocking the chat. This happens automatically." : locked ? "Chat opens after the invite is redeemed" : "Write a message. It is encrypted first."}
          disabled={locked || sending}
          status={sending ? "streaming" : "idle"}
          minRows={1}
          maxRows={4}
        />
      </div>
    </div>
  );
}
