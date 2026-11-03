// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IconProvider } from "@/lib/icon-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/feedback/toast-provider";
import { ErrorBoundary } from "@/components/feedback/error-boundary";
import type { Report } from "@/lib/redline-types";

vi.mock("@/lib/enclave-key", () => ({ readKeyFromEnclave: vi.fn(async () => { throw new Error("offline"); }) }));

import { ReportView } from "./report-detail-page";

const report: Report = {
  id: "rl-test", title: "Cycle test", target: "t", severity: "high", stage: "negotiating", role: "researcher",
  counterparty: "Security Team", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z",
  disclosureDeadline: "2027-01-01T00:00:00Z", summary: "s", body: "# Hello\n\n```js\nconst a = 1;\n```", contentHash: "ab".repeat(32),
  invites: [{ id: "i1", channel: "email", handle: "sec@example.com", status: "redeemed" }],
  messages: [], timeline: [{ id: "e1", kind: "invite_redeemed", title: "Invite redeemed", at: "2026-11-01T00:00:00Z" } as never],
};

beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
  window.matchMedia = window.matchMedia ?? ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) as MediaQueryList);
  Element.prototype.scrollIntoView = () => {};
});
afterEach(cleanup);

describe("report tabs", () => {
  it("cycles Report > Negotiation > Timeline > Negotiation > Report without crashing", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MemoryRouter><IconProvider><TooltipProvider><ToastProvider>
        <ErrorBoundary><ReportView initial={report} reload={() => {}} /></ErrorBoundary>
      </ToastProvider></TooltipProvider></IconProvider></MemoryRouter>,
    );
    for (const name of ["Negotiation", "Timeline", "Negotiation", "Report", "Timeline", "Report"]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      await new Promise((r) => setTimeout(r, 30));
      expect(screen.queryByRole("alert"), `crashed after ${name}`).toBeNull();
    }
    expect(screen.getByRole("tab", { name: "Report" })).toBeTruthy();
    errors.mockRestore();
  });
});
