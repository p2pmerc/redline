import { createHash, randomBytes, randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { cleanName, type Caller, type TokenVerifier } from "./privy-token-verifier.js";
import type { ReportStore } from "./report-store.js";
import type { StoredReport, TimelineEntry } from "./report-records.js";
import type { ServerConfig } from "./server-config.js";
import type { MergeLookup } from "./github-merge-lookup.js";
import * as ledger from "./escrow-ledger.js";
import { LedgerError } from "./escrow-ledger.js";
import { partyView, publicView, roleOf, summaryView } from "./report-views.js";
import { openCiphertext } from "./report-ciphertext.js";

export interface ApiDeps {
  config: ServerConfig;
  store: ReportStore;
  verifyToken: TokenVerifier;
  mergeLookup: MergeLookup;
  now?: () => Date;
}

const hex = (max: number) => z.string().regex(/^[0-9a-f]+$/i).min(2).max(max);
const hash64 = z.string().regex(/^[0-9a-f]{64}$/i);

const createReportBody = z.object({
  title: z.string().trim().min(4).max(140),
  target: z.string().trim().max(100).default(""),
  repo: z.string().trim().regex(ledger.REPO_PATTERN).optional().or(z.literal("").transform(() => undefined)),
  severity: z.enum(["critical", "high", "medium", "low"]),
  summary: z.string().trim().max(400).default(""),
  disclosureDays: z.number().int().min(7).max(180),
  ciphertextHex: hex(2_000_000),
  contentHash: hash64,
  sealedKeyHex: hex(4000).optional(),
});
const inviteBody = z.object({ channel: z.enum(["email", "x", "telegram", "github"]), handle: z.string().trim().min(2).max(120) });
const messageBody = z.object({ ciphertextHex: hex(40_000), hash: hash64 });
const termsBody = z.object({ amountNear: z.number().positive().max(1_000_000), repo: z.string().trim().regex(ledger.REPO_PATTERN) });
const prBody = z.object({ url: z.string().trim().max(200) });
const publishBody = z.object({ body: z.string().min(1).max(500_000), keyHex: hex(64) });

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const sha256 = (hexString: string) => createHash("sha256").update(Buffer.from(hexString, "hex")).digest("hex");
const newId = () => `rl_${randomBytes(6).toString("hex")}`;

type AuthedRequest = Request & { caller: Caller };

export function createApiRouter(deps: ApiDeps): express.Router {
  const { config, store, verifyToken, mergeLookup } = deps;
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
    (req as AuthedRequest).caller = { userId, name: cleanName(req.header("x-redline-name")) };
    next();
  };

  const caller = (req: Request) => (req as AuthedRequest).caller;
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

  router.get("/public/disclosures", (_req, res) => {
    const items = store.all().filter((r) => r.published).sort((a, b) => b.published!.at.localeCompare(a.published!.at)).map(publicView);
    res.json({ disclosures: items });
  });

  router.get("/public/disclosures/:id", (req, res) => {
    const report = store.get(String(req.params.id));
    if (!report?.published) throw new HttpError(404, "This disclosure is not public.");
    res.json(publicView(report));
  });

  // ------------------------------------------------------------------ authenticated
  router.use(requireAuth);

  router.get("/reports", (req, res) => {
    const { userId } = caller(req);
    const items = store.all()
      .map((r) => ({ r, role: roleOf(r, userId) }))
      .filter((x): x is { r: StoredReport; role: "researcher" | "team" } => !!x.role)
      .sort((a, b) => b.r.updatedAt.localeCompare(a.r.updatedAt))
      .map(({ r, role }) => summaryView(r, role, config.ledgerMode, contractId));
    res.json({ reports: items });
  });

  router.post("/reports", (req, res) => {
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
    log(report, { kind: "sealed", title: "Report sealed", detail: `Hash ${report.contentHash.slice(0, 12)}…`, txHash: ledger.previewTxHash(report.id, "register") });
    store.insert(report);
    res.status(201).json(view(report, "researcher"));
  });

  router.get("/reports/:id", (req, res) => {
    const { report, role } = party(req);
    res.json(view(report, role));
  });

  router.post("/reports/:id/invites", (req, res) => {
    const { report, role } = party(req);
    if (role !== "researcher") throw new HttpError(403, "Only the researcher can invite people.");
    if (report.invites.length >= 10) throw new HttpError(409, "Too many invites on this report.");
    const input = inviteBody.parse(req.body);
    report.invites.push({ id: randomUUID(), token: randomBytes(24).toString("base64url"), channel: input.channel, handle: input.handle, status: "pending", createdAt: clock().toISOString() });
    log(report, { kind: "invite_sent", title: "Invite created", detail: `${input.channel}: ${input.handle}` });
    store.save(report);
    res.status(201).json(view(report, role));
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
      if (config.ledgerMode !== "preview") throw new HttpError(501, "The testnet contract is not connected yet.");
      // Work on a copy so a failed transition leaves the stored record untouched.
      const draft = structuredClone(report);
      await run(draft, role, req);
      store.save(draft);
      res.json(view(draft, role));
    }));

  ledgerAction("terms", (r, role, req) => {
    const input = termsBody.parse(req.body);
    ledger.proposeTerms(r, role, input.amountNear, input.repo, clock());
  });
  ledgerAction("terms/accept", (r, role) => ledger.acceptTerms(r, role, clock()));
  ledgerAction("fund", (r, role) => ledger.fundEscrow(r, role, clock()));
  ledgerAction("pull-request", (r, role, req) => ledger.linkPullRequest(r, role, prBody.parse(req.body).url, clock()));

  ledgerAction("check-merge", async (r) => {
    if (r.status !== "funded" || !r.escrow?.pullRequest || !r.escrow.repo) throw new LedgerError("link a pull request first");
    const answer = await mergeLookup(r.escrow.repo, r.escrow.pullRequest);
    ledger.applyConfirmAnswer(r, answer, clock());
  });

  ledgerAction("claim", async (r, role) => {
    if (role !== "researcher") throw new LedgerError("only the researcher can claim", 403);
    if (r.status !== "merge_confirmed" || !r.escrow?.pullRequest || !r.escrow.repo) throw new LedgerError("the merge has not been confirmed yet");
    const answer = await mergeLookup(r.escrow.repo, r.escrow.pullRequest);
    ledger.applyPayoutAnswer(r, role, answer, clock());
  });

  ledgerAction("refund", async (r, role) => {
    if (role !== "team") throw new LedgerError("only the team can refund", 403);
    if (!ledger.canRefund(r, clock())) throw new LedgerError("the escrow has not expired, or there is nothing to refund");
    const e = r.escrow!;
    const answer: ledger.MergeAnswer = e.pullRequest && e.repo ? await mergeLookup(e.repo, e.pullRequest) : { status: "not_merged" };
    ledger.applyRefundAnswer(r, role, answer, clock());
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
