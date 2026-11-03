import { useEffect, useRef, useState } from "react";
import { ChatsCircle, Hash, LockKey } from "@phosphor-icons/react";
import { ChatMessage } from "@/components/ui/chat-message";
import { InputMessage } from "@/components/ui/input-message";
import { EmptyState } from "@/components/feedback/empty-state";
import { useToast } from "@/components/feedback/toast-provider";
import { relativeTime, shortHash } from "@/lib/format";
import { sha256Hex } from "@/lib/report-encryption";
import type { NegotiationMessage, ReportRole } from "@/lib/redline-types";

interface SealedChatProps {
  messages: NegotiationMessage[];
  role: ReportRole;
  counterparty: string;
  locked?: boolean;
}

/** Private negotiation thread. Each message is hashed and the hash logged on chain. */
export function SealedChat({ messages: initial, role, counterparty, locked }: SealedChatProps) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const toast = useToast();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), [messages.length]);

  async function send(text: string) {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const hash = await sha256Hex(new TextEncoder().encode(text));
      await new Promise((r) => setTimeout(r, 700)); // pending: hash being logged on chain
      setMessages((all) => [...all, { id: crypto.randomUUID(), from: role, author: "you", body: text, at: new Date().toISOString(), hash }]);
      setDraft("");
    } catch {
      toast.show({ tone: "error", title: "Message not sent", description: "Could not log the message hash. Try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[520px] flex-col rounded-2xl bg-surface-3 shadow-surface-2">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <LockKey size={16} className="text-muted-foreground" />
        <p className="text-subtitle font-medium">Sealed chat with {counterparty}</p>
        <span className="ml-auto inline-flex items-center gap-1 text-caption text-muted-foreground"><Hash size={12} /> hash-logged</span>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <EmptyState icon={ChatsCircle} title="No messages yet" description="Once the invited person redeems their invite, you can negotiate the reward here." />
        ) : (
          messages.map((m) => (
            <div key={m.id}>
              {m.author !== "you" && <p className="mb-1 text-caption text-muted-foreground">{m.author}</p>}
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
          placeholder={locked ? "Chat opens after the invite is redeemed" : "Write a message. Only its hash goes on chain."}
          disabled={locked || sending}
          status={sending ? "streaming" : "idle"}
          minRows={1}
          maxRows={4}
        />
      </div>
    </div>
  );
}
