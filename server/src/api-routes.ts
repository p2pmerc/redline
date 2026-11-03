import { createHash, randomBytes, randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { cleanName, type Caller, type TokenVerifier } from "./privy-token-verifier.js";
import type { ReportStore } from "./report-store.js";
import { ProfileStore, type ResearcherProfile } from "./profile-store.js";
import type { InviteRecord, StoredReport, TimelineEntry } from "./report-records.js";
import type { ServerConfig } from "./server-config.js";
import type { MergeLookup } from "./github-merge-lookup.js";
import * as ledger from "./escrow-ledger.js";
import { LedgerError, type MergeAnswer } from "./escrow-ledger.js";
import { isPublic, partyView, publicView, roleOf, summaryView, type PublicAuthor } from "./report-views.js";
import { openCiphertext } from "./report-ciphertext.js";
import { ChainError, type ChainRelay } from "./chain-relay.js";
import { sendInviteEmail } from "./invite-email.js";
import { exclusive, NEAR_CHECK_DEPOSIT, runClaim, runMergeCheck, settled, stamp, verdictOf, type SettlementContext } from "./settlement.js";
import { isTestnetAccountId, type AccountChecker } from "./near-account.js";

export interface ApiDeps {
  config: ServerConfig;
  store: ReportStore;
  profiles?: ProfileStore;
  verifyToken: TokenVerifier;
  mergeLookup: MergeLookup;
  /** Signs contract calls for the demo parties. Needed when the ledger mode is "testnet". */
  relay?: ChainRelay;
  /** Looks up a testnet account. Defaults to accepting well-formed ids when not given. */
  accountExists?: AccountChecker;
  now?: () => Date;
}

const hex = (max: number) => z.string().regex(/^[0-9a-f]+$/i).min(2).max(max);
const hash64 = z.string().regex(/^[0-9a-f]{64}$/i);

const HANDLE = /^[a-z0-9][a-z0-9_-]{2,29}$/;
const linkField = (hosts: string[]) => z.string().trim().max(200).optional().transform((v) => v || undefined).refine((v) => {
  if (!v) return true;
  try { const u = new URL(v); return u.protocol === "https:" && hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)); } catch { return false; }
}, "Use a full https link on the right site.");
const websiteField = z.string().trim().max(200).optional().transform((v) => v || undefined).refine((v) => {
  if (!v) return true;
  try { return new URL(v).protocol === "https:"; } catch { return false; }
}, "Use a full https link.");
const profileBody = z.object({
  handle: z.string().trim().toLowerCase().regex(HANDLE, "3 to 30 characters: a-z, 0-9, dash or underscore."),
  displayName: z.string().trim().min(2).max(60),
  bio: z.string().trim().max(400).default(""),
  skills: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  links: z.object({ github: linkField(["github.com"]), x: linkField(["x.com", "twitter.com"]), website: websiteField }).default({ github: undefined, x: undefined, website: undefined }),
  avatarSeed: z.string().regex(/^[a-z0-9]{6,32}$/i),
  payoutAccount: z.string().trim().toLowerCase().max(64).optional().transform((v) => v || undefined),
});

