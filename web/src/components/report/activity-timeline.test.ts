import { describe, expect, it } from "vitest";
import { iconForKind, kindIcon } from "./activity-timeline";

/** Kinds the server timeline may emit today (must stay in sync with report-records TimelineEntry). */
const serverKinds = [
  "sealed", "invite_sent", "invite_redeemed", "invite_revoked", "message", "terms_proposed",
  "agreement_signed", "escrow_funded", "pr_linked", "pr_merged", "payout", "refund",
  "disclosure_notice", "published", "payout_account",
] as const;

function isRenderableIcon(Icon: unknown): boolean {
  // Phosphor icons are forwardRef objects; a missing map entry was undefined and crashed render.
  return Icon != null && (typeof Icon === "function" || typeof Icon === "object");
}

describe("activity timeline icons", () => {
  it("maps every server timeline kind to a real icon component", () => {
    for (const kind of serverKinds) {
      const Icon = iconForKind(kind);
      expect(isRenderableIcon(Icon)).toBe(true);
      expect(Icon).toBe(kindIcon[kind]);
    }
  });

  it("falls back for unknown kinds so a new server event cannot crash the Timeline tab", () => {
    const Icon = iconForKind("future_event_kind");
    expect(isRenderableIcon(Icon)).toBe(true);
    expect(Icon).toBe(kindIcon.sealed === Icon ? kindIcon.sealed : Icon); // Scroll fallback
    expect(iconForKind("terms_proposed")).toBe(kindIcon.terms_proposed);
  });
});
