import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { StoredReport } from "./report-records.js";

interface StoreFile {
  version: 1;
  reports: StoredReport[];
}

/**
 * Small durable store: every report lives in memory and the whole set is written to one JSON file
 * (write to a temporary file, then rename) after each change. Pass `null` for an in-memory store.
 */
export class ReportStore {
  private reports = new Map<string, StoredReport>();

  constructor(private readonly file: string | null) {
    if (file && existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as StoreFile;
      for (const report of parsed.reports) this.reports.set(report.id, report);
    }
  }

  get(id: string): StoredReport | undefined {
    return this.reports.get(id);
  }

  all(): StoredReport[] {
    return [...this.reports.values()];
  }

  insert(report: StoredReport): void {
    if (this.reports.has(report.id)) throw new Error("duplicate report id");
    this.reports.set(report.id, report);
    this.flush();
  }

  /** Persist after the caller changed a record it got from `get`. */
  save(report: StoredReport): void {
    this.reports.set(report.id, report);
    this.flush();
  }

  /** Remove a report permanently. Returns true when it existed. */
  delete(id: string): boolean {
    const ok = this.reports.delete(id);
    if (ok) this.flush();
    return ok;
  }

  findInvite(token: string): { report: StoredReport; inviteId: string } | undefined {
    for (const report of this.reports.values()) {
      const invite = report.invites.find((i) => i.token === token && i.status !== "revoked");
      if (invite) return { report, inviteId: invite.id };
    }
    return undefined;
  }

  private flush(): void {
    if (!this.file) return;
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    const body: StoreFile = { version: 1, reports: this.all() };
    writeFileSync(tmp, JSON.stringify(body));
    renameSync(tmp, this.file);
  }
}