const createReportBody = z.object({
  title: z.string().trim().min(4).max(140),
  target: z.string().trim().max(100).default(""),
  repo: z.string().trim().optional().or(z.literal("").transform(() => undefined)).transform((v, ctx) => {
    if (v == null || v === "") return undefined;
    const normalized = ledger.normalizeRepoRef(v);
    if (!normalized) { ctx.addIssue({ code: "custom", message: "Use owner/name or a github.com/owner/name URL" }); return z.NEVER; }
    return normalized;
  }),
  severity: z.enum(["critical", "high", "medium", "low"]),
  summary: z.string().trim().max(400).default(""),
  disclosureDays: z.number().int().min(7).max(180),
  ciphertextHex: hex(2_000_000),
  contentHash: hash64,
  sealedKeyHex: hex(4000).optional(),
});
const inviteBody = z.object({
  channel: z.enum(["email", "x", "telegram", "github"]),
  handle: z.string().trim().min(2).max(120),
  /** Browser-only report key. Used once to build the #k= invite URL for email; never stored or logged. */
  reportKeyHex: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
});
const deviceKeyBody = z.object({ devicePubHex: z.string().regex(/^[0-9a-fA-F]{130}$/) });
const keyWrapsBody = z.object({
  wraps: z.array(z.object({
    userId: z.string().min(3).max(128),
    devicePubHex: z.string().regex(/^[0-9a-fA-F]{130}$/),
    wrapHex: z.string().regex(/^[0-9a-fA-F]+$/i).min(100).max(4000),
  })).min(1).max(20),
});
const messageBody = z.object({ ciphertextHex: hex(40_000), hash: hash64 });
const termsBody = z.object({
  amountNear: z.number().positive().max(1_000_000),
  repo: z.string().trim().transform((v, ctx) => {
    const normalized = ledger.normalizeRepoRef(v);
    if (!normalized) { ctx.addIssue({ code: "custom", message: "Use owner/name or a github.com/owner/name URL" }); return z.NEVER; }
    return normalized;
  }),
});
const prBody = z.object({ url: z.string().trim().max(200) });
const publishBody = z.object({ body: z.string().min(1).max(500_000), keyHex: hex(64) });

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const sha256 = (hexString: string) => createHash("sha256").update(Buffer.from(hexString, "hex")).digest("hex");
const NEAR_FEE = 10n ** 22n; // 0.01 NEAR registration storage fee
const newId = () => `rl-${randomBytes(6).toString("hex")}`;

/** The GitHub login in a profile link such as https://github.com/p2pmerc. */
export function githubLoginFromLink(link?: string): string | undefined {
  if (!link) return undefined;
  try {
    const part = new URL(link).pathname.split("/").filter(Boolean)[0];
    return part ? part.replace(/^@/, "").toLowerCase() : undefined;
  } catch { return undefined; }
}

type AuthedRequest = Request & { caller: Caller };

