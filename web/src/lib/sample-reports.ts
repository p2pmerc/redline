import type { Report, TimelineEvent } from "./redline-types";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

const fakeHash = (seed: string) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: 4 }, (_, i) => ((h * (i + 7)) >>> 0).toString(16).padStart(8, "0")).join("");
};

const event = (id: string, h: number, kind: TimelineEvent["kind"], title: string, detail?: string, tx = false): TimelineEvent => ({
  id,
  at: hoursAgo(h),
  kind,
  title,
  detail,
  txHash: tx ? fakeHash(id) : undefined,
});

const reentrancyBody = `## Summary

The \`withdraw\` path in the vault contract updates the user balance **after** the external call, which allows a re-entrant call to drain funds.

## Impact

An attacker with a deposit of 1 token can withdraw the full pool in a single transaction.

## Steps to reproduce

1. Deposit 1 token from a contract account.
2. Call \`withdraw(1)\`; in the receiver hook call \`withdraw(1)\` again.
3. Observe that the balance check passes on every re-entry.

\`\`\`rust
pub fn withdraw(&mut self, amount: U128) -> Promise {
    let caller = env::predecessor_account_id();
    assert!(self.balances.get(&caller).unwrap_or(0) >= amount.0);
    // balance is only reduced in the callback
    ext_token::ext(self.token.clone()).ft_transfer(caller, amount, None)
}
\`\`\`

## Suggested fix

Reduce the balance before the transfer and restore it in a failure callback.`;

