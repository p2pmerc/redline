import { useState } from "react";
import { Bug, Fingerprint, FloppyDisk, WarningCircle, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { ReportEditor } from "@/components/report/report-editor";
import { useToast } from "@/components/feedback/toast-provider";
import { editReport } from "@/lib/data-source";
import type { Report, Severity } from "@/lib/redline-types";

const severities: Severity[] = ["critical", "high", "medium", "low"];

/** Owner-only edit of a sealed report. Re-encrypts with the same key; the new hash is registered on chain. */
export function ReportEditForm({ report, onSaved, onCancel }: { report: Report; onSaved: (next: Report) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(report.title);
  const [summary, setSummary] = useState(report.summary);
  const [severity, setSeverity] = useState<Severity>(report.severity);
  const [body, setBody] = useState(report.body);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const valid = title.trim().length >= 3 && body.trim().length > 0;

  async function save() {
    setSaving(true);
    try {
      const next = await toast.promise(editReport(report.id, { title, summary, severity, body }), {
        pending: "Re-encrypting and registering the new hash…",
        success: "Report edited. New hash registered on chain.",
        error: "Could not save the edit",
      });
      onSaved(next);
    } catch {
      /* toast shown */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 card-hairline p-5">
        <InputGroup>
          <InputField index={0} label="Title" icon={Bug} value={title} onChange={setTitle} disabled={saving} />
          <InputField index={1} label="Short summary" icon={Fingerprint} placeholder="Shown to invited people. No exploit details." value={summary} onChange={setSummary} disabled={saving} />
        </InputGroup>
        <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)} disabled={saving}>
          <SelectTrigger placeholder="Severity" icon={WarningCircle} />
          <SelectContent>
            {severities.map((s, i) => <SelectItem key={s} index={i} value={s}><span className="capitalize">{s}</span></SelectItem>)}
          </SelectContent>
        </Select>
      </section>
      <ReportEditor value={body} onChange={setBody} editable={!saving} />
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" leadingIcon={X} onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button leadingIcon={FloppyDisk} onClick={() => void save()} loading={saving} disabled={!valid}>Save edit</Button>
      </div>
    </div>
  );
}