export function createApiRouter(deps: ApiDeps): express.Router {
  const { config, store, verifyToken, mergeLookup, relay } = deps;
  const live = config.ledgerMode === "testnet";
  const needRelay = (): ChainRelay => {
    if (!relay) throw new HttpError(501, "The testnet contract is not connected yet.");
    return relay;
  };
  const profiles = deps.profiles ?? new ProfileStore(null);
  const githubLoginOf = (userId: string): string | undefined => githubLoginFromLink(profiles.get(userId)?.links.github);
  const settlement: SettlementContext = { live, relay, mergeLookup, now: () => (deps.now ?? (() => new Date()))(), githubLoginOf };
  const authorOf = (userId: string): PublicAuthor | undefined => {
    const p = profiles.get(userId);
    return p ? { handle: p.handle, displayName: p.displayName, avatarSeed: p.avatarSeed } : undefined;
  };
  const publicProfile = (p: ResearcherProfile) => ({ handle: p.handle, displayName: p.displayName, bio: p.bio, skills: p.skills, links: p.links, avatarSeed: p.avatarSeed, joinedAt: p.createdAt });
  const clock = deps.now ?? (() => new Date());
  const router = express.Router();
  const contractId = config.ledgerMode === "preview" ? "Preview ledger" : config.escrowContractId;
  const view = (r: StoredReport, role: "researcher" | "team") => partyView(r, role, config.ledgerMode, contractId);

  const handler = (fn: (req: Request, res: Response) => Promise<void> | void) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

  const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return next(new HttpError(401, "Sign in to continue."));
    let userId: string;
    try {
      userId = await verifyToken(token);
    } catch {
      return next(new HttpError(401, "Your session expired. Sign in again."));
    }
    (req as unknown as AuthedRequest).caller = { userId, name: cleanName(req.header("x-redline-name")) };
    next();
  };

  const caller = (req: Request) => (req as unknown as AuthedRequest).caller;
  const party = (req: Request) => {
    const report = store.get(String(req.params.id));
    const role = report ? roleOf(report, caller(req).userId) : undefined;
    // Same answer for "missing" and "not yours", so ids cannot be probed.
    if (!report || !role) throw new HttpError(404, "This report does not exist, or you do not have access to it.");
    return { report, role };
  };
  const log = (report: StoredReport, entry: Omit<TimelineEntry, "id" | "at">) => {
    report.timeline.push({ id: randomUUID(), at: clock().toISOString(), ...entry });
    report.updatedAt = clock().toISOString();
  };

  // ------------------------------------------------------------------ public
  router.get("/health", (_req, res) => { res.json({ ok: true, ledgerMode: config.ledgerMode }); });

  router.get("/config", (_req, res) => {
    res.json({ ledgerMode: config.ledgerMode, escrowContractId: config.escrowContractId, enclavePublicKey: config.enclavePublicKey, privyAppId: config.privyAppId });
  });

  const publicItems = () => store.all().filter(isPublic).sort((a, b) => publicView(b).publishedAt.localeCompare(publicView(a).publishedAt));

  router.get("/public/disclosures", (_req, res) => {
    res.json({ disclosures: publicItems().map((r) => publicView(r, authorOf(r.researcherId))) });
  });

  router.get("/public/disclosures/:id", (req, res) => {
    const report = store.get(String(req.params.id));
    if (!report || !isPublic(report)) throw new HttpError(404, "This disclosure is not public.");
    res.json(publicView(report, authorOf(report.researcherId)));
  });

  router.get("/public/researchers/:handle", (req, res) => {
    const profile = profiles.byHandle(String(req.params.handle));
    if (!profile) throw new HttpError(404, "No researcher has that handle.");
    const mine = publicItems().filter((r) => r.researcherId === profile.userId);
    const paid = mine.filter((r) => r.status === "paid");
    res.json({
      profile: publicProfile(profile),
      stats: {
        reports: mine.length,
        paid: paid.length,
        disclosed: mine.filter((r) => !!r.published).length,
        totalPaidNear: paid.reduce((sum, r) => sum + (r.escrow?.amountNear ?? 0), 0),
      },
      reports: mine.map((r) => publicView(r, authorOf(r.researcherId))),
    });
  });

  // ------------------------------------------------------------------ authenticated
  router.use(requireAuth);

  const ownProfile = (p: ResearcherProfile) => ({ ...publicProfile(p), payoutAccount: p.payoutAccount });

  router.get("/profile", (req, res) => {
    const p = profiles.get(caller(req).userId);
    res.json({ profile: p ? ownProfile(p) : null });
  });

  router.put("/profile", handler(async (req, res) => {
    const { userId } = caller(req);
    const input = profileBody.parse(req.body);
    const taken = profiles.byHandle(input.handle);
    if (taken && taken.userId !== userId) throw new HttpError(409, "That handle is taken. Pick another.");
    if (input.payoutAccount) {
      if (!isTestnetAccountId(input.payoutAccount)) throw new HttpError(400, "Enter an existing NEAR testnet account, like yourname.testnet.");
      let found = true;
      if (deps.accountExists) {
        try { found = await deps.accountExists(input.payoutAccount); } catch { throw new HttpError(502, "Could not reach NEAR testnet to check that account. Try again."); }
      }
      if (!found) throw new HttpError(400, `${input.payoutAccount} does not exist on NEAR testnet. Create it first, or use another account.`);
    }
    const now = clock().toISOString();
    const existing = profiles.get(userId);
    const next: ResearcherProfile = { userId, ...input, links: input.links, createdAt: existing?.createdAt ?? now, updatedAt: now };
    profiles.save(next);
    res.json({ profile: ownProfile(next) });
  }));

  router.get("/reports", (req, res) => {
    const { userId } = caller(req);
    const items = store.all()
      .map((r) => ({ r, role: roleOf(r, userId) }))
      .filter((x): x is { r: StoredReport; role: "researcher" | "team" } => !!x.role)
      .sort((a, b) => b.r.updatedAt.localeCompare(a.r.updatedAt))
      .map(({ r, role }) => summaryView(r, role, config.ledgerMode, contractId));
    res.json({ reports: items });
  });

  router.post("/reports", handler(async (req, res) => {
    const input = createReportBody.parse(req.body);
    if (sha256(input.ciphertextHex) !== input.contentHash.toLowerCase()) throw new HttpError(400, "The content hash does not match the ciphertext.");
    if (input.ciphertextHex.length < 2 * (12 + 16 + 1)) throw new HttpError(400, "That does not look like a sealed report.");
    const now = clock();
    const report: StoredReport = {
      id: newId(),
      researcherId: caller(req).userId,
      researcherName: caller(req).name,
      title: input.title,
      target: input.target,
      repo: input.repo,
      severity: input.severity,
      summary: input.summary,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      disclosureDeadline: new Date(now.getTime() + input.disclosureDays * 86_400_000).toISOString(),
      contentHash: input.contentHash.toLowerCase(),
      ciphertextHex: input.ciphertextHex.toLowerCase(),
      sealedKeyHex: input.sealedKeyHex?.toLowerCase(),
      status: "registered",
      invites: [],
      messages: [],
      timeline: [],
    };
    const payoutAccount = profiles.get(report.researcherId)?.payoutAccount;
    if (payoutAccount) report.payoutAccount = payoutAccount;
    let sealTx = ledger.previewTxHash(report.id, "register");
    if (live) {
      const chain = needRelay();
      // The contract wants the disclosure date at least 7 days past the block time.
      const day = 86_400_000;
      const deadlineMs = Math.min(Math.max(new Date(report.disclosureDeadline).getTime(), now.getTime() + 7 * day + 3_600_000), now.getTime() + 364 * day);
      const registered = await chain.call("researcher", "register_report", { report_id: report.id, content_hash: report.contentHash, disclosure_deadline_ns: BigInt(deadlineMs) * 1_000_000n, payout_account: payoutAccount ?? null }, NEAR_FEE);
      await chain.call("researcher", "set_team_account", { report_id: report.id, team: chain.teamAccountId });
      sealTx = registered.txHash;
    }
    log(report, { kind: "sealed", title: "Report sealed", detail: `Hash ${report.contentHash.slice(0, 12)}…`, txHash: sealTx });
    store.insert(report);
    res.status(201).json(view(report, "researcher"));
  }));

  router.get("/reports/:id", (req, res) => {
    const { report, role } = party(req);
    res.json(view(report, role));
  });

  router.post("/reports/:id/invites", handler(async (req, res) => {
    const { report, role } = party(req);
    if (role !== "researcher") throw new HttpError(403, "Only the researcher can invite people.");
    if (report.invites.length >= 10) throw new HttpError(409, "Too many invites on this report.");
    const input = inviteBody.parse(req.body);
    const token = randomBytes(24).toString("base64url");
    const invite: InviteRecord = {
      id: randomUUID(), token, channel: input.channel, handle: input.handle, status: "pending",
      createdAt: clock().toISOString(),
      delivery: { state: "idle" },
    };
    // Build the private invite URL in memory only. Never log it (may contain #k=).
    const keyFrag = input.reportKeyHex ? `#k=${input.reportKeyHex.toLowerCase()}` : "";
    const inviteUrl = `${config.appOrigin}/app/invite/${token}${keyFrag}`;

    if (input.channel === "email") {
      if (!config.agentMailApiKey || !config.agentMailInboxId) {
        invite.delivery = { state: "failed", at: clock().toISOString(), error: "Email sending is not configured on this server yet." };
      } else {
        invite.delivery = { state: "sending", at: clock().toISOString() };
        report.invites.push(invite);
        log(report, { kind: "invite_sent", title: "Invite created", detail: `${input.channel}: ${input.handle}` });
        store.save(report);
        try {
          const profile = profiles.get(report.researcherId);
          const sent = await sendInviteEmail(
            { apiKey: config.agentMailApiKey, inboxId: config.agentMailInboxId },
            {
              to: input.handle,
              inviteUrl,
              researcherName: profile?.displayName || report.researcherName,
              researcherHandle: profile?.handle,
              repo: report.repo,
              severity: report.severity,
              title: report.title,
              summary: report.summary || undefined,
              disclosureDeadline: report.disclosureDeadline,
              appOrigin: config.appOrigin,
            },
          );
          invite.delivery = { state: "sent", at: clock().toISOString(), messageId: sent.messageId };
          store.save(report);
        } catch (e) {
          invite.delivery = { state: "failed", at: clock().toISOString(), error: e instanceof Error ? e.message.slice(0, 200) : "Send failed" };
          store.save(report);
        }
        return void res.status(201).json(view(report, role));
      }
    } else if (input.channel === "x" || input.channel === "telegram") {
      // Client opens a one-click DM with the invite URL; we mark ready (URL returned via token only to researcher).
      invite.delivery = { state: "ready", at: clock().toISOString() };
    }

    report.invites.push(invite);
    log(report, { kind: "invite_sent", title: "Invite created", detail: `${input.channel}: ${input.handle}` });
    store.save(report);
    res.status(201).json(view(report, role));
  }));

  /** Register this browser's device public key so a party who holds the report key can escrow a wrap for you. */
  router.post("/reports/:id/device-key", (req, res) => {
    const { report, role } = party(req);
    const user = (req as unknown as AuthedRequest).caller;
    const { devicePubHex } = deviceKeyBody.parse(req.body);
    const pub = devicePubHex.toLowerCase();
    report.deviceKeys = report.deviceKeys ?? [];
    report.deviceKeys = report.deviceKeys.filter((d) => !(d.userId === user.userId && d.devicePubHex === pub));
    report.deviceKeys.push({ userId: user.userId, devicePubHex: pub, at: clock().toISOString() });
    // Keep the list small.
    if (report.deviceKeys.length > 40) report.deviceKeys = report.deviceKeys.slice(-40);
    report.updatedAt = clock().toISOString();
    store.save(report);
    res.json({ ok: true, devicePubHex: pub, role });
  });

  /** List device pubs for parties on this report (researcher + redeemed team), so a browser holding the key can wrap it. */
  router.get("/reports/:id/device-keys", (req, res) => {
    const { report } = party(req);
    const partyIds = new Set([report.researcherId, ...(report.teamId ? [report.teamId] : [])]);
    const keys = (report.deviceKeys ?? []).filter((d) => partyIds.has(d.userId));
    res.json({ keys });
  });

  /** Deposit ciphertext-only wraps. Caller must already hold the report key in their browser (enforced client-side). */
  router.post("/reports/:id/key-wraps", (req, res) => {
    const { report, role } = party(req);
    if (role !== "researcher" && role !== "team") throw new HttpError(403, "Only parties to the report can deposit wraps.");
    const input = keyWrapsBody.parse(req.body);
    const partyIds = new Set([report.researcherId, ...(report.teamId ? [report.teamId] : [])]);
    report.keyWraps = report.keyWraps ?? [];
    for (const w of input.wraps) {
      if (!partyIds.has(w.userId)) throw new HttpError(400, "Wraps are only for the researcher or the redeemed security contact.");
      const pub = w.devicePubHex.toLowerCase();
      const wrapHex = w.wrapHex.toLowerCase();
      report.keyWraps = report.keyWraps.filter((x) => !(x.userId === w.userId && x.devicePubHex === pub));
      report.keyWraps.push({ userId: w.userId, devicePubHex: pub, wrapHex, at: clock().toISOString() });
    }
    if (report.keyWraps.length > 60) report.keyWraps = report.keyWraps.slice(-60);
    report.updatedAt = clock().toISOString();
    store.save(report);
    res.json({ ok: true, count: input.wraps.length });
  });

  /** Fetch wraps for the signed-in user only. */
  router.get("/reports/:id/key-wraps/me", (req, res) => {
    const { report } = party(req);
    const user = (req as unknown as AuthedRequest).caller;
    const wraps = (report.keyWraps ?? []).filter((w) => w.userId === user.userId).map((w) => ({ devicePubHex: w.devicePubHex, wrapHex: w.wrapHex, at: w.at }));
    res.json({ wraps });
  });

  // Revoking closes the door at once: a redeemed member stops being a party, so every read of the
  // report and the chat answers 404 for them. Only allowed before the escrow holds money.
  router.post("/reports/:id/invites/:inviteId/revoke", (req, res) => {
    const { report, role } = party(req);
    if (role !== "researcher") throw new HttpError(403, "Only the researcher can withdraw an invite.");
    const invite = report.invites.find((i) => i.id === req.params.inviteId);
    if (!invite) throw new HttpError(404, "That invite does not exist.");
    if (invite.status === "revoked") return void res.json(view(report, role));
    if (invite.status === "redeemed" && report.escrow) throw new HttpError(409, "Funds are in escrow, so the security contact can no longer be removed.");
    const wasMember = invite.status === "redeemed";
    invite.status = "revoked";
    if (wasMember) {
      report.teamId = undefined;
      report.teamName = undefined;
      report.terms = undefined;
      report.status = "registered";
      report.messages = []; // the next person invited must not inherit the previous negotiation
    }
    log(report, { kind: "invite_revoked", title: "Invite withdrawn", detail: `${invite.channel}: ${invite.handle}` });
    store.save(report);
    res.json(view(report, role));
  });

  router.get("/invites/:token", (req, res) => {
    const found = store.findInvite(String(req.params.token));
    if (!found) throw new HttpError(404, "This invite link is not valid.");
    const { report } = found;
    res.json({
      reportId: report.id,
      title: report.title,
      from: report.researcherName,
      severity: report.severity,
      alreadyJoined: report.teamId === caller(req).userId || report.researcherId === caller(req).userId,
      taken: !!report.teamId && report.teamId !== caller(req).userId,
    });
  });

  router.post("/invites/:token/redeem", (req, res) => {
    const found = store.findInvite(String(req.params.token));
    if (!found) throw new HttpError(404, "This invite link is not valid.");
    const { report, inviteId } = found;
    const user = caller(req);
    if (report.researcherId === user.userId) throw new HttpError(400, "You filed this report, so you cannot redeem its invite.");
    if (report.teamId && report.teamId !== user.userId) throw new HttpError(409, "This report already has a security contact.");
    if (!report.teamId) {
      report.teamId = user.userId;
      report.teamName = user.name;
      const invite = report.invites.find((i) => i.id === inviteId)!;
      invite.status = "redeemed";
      log(report, { kind: "invite_redeemed", title: "Invite redeemed", detail: `${invite.channel}: ${invite.handle}` });
      store.save(report);
    }
    res.json(view(report, "team"));
  });

  router.post("/reports/:id/messages", (req, res) => {
    const { report, role } = party(req);
    if (!report.teamId) throw new HttpError(409, "Chat opens after the invite is redeemed.");
    if (report.published) throw new HttpError(409, "This report is already public.");
    const input = messageBody.parse(req.body);
    if (sha256(input.ciphertextHex) !== input.hash.toLowerCase()) throw new HttpError(400, "The message hash does not match.");
    if (report.messages.length >= 500) throw new HttpError(409, "Message limit reached for this report.");
    const name = role === "researcher" ? report.researcherName : report.teamName ?? "Team";
    report.messages.push({ id: randomUUID(), role, authorName: name, ciphertextHex: input.ciphertextHex.toLowerCase(), hash: input.hash.toLowerCase(), at: clock().toISOString() });
    report.updatedAt = clock().toISOString();
    store.save(report);
    res.status(201).json(view(report, role));
  });

  const ledgerAction = (name: string, run: (report: StoredReport, role: "researcher" | "team", req: Request) => Promise<void> | void) =>
    router.post(`/reports/:id/${name}`, handler(async (req, res) => {
      const { report, role } = party(req);
      if (live) needRelay();
      // One chain action per report at a time, shared with the payout poller.
      await exclusive(report.id, async () => {
        // Work on a copy so a failed transition leaves the stored record untouched.
        const draft = structuredClone(store.get(report.id) ?? report);
        await run(draft, role, req);
        store.save(draft);
        res.json(view(draft, role));
      });
    }));

  const yocto = (near: number) => String(BigInt(Math.round(near * 1_000_000)) * 10n ** 18n);
  const termsHash = (r: StoredReport) => createHash("sha256").update(`${r.id}|${r.terms?.amountNear}|${r.terms?.repo}`).digest("hex");

  ledgerAction("terms", async (r, role, req) => {
    const input = termsBody.parse(req.body);
    ledger.proposeTerms(r, role, input.amountNear, input.repo, clock());
    if (live) stamp(r, (await needRelay().call("team", "propose_terms", { report_id: r.id, amount: yocto(input.amountNear), repo: input.repo, terms_hash: termsHash(r) })).txHash);
  });
  /** Binds the researcher's profile payout account to the report, on chain in live mode. Only before funding. */
  const bindPayout = async (r: StoredReport) => {
    const account = profiles.get(r.researcherId)?.payoutAccount;
    if (!account) throw new LedgerError("Set a payout NEAR account in your profile first, so the reward is paid to your own wallet.");
    if (r.payoutAccount === account) return;
    if (!["registered", "terms_proposed", "terms_accepted"].includes(r.status)) throw new LedgerError("the payout account is locked once the escrow is funded");
    let txHash: string | undefined;
    if (live) txHash = (await needRelay().call("researcher", "set_payout_account", { report_id: r.id, payout_account: account })).txHash;
    r.payoutAccount = account;
    log(r, { kind: "payout_account", title: "Payout account set", detail: `${account}${live ? "" : " (preview ledger)"}`, txHash });
  };

  ledgerAction("payout-account", async (r, role) => {
    if (role !== "researcher") throw new LedgerError("only the researcher sets the payout account", 403);
    await bindPayout(r);
  });

  ledgerAction("terms/accept", async (r, role) => {
    if (role === "researcher" && profiles.get(r.researcherId)?.payoutAccount) await bindPayout(r);
    ledger.acceptTerms(r, role, clock());
    if (live) stamp(r, (await needRelay().call("researcher", "accept_terms", { report_id: r.id, terms_hash: termsHash(r) })).txHash);
  });
  ledgerAction("fund", async (r, role) => {
    ledger.fundEscrow(r, role, clock());
    if (live) stamp(r, (await needRelay().call("team", "fund_escrow", { report_id: r.id }, BigInt(yocto(r.terms!.amountNear)))).txHash);
  });
  ledgerAction("pull-request", async (r, role, req) => {
    if (live && !githubLoginOf(r.researcherId)) throw new LedgerError("Add your GitHub link to your profile first. The merged pull request must be authored by that account.");
    ledger.linkPullRequest(r, role, prBody.parse(req.body).url, clock());
    if (live) stamp(r, (await needRelay().call("researcher", "link_pull_request", { report_id: r.id, pull_request: r.escrow!.pullRequest })).txHash);
  });

  ledgerAction("check-merge", async (r) => { await runMergeCheck(settlement, r); });

  ledgerAction("claim", async (r, role) => {
    if (role !== "researcher") throw new LedgerError("only the researcher can claim", 403);
    await runClaim(settlement, r);
  });

  ledgerAction("refund", async (r, role) => {
    if (role !== "team") throw new LedgerError("only the team can refund", 403);
    if (!ledger.canRefund(r, clock())) throw new LedgerError("the escrow has not expired, or there is nothing to refund");
    const e = r.escrow!;
    if (!live) {
      const answer: ledger.MergeAnswer = e.pullRequest && e.repo ? await mergeLookup(e.repo, e.pullRequest, githubLoginOf(r.researcherId)) : { status: "not_merged" };
      ledger.applyRefundAnswer(r, role, answer, clock());
      return;
    }
    const done = await needRelay().call("team", "refund_after_expiry", { report_id: r.id }, NEAR_CHECK_DEPOSIT, 300);
    if (ledger.applyRefundAnswer(r, role, { status: verdictOf(done.logs, "Refund") }, clock())) stamp(r, done.txHash);
  });

  router.post("/reports/:id/publish", (req, res) => {
    const { report, role } = party(req);
    if (role !== "researcher") throw new HttpError(403, "Only the researcher can publish.");
    if (report.published) throw new HttpError(409, "Already published.");
    if (report.status === "merge_confirmed") throw new HttpError(409, "A payout is pending. Claim it or wait before publishing.");
    if (clock().getTime() < new Date(report.disclosureDeadline).getTime()) throw new HttpError(409, "The disclosure date has not arrived.");
    const input = publishBody.parse(req.body);
    // The server never keeps the key. It only checks that the published text is what was sealed.
    const plain = openCiphertext(report.ciphertextHex, input.keyHex);
    if (plain === undefined || plain !== input.body) throw new HttpError(400, "The key does not unseal this report to that text.");
    const evidenceHash = createHash("sha256").update(JSON.stringify({ id: report.id, contentHash: report.contentHash, body: input.body })).digest("hex");
    report.published = { at: clock().toISOString(), body: input.body, evidenceHash };
    log(report, { kind: "published", title: "Published with evidence", detail: `Evidence ${evidenceHash.slice(0, 12)}…`, txHash: ledger.previewTxHash(report.id, "publish") });
    store.save(report);
    res.json(view(report, role));
  });

  router.use((_req, _res, next) => next(new HttpError(404, "Unknown API route.")));

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Check the highlighted fields and try again.", issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    } else if (err instanceof HttpError || err instanceof LedgerError) {
      res.status(err.status).json({ error: err.message });
    } else {
      console.error("unhandled api error", err instanceof Error ? err.message : "unknown");
      res.status(500).json({ error: "Something went wrong on our side. Try again." });
    }
  });

  return router;
}
