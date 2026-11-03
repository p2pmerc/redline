import { describe, expect, it } from "vitest";
import { buildInviteEmail } from "./invite-email.js";

describe("buildInviteEmail", () => {
  const base = {
    to: "security@acme.com",
    inviteUrl: "https://app.example/app/invite/tok#k=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    researcherName: "Ada Lovelace",
    researcherHandle: "ada",
    repo: "acme/widgets",
    severity: "high",
    title: "Auth bypass in checkout",
    summary: "Session cookies are accepted across subdomains.",
    disclosureDeadline: "2026-12-01T00:00:00.000Z",
    appOrigin: "https://app.example",
  };

  it("names the researcher, repo, severity, title, summary, and deadline", () => {
    const { subject, text, html } = buildInviteEmail(base);
    expect(subject).toContain("Ada Lovelace");
    expect(subject).toContain("high");
    for (const part of [text, html]) {
      expect(part).toContain("acme/widgets");
      expect(part).toContain("Auth bypass in checkout");
      expect(part).toContain("Session cookies");
      expect(part.toLowerCase()).toContain("sealed");
      expect(part.toLowerCase()).toContain("escrow");
      expect(part).toMatch(/1 December 2026|December 1, 2026/);
    }
    expect(html).toContain("Open sealed report");
    expect(html).toContain("#ea580c");
    // Must include the CTA href but we do not assert logging behaviour here.
    expect(html).toContain("invite/tok");
  });

  it("never puts exploit-like code fences into the template itself", () => {
    const { html } = buildInviteEmail({ ...base, summary: undefined });
    expect(html).not.toContain("```");
    expect(html).toContain("How Redline works");
  });
});
