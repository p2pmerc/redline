import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, LockKey, Bug, GitBranch, CalendarBlank, CheckCircle, CircleNotch, Circle, Fingerprint, Cube, Key, Hash, WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { ReportEditor } from "@/components/report/report-editor";
import { useToast } from "@/components/feedback/toast-provider";
import { redlineConfig } from "@/lib/redline-config";
import { sealKeyToEnclave, sealReportBody } from "@/lib/report-encryption";
import { createReport } from "@/lib/data-source";
import { exportMarkdown, exportPdf } from "@/lib/report-export";
import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/redline-types";
import { FileMd, FilePdf } from "@phosphor-icons/react";

const severities: Severity[] = ["critical", "high", "medium", "low"];
const deadlines = [30, 45, 60, 90];

const steps = [
  { id: "encrypt", label: "Encrypting the report in your browser", icon: LockKey },
  { id: "hash", label: "Hashing the ciphertext", icon: Hash },
  { id: "key", label: "Preparing the key", icon: Key },
  { id: "chain", label: "Registering the hash", icon: Cube },
] as const;

type StepState = "idle" | "active" | "done" | "error";

const starter = `## Summary

One paragraph on what is broken and why it matters.

## Steps to reproduce

1. 
2. 

\`\`\`bash
curl -i https://example.com/endpoint
\`\`\`

## Impact

## Suggested fix
`;


function normalizeRepoInput(raw: string): string {
  const value = raw.trim().replace(/\.git$/i, "");
  if (!value) return "";
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) return value;
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/i.exec(value);
  return m ? `${m[1]}/${m[2]}` : value;
}

export function NewReportPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [repo, setRepo] = useState("");
  const [severity, setSeverity] = useState<Severity>("high");
  const [days, setDays] = useState("90");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState(starter);
  const [sealing, setSealing] = useState(false);
  const [progress, setProgress] = useState<Record<string, StepState>>({});
  const [error, setError] = useState<string | null>(null);

  const normalizedRepo = normalizeRepoInput(repo);
  const repoValid = !repo.trim() || /^[\w.-]+\/[\w.-]+$/.test(normalizedRepo);
  const canSeal = title.trim().length >= 4 && body.trim().length >= 20 && repoValid && !sealing;

  const mark = (id: string, state: StepState) => setProgress((p) => ({ ...p, [id]: state }));
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function seal() {
    setSealing(true);
    setError(null);
    setProgress({});
    let current = "encrypt";
    try {
      mark("encrypt", "active");
      const sealed = await sealReportBody(body);
      mark("encrypt", "done");

      current = "hash";
      mark("hash", "active");
      await pause(200); // the hash is computed with the ciphertext; this keeps the step readable
      mark("hash", "done");

      current = "key";
      mark("key", "active");
      const sealedKeyHex = redlineConfig.enclavePublicKey ? sealKeyToEnclave(sealed.keyHex, sealed.contentHash, redlineConfig.enclavePublicKey) : undefined;
      await pause(200);
      mark("key", "done");

      current = "chain";
      mark("chain", "active");
      const report = await createReport({ title, repo: normalizedRepo || "", severity, disclosureDays: Number(days), body, summary: summary.trim(), sealedKeyHex }, sealed);
      mark("chain", "done");

      toast.show({ tone: "success", title: "Report sealed", description: `Hash ${sealed.contentHash.slice(0, 10)}… registered.` });
      await pause(400);
      navigate(`/app/reports/${report.id}`);
    } catch (e) {
      mark(current, "error");
      setError(e instanceof Error ? e.message : "Sealing failed. Nothing was sent.");
      setSealing(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-3">
        <Link to="/app" className="inline-flex items-center gap-1.5 text-subtitle text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft size={14} /> All reports
        </Link>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">New sealed report</h1>
        <p className="text-body text-muted-foreground">Write the report, then seal it. The text never leaves your browser unencrypted.</p>
      </div>

      <section className="space-y-3 card-hairline p-5">
        <InputGroup>
          <InputField index={0} label="Title" icon={Bug} placeholder="Short, specific, no exploit details" value={title} onChange={setTitle} disabled={sealing} />
          <InputField index={1} label="Affected repository (optional)" icon={GitBranch} placeholder="owner/name or github.com/owner/name" value={repo} onChange={setRepo} disabled={sealing}
            error={repoValid ? undefined : "Use owner/name or a github.com/owner/name URL"} />
          <InputField index={2} label="Short summary (optional)" icon={Fingerprint} placeholder="Shown to invited people. No exploit details." value={summary} onChange={setSummary} disabled={sealing} />
        </InputGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)} disabled={sealing}>
            <SelectTrigger placeholder="Severity" icon={WarningCircle} />
            <SelectContent>
              {severities.map((s, i) => <SelectItem key={s} index={i} value={s}><span className="capitalize">{s}</span></SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays} disabled={sealing}>
            <SelectTrigger placeholder="Disclosure window" icon={CalendarBlank} />
            <SelectContent>
              {deadlines.map((d, i) => <SelectItem key={d} index={i} value={String(d)}>Public after {d} days</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </section>

      <ReportEditor value={body} onChange={setBody} editable={!sealing} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button variant="secondary" size="compact" leadingIcon={FileMd} disabled={!body.trim()} onClick={() => exportMarkdown(title || "report", body)}>Export .md</Button>
          <Button variant="secondary" size="compact" leadingIcon={FilePdf} disabled={!body.trim()} onClick={() => void exportPdf(title || "report", body)}>Export PDF</Button>
        </div>
        <Button leadingIcon={Fingerprint} loading={sealing} disabled={!canSeal} onClick={() => void seal()}>
          {sealing ? "Sealing…" : "Seal & register"}
        </Button>
      </div>

      {(sealing || error) && (
        <ol className="space-y-2 rounded-2xl bg-surface-2 p-5 shadow-surface-1" aria-live="polite" aria-label="Sealing progress">
          {steps.map((s) => {
            const state = progress[s.id] ?? "idle";
            return (
              <li key={s.id} className={cn("flex items-center gap-3 text-body", state === "idle" && "text-muted-foreground", state === "error" && "text-destructive")}>
                {state === "done" ? <CheckCircle size={18} weight="fill" className="text-success" />
                  : state === "active" ? <CircleNotch size={18} className="animate-spin" />
                  : state === "error" ? <WarningCircle size={18} weight="fill" />
                  : <Circle size={18} />}
                <s.icon size={16} /> {s.label}
              </li>
            );
          })}
          {error && (
            <li className="pt-2">
              <p className="text-caption text-destructive">{error}</p>
              <Button className="mt-2" size="compact" variant="secondary" onClick={() => void seal()}>Try again</Button>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
