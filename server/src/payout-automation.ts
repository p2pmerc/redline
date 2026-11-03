import type { ReportStore } from "./report-store.js";
import type { StoredReport } from "./report-records.js";
import { exclusive, isBusy, runClaim, runMergeCheck, type SettlementContext } from "./settlement.js";

export interface AutomationOptions {
  store: ReportStore;
  ctx: SettlementContext;
  /** Base delay between GitHub looks at one report. */
  pollMs: number;
  /** Longest wait after repeated failures. */
  maxBackoffMs?: number;
  log?: (message: string) => void;
}

/**
 * Pays researchers without anyone pressing "check". Every funded report with a linked pull request is
 * looked at on GitHub (one cheap read, author-checked). Only when GitHub shows the merge does it run the
 * two enclave checks and the payout through the same code the buttons use.
 */
export function createPayoutAutomation(options: AutomationOptions) {
  const { store, ctx, pollMs } = options;
  const maxBackoff = options.maxBackoffMs ?? 15 * 60_000;
  const say = options.log ?? (() => {});
  const nextAt = new Map<string, number>();
  const failures = new Map<string, number>();
  let timer: NodeJS.Timeout | undefined;
  let running = false;

  const schedule = (id: string, failed: boolean) => {
    const n = failed ? (failures.get(id) ?? 0) + 1 : 0;
    failures.set(id, n);
    nextAt.set(id, ctx.now().getTime() + (failed ? Math.min(pollMs * 2 ** n, maxBackoff) : pollMs));
  };

  const watched = (r: StoredReport) =>
    (r.status === "funded" || r.status === "merge_confirmed") && !!r.escrow?.pullRequest && !!r.escrow.repo;

  /** Work one report as far as it can go right now. */
  async function settle(id: string): Promise<void> {
    await exclusive(id, async () => {
      const current = store.get(id);
      if (!current || !watched(current)) return;
      const draft = structuredClone(current);
      if (draft.status === "funded") {
        const seen = await ctx.mergeLookup(draft.escrow!.repo!, draft.escrow!.pullRequest!, draft.githubLogin ?? ctx.githubLoginOf(draft.researcherId));
        if (seen.status !== "merged") { schedule(id, seen.status === "unknown"); return; }
        say(`${id}: merge seen on GitHub, asking the enclave`);
        await runMergeCheck(ctx, draft);
        store.save(draft);
        if ((draft.status as string) !== "merge_confirmed") { schedule(id, false); return; }
      }
      say(`${id}: merge confirmed, claiming payout`);
      await runClaim(ctx, draft);
      store.save(draft);
      const paid = (draft.status as string) === "paid";
      if (paid) say(`${id}: paid`);
      schedule(id, !paid);
    });
  }

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const now = ctx.now().getTime();
      for (const report of store.all().filter(watched)) {
        if (isBusy(report.id) || (nextAt.get(report.id) ?? 0) > now) continue;
        try {
          await settle(report.id);
        } catch (err) {
          schedule(report.id, true);
          say(`${report.id}: automation step failed (${err instanceof Error ? err.message.slice(0, 120) : "unknown"}), will retry`);
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    tick,
    start(): void {
      if (timer) return;
      timer = setInterval(() => { void tick(); }, Math.min(pollMs, 30_000));
      timer.unref();
      void tick();
    },
    stop(): void { if (timer) clearInterval(timer); timer = undefined; },
  };
}
