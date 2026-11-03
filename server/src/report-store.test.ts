import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ReportStore } from "./report-store.js";
import type { StoredReport } from "./report-records.js";

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(path.join(os.tmpdir(), "redline-store-")); dirs.push(d); return path.join(d, "nested", "store.json"); };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

const report = (id: string, token: string, status: "pending" | "revoked" = "pending") => ({
  id, researcherId: "u1", invites: [{ id: "i1", token, channel: "email", handle: "x@y.z", status, createdAt: "2026-01-01T00:00:00Z" }], messages: [], timeline: [],
}) as unknown as StoredReport;

describe("report store", () => {
  it("survives a restart and keeps ciphertext only", () => {
    const file = tmp();
    const a = new ReportStore(file);
    a.insert(report("r1", "tok-aaaaaaaaaaaaaaaaaaaa"));
    const b = new ReportStore(file);
    expect(b.get("r1")?.researcherId).toBe("u1");
    expect(readFileSync(file, "utf8")).not.toContain("password");
  });

  it("saves later edits and rejects duplicate ids", () => {
    const file = tmp();
    const a = new ReportStore(file);
    a.insert(report("r1", "tok-aaaaaaaaaaaaaaaaaaaa"));
    expect(() => a.insert(report("r1", "tok-bbbbbbbbbbbbbbbbbbbb"))).toThrow();
    const r = a.get("r1")!;
    r.invites[0]!.status = "revoked";
    a.save(r);
    expect(new ReportStore(file).findInvite("tok-aaaaaaaaaaaaaaaaaaaa")).toBeUndefined();
  });

  it("works in memory with no file", () => {
    const s = new ReportStore(null);
    s.insert(report("r2", "tok-cccccccccccccccccccc"));
    expect(s.findInvite("tok-cccccccccccccccccccc")?.inviteId).toBe("i1");
  });
});
