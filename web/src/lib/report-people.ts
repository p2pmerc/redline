import type { Report } from "./redline-types";

export interface Person { name: string; seed?: string; role: "researcher" | "team" }

/** Both people on a report, with avatar seeds. */
export function peopleOf(report: Report, researcherName = "Researcher"): { researcher: Person; team?: Person } {
  const mine = report.role === "researcher";
  const otherName = report.counterparty && report.counterparty !== "Not joined yet" ? report.counterparty : undefined;
  const researcherLabel = mine ? "You" : otherName ?? researcherName;
  const teamLabel = !mine ? "You" : otherName;
  return {
    researcher: { name: researcherLabel, role: "researcher", seed: report.researcherSeed },
    team: teamLabel ? { name: teamLabel, role: "team", seed: report.teamSeed } : undefined,
  };
}
