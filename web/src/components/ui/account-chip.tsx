import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { Tooltip } from "@/components/ui/tooltip";
import { shortAccount } from "@/lib/near-account";
import { cn } from "@/lib/utils";

/** A NEAR account shown short, with a copy button that confirms in place and in a tooltip. */
export function AccountChip({ account, className, label }: { account: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try { await navigator.clipboard.writeText(account); } catch {
      const area = document.createElement("textarea");
      area.value = account; area.style.position = "fixed"; area.style.opacity = "0";
      document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {label && <span className="text-caption text-muted-foreground">{label}</span>}
      <span className="truncate font-mono text-caption" title={account} data-testid="account-short">{shortAccount(account)}</span>
      <Tooltip content={copied ? "Copied" : "Copy account ID"} forceOpen={copied ? true : undefined}>
        <button type="button" onClick={() => void copy()} aria-label={copied ? "Account ID copied" : `Copy account ID ${account}`}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring)]">
          {copied ? <Check size={14} weight="bold" className="text-success" /> : <Copy size={14} />}
        </button>
      </Tooltip>
      <span className="sr-only" role="status">{copied ? "Copied" : ""}</span>
    </span>
  );
}
