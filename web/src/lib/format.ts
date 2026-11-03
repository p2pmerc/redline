const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return "just now";
  if (abs < hour) return rtf.format(Math.round(diff / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  if (abs < 30 * day) return rtf.format(Math.round(diff / day), "day");
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export function daysUntil(iso: string, now = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

export function formatNear(amount?: number): string {
  if (amount === undefined) return "Not set";
  return `${amount.toLocaleString("en", { maximumFractionDigits: 2 })} NEAR`;
}

export function shortHash(hash: string, head = 8, tail = 6): string {
  return hash.length <= head + tail + 1 ? hash : `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}
