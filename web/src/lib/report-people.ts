import { sampleSeed } from "@/components/ui/profile-avatar";
import type { Report } from "./redline-types";

export interface Person { name: string; seed?: string; role: "researcher" | "team" }

/** Both people on a report, with avatar seeds. Samples have no account ids, so they get a name-based seed. */
export function peopleOf(report: Report, researcherName = "Researcher"): { researcher: Person; team?: Person } {
  const mine = report.role === "researcher";
  const otherName = report.counterparty && report.counterparty !== "Not joined yet" ? report.counterparty : undefined;
  const researcherLabel = mine ? "You" : otherName ?? researcherName;
  const teamLabel = !mine ? "You" : otherName;
  const sample = !!report.sample;
  return {
    researcher: { name: researcherLabel, role: "researcher", seed: report.researcherSeed ?? (sample ? sampleSeed(`researcher:${report.id}`) : undefined) },
    team: teamLabel ? { name: teamLabel, role: "team", seed: report.teamSeed ?? (sample ? sampleSeed(`team:${report.id}`) : undefined) } : undefined,
  };
}
