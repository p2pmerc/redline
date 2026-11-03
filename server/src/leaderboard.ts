/**
 * Public researcher leaderboard. Pure functions over public data only: a researcher appears when they have a
 * public profile (a handle) and at least one public disclosure. Earnings count fixed-and-paid reports only.
 * Nothing here reads emails, payout accounts, private reports or keys.
 */
import type { Severity } from "./report-records.js";

export const SEVERITY_ORDER: Severity[] = ["low", "medium", "high", "critical"];
const rank = (s: Severity) => SEVERITY_ORDER.indexOf(s);
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** What the leaderboard needs from one public disclosure. */
export interface BoardItem {
  researcher?: string;
  severity: Severity;
  outcome: "fixed_and_paid" | "refunded" | "disclosed";
  bountyNear?: number;
  paidAt?: string;
}

export interface BoardTotals {
  totalEarnedNear: number;
  disclosures: number;
  paid: number;
  highestSeverity: Severity | null;
  lastPaidAt?: string;
}

export function totalsOf(items: BoardItem[]): BoardTotals {
  const paid = items.filter((i) => i.outcome === "fixed_and_paid");
  let highest: Severity | null = null;
  for (const i of items) if (!highest || rank(i.severity) > rank(highest)) highest = i.severity;
  const paidDates = paid.map((i) => i.paidAt).filter((d): d is string => !!d).sort();
  return {
    totalEarnedNear: round(paid.reduce((sum, i) => sum + (i.bountyNear ?? 0), 0)),
    disclosures: items.length,
    paid: paid.length,
    highestSeverity: highest,
    lastPaidAt: paidDates.at(-1),
  };
}

export interface BoardProfile { handle: string; displayName: string; avatarSeed: string }

export interface BoardEntry extends BoardTotals, BoardProfile { rank: number }

/** Ranked by NEAR earned, then paid count, then disclosures, then handle. Equal earnings share a rank. */
export function buildLeaderboard(items: BoardItem[], profiles: BoardProfile[]): BoardEntry[] {
  const rows = profiles
    .map((p) => ({ p, t: totalsOf(items.filter((i) => i.researcher === p.handle)) }))
    .filter((r) => r.t.disclosures > 0)
    .sort((a, b) => b.t.totalEarnedNear - a.t.totalEarnedNear || b.t.paid - a.t.paid || b.t.disclosures - a.t.disclosures || a.p.handle.localeCompare(b.p.handle));
  let place = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.t.totalEarnedNear !== rows[i - 1]!.t.totalEarnedNear) place = i + 1;
    return { rank: place, handle: r.p.handle, displayName: r.p.displayName, avatarSeed: r.p.avatarSeed, ...r.t };
  });
}
