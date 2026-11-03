import type { Report } from "./redline-types";
import { findSampleReport, sampleReports } from "./sample-reports";

/**
 * Data access for the app. While the backend is being wired in this serves the
 * built-in sample reports after a short delay so every loading state is real.
 */
const latency = (ms = 650) => new Promise((resolve) => setTimeout(resolve, ms));

export async function listReports(): Promise<Report[]> {
  await latency();
  return sampleReports;
}

export async function getReport(id: string): Promise<Report> {
  await latency(500);
  const report = findSampleReport(id);
  if (!report) throw new Error("This report does not exist, or you do not have access to it.");
  return report;
}

/** Reports whose disclosure window has passed and which were published with evidence. */
export async function listPublicDisclosures(): Promise<Report[]> {
  await latency();
  return sampleReports.filter((r) => r.stage === "published");
}

export async function getPublicDisclosure(id: string): Promise<Report> {
  await latency(500);
  const report = findSampleReport(id);
  if (!report || report.stage !== "published") throw new Error("This disclosure is not public.");
  return report;
}
