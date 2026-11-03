import { cn } from "@/lib/utils";

/** The Redline mark: a page with a struck line in the signal red. */
export function RedlineMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M10 11h12M10 15.5h8" stroke="var(--background)" strokeWidth="2" strokeLinecap="round" opacity=".85" />
      <path d="M7 21h18" stroke="var(--redline)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function RedlineWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-title font-semibold tracking-tight", className)}>
      <RedlineMark />
      Redline
    </span>
  );
}