export const sampleReports: Report[] = [
  {
    id: "rl-7f3a91",
    title: "Re-entrant withdraw drains the vault pool",
    target: "Halcyon Vaults",
    repo: "halcyon-labs/vaults",
    severity: "critical",
    stage: "funded",
    role: "researcher",
    counterparty: "Halcyon security team",
    createdAt: hoursAgo(96),
    updatedAt: hoursAgo(3),
    disclosureDeadline: daysFromNow(41),
    rewardNear: 1200,
    summary: "Balance is reduced after the external call in withdraw(), so a hook can re-enter and drain the pool.",
    body: reentrancyBody,
    contentHash: fakeHash("rl-7f3a91-body"),
    escrow: {
      amountNear: 1200,
      funded: true,
      expiresAt: daysFromNow(21),
      contractId: "escrow.redline.testnet",
      pullRequestUrl: "https://github.com/halcyon-labs/vaults/pull/418",
      mergeCheck: "pending",
    },
    invites: [
      { id: "i1", channel: "email", handle: "security@halcyon.example", status: "redeemed" },
      { id: "i2", channel: "x", handle: "@halcyon_sec", status: "pending" },
    ],
    messages: [
      { id: "m1", from: "researcher", author: "you", at: hoursAgo(80), body: "Full report is sealed. Happy to walk your team through the reproduction on a call.", hash: fakeHash("m1") },
      { id: "m2", from: "team", author: "Halcyon security", at: hoursAgo(72), body: "Reproduced on staging. Critical for sure. We propose 900 NEAR.", hash: fakeHash("m2") },
      { id: "m3", from: "researcher", author: "you", at: hoursAgo(70), body: "The pool holds roughly 40k NEAR. 1,200 feels right for a drain of that size.", hash: fakeHash("m3") },
      { id: "m4", from: "team", author: "Halcyon security", at: hoursAgo(60), body: "Agreed at 1,200 NEAR, paid when the fix PR merges to main.", hash: fakeHash("m4") },
    ],
    timeline: [
      event("t1", 96, "sealed", "Report sealed", "AES-256-GCM key sealed to the enclave. Hash logged on chain.", true),
      event("t2", 90, "invite_sent", "Invites sent", "2 recipients: email and X"),
      event("t3", 85, "invite_redeemed", "Invite redeemed", "Enclave verified the email identity", true),
      event("t4", 60, "agreement_signed", "Agreement signed", "1,200 NEAR on merge, both signatures verified", true),
      event("t5", 20, "escrow_funded", "Escrow funded", "1,200 NEAR locked until the fix merges", true),
      event("t6", 3, "pr_linked", "Fix pull request linked", "halcyon-labs/vaults#418", true),
    ],
  },
  {
    id: "rl-2c84d0",
    title: "Signature replay in cross-chain bridge relayer",
    target: "Meridian Bridge",
    repo: "meridian-xyz/relayer",
    severity: "high",
    stage: "negotiating",
    role: "researcher",
    counterparty: "Meridian core devs",
    createdAt: hoursAgo(50),
    updatedAt: hoursAgo(5),
    disclosureDeadline: daysFromNow(54),
    summary: "Relayer signatures omit the destination chain id, so a message can be replayed on a second chain.",
    body: "## Summary\n\nRelayer messages are signed without a chain id.\n\n## Impact\n\nReplay of a mint message on a sister chain.",
    contentHash: fakeHash("rl-2c84d0-body"),
    invites: [{ id: "i3", channel: "github", handle: "meridian-xyz", status: "redeemed" }],
    messages: [
      { id: "m5", from: "team", author: "Meridian core", at: hoursAgo(8), body: "Thanks. Can you share whether the replay needs a validator key?", hash: fakeHash("m5") },
      { id: "m6", from: "researcher", author: "you", at: hoursAgo(5), body: "No key needed. The relayer accepts any well-formed signature from the previous epoch.", hash: fakeHash("m6") },
    ],
    timeline: [
      event("t7", 50, "sealed", "Report sealed", undefined, true),
      event("t8", 46, "invite_sent", "Invite sent", "GitHub org: meridian-xyz"),
      event("t9", 30, "invite_redeemed", "Invite redeemed", "Enclave verified GitHub org membership", true),
    ],
  },
  {
    id: "rl-91be55",
    title: "Unauthenticated admin route in dashboard API",
    target: "Parsley CRM",
    repo: "parsley-hq/api",
    severity: "high",
    stage: "invited",
    role: "researcher",
    counterparty: "Parsley (awaiting reply)",
    createdAt: hoursAgo(190),
    updatedAt: hoursAgo(180),
    disclosureDeadline: daysFromNow(9),
    summary: "The /internal/export route skips the auth middleware and returns every customer record.",
    body: "## Summary\n\nThe export route is mounted before the auth middleware.",
    contentHash: fakeHash("rl-91be55-body"),
    invites: [
      { id: "i4", channel: "email", handle: "hello@parsley.example", status: "pending" },
      { id: "i5", channel: "telegram", handle: "@parsley_founder", status: "expired" },
    ],
    messages: [],
    timeline: [
      event("t10", 190, "sealed", "Report sealed", undefined, true),
      event("t11", 188, "invite_sent", "Invites sent", "2 recipients: email and Telegram"),
      event("t12", 24, "disclosure_notice", "Deadline approaching", "No response yet. Publishing unlocks in 9 days."),
    ],
  },
  {
    id: "rl-0d5e12",
    title: "Predictable nonce in password reset tokens",
    target: "Northwind Auth",
    repo: "northwind/auth-service",
    severity: "medium",
    stage: "published",
    role: "researcher",
    counterparty: "Northwind security",
    createdAt: hoursAgo(700),
    updatedAt: hoursAgo(120),
    disclosureDeadline: daysFromNow(-10),
    rewardNear: 340,
    summary: "Reset tokens are seeded from a millisecond clock, so tokens can be predicted.",
    body: "## Summary\n\nReset tokens use a timestamp-seeded PRNG, so an attacker who knows roughly when a reset was requested can enumerate the small space of possible tokens.\n\n```js\nconst token = sha1(String(Date.now())).slice(0, 12);\n```\n\n## Fix\n\nUse `crypto.randomBytes(32)` and store only a hash of the token.",
    contentHash: fakeHash("rl-0d5e12-body"),
    escrow: {
      amountNear: 340,
      funded: true,
      expiresAt: daysFromNow(-5),
      contractId: "escrow.redline.testnet",
      pullRequestUrl: "https://github.com/northwind/auth-service/pull/92",
      mergeCheck: "merged",
    },
    invites: [{ id: "i6", channel: "email", handle: "security@northwind.example", status: "redeemed" }],
    messages: [],
    timeline: [
      event("t13", 700, "sealed", "Report sealed", undefined, true),
      event("t14", 420, "agreement_signed", "Agreement signed", "340 NEAR on merge", true),
      event("t15", 300, "escrow_funded", "Escrow funded", undefined, true),
      event("t16", 121, "pr_merged", "Fix merged", "Enclave checked northwind/auth-service#92", true),
      event("t17", 120, "payout", "340 NEAR paid", "Released to the researcher", true),
      event("t19", 24, "published", "Disclosure published", "Report, fix and payout evidence are now public", true),
    ],
  },
  {
    id: "rl-b8a413",
    title: "Stored XSS through markdown image alt text",
    target: "Lantern Docs",
    repo: "lantern-io/docs-app",
    severity: "medium",
    stage: "sealed",
    role: "researcher",
    counterparty: "Not invited yet",
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
    disclosureDeadline: daysFromNow(90),
    summary: "Alt text is injected unescaped into the rendered preview.",
    body: "## Summary\n\nImage alt text is rendered as HTML in the preview pane.",
    contentHash: fakeHash("rl-b8a413-body"),
    invites: [],
    messages: [],
    timeline: [event("t18", 2, "sealed", "Report sealed", "Hash logged on chain", true)],
  },
];

export function findSampleReport(id: string): Report | undefined {
  return sampleReports.find((r) => r.id === id);
}
