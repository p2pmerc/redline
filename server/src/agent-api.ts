/**
 * Read-only JSON API for AI agents and other programs: /api/v1.
 *
 * Security model. Nothing here ever returns report plaintext, report keys, chat text, invitee handles or
 * emails, or session tokens. Public data is limited to what the owner already published, or to a fixed and
 * paid report's summary and proof. A private report shows metadata and hashes only. Reading more needs a
 * signed-in party to the report.
 */
import express, { type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { ApiDeps } from "./api-routes.js";
import type { StoredReport } from "./report-records.js";
import { buildLeaderboard, totalsOf, type BoardItem } from "./leaderboard.js";
import { isPublic, partyView, publicView, roleOf, stageOf, type PublicAuthor } from "./report-views.js";

/** sha256 of the enclave WASM build documented in the README. Used when the contract pins no version. */
export const DOCUMENTED_ENCLAVE_BUILD = "eee38f53a7ade0f8d7e8b0d0381e689a21b2c05b656408e6e700eda1ce8a1468";
const EXPLORER = "https://testnet.nearblocks.io";
const ID_PATTERN = /^rl-[0-9a-f]{12}$/;
const GITHUB_PR = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/;

class V1Error extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

const ONCHAIN_STATUS: Record<string, string[]> = {
  Registered: ["registered"], TermsProposed: ["terms_proposed"], TermsAccepted: ["terms_accepted"], Funded: ["funded"],
  MergeConfirmed: ["merge_confirmed"], Paying: ["merge_confirmed", "paid"], Paid: ["paid"], Refunded: ["refunded"],
};

export function createAgentRouter(deps: ApiDeps): express.Router {
  const { config, store, verifyToken, mergeLookup, chainReader } = deps;
  const live = config.ledgerMode === "testnet";
  const origin = config.appOrigin;
  const contractId = live ? config.escrowContractId : undefined;
  const clock = deps.now ?? (() => new Date());
  const router = express.Router();

  const authorOf = (r: StoredReport): PublicAuthor | undefined => {
    const p = deps.profiles?.get(r.researcherId);
    return p ? { handle: p.handle, displayName: p.displayName, avatarSeed: p.avatarSeed } : undefined;
  };
  const txLink = (hash?: string) => (live && hash ? `${EXPLORER}/txns/${hash}` : undefined);
  const stamp = (r: StoredReport, kind: string) => r.timeline.find((t) => t.kind === kind);
  const publicReports = () => store.all().filter(isPublic).sort((a, b) => publicView(b).publishedAt.localeCompare(publicView(a).publishedAt));

  const proof = (r: StoredReport) => {
    const fund = stamp(r, "escrow_funded");
    const payout = stamp(r, "payout");
    return {
      ledgerMode: config.ledgerMode,
      contractId,
      contentHash: r.contentHash,
      evidenceHash: r.published?.evidenceHash,
      fundTxHash: fund?.txHash,
      payoutTxHash: payout?.txHash,
      explorer: { contract: contractId ? `${EXPLORER}/address/${contractId}` : undefined, fundTx: txLink(fund?.txHash), payoutTx: txLink(payout?.txHash) },
    };
  };

  const summary = (r: StoredReport) => {
    const v = publicView(r, authorOf(r));
    const fund = stamp(r, "escrow_funded");
    const payout = stamp(r, "payout");
    return {
      id: r.id,
      title: r.title,
      repo: r.repo,
      target: r.target,
      severity: r.severity,
      status: stageOf(r),
      outcome: v.outcome,
      bountyNear: v.rewardNear,
      pullRequestUrl: v.pullRequestUrl,
      researcher: v.researcherHandle,
      bodyPublished: v.bodyPublished,
      fundTxHash: fund?.txHash,
      payoutTxHash: payout?.txHash,
      timestamps: { createdAt: r.createdAt, fundedAt: fund?.at, paidAt: payout?.at, publishedAt: r.published?.at, listedAt: v.publishedAt },
      links: {
        self: `${origin}/api/v1/disclosures/${r.id}`,
        verify: `${origin}/api/v1/verify/${r.id}`,
        page: `${origin}/disclosures/${r.id}`,
        fundTx: txLink(fund?.txHash),
        payoutTx: txLink(payout?.txHash),
        pullRequest: v.pullRequestUrl,
      },
    };
  };

  // Chain facts are cached for a minute so a polling agent cannot turn this endpoint into an RPC firehose.
  const cache = new Map<string, { at: number; value: unknown }>();
  const cached = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 60_000) return hit.value as T;
    const value = await fn();
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
    return value;
  };

  const enclaveInfo = async () => {
    let pinned: string | null | undefined;
    let projectId = process.env.ENCLAVE_PROJECT_ID ?? "redline-escrow.testnet/redline-enclave";
    let source: "contract" | "documented" = "documented";
    if (contractId && chainReader) {
      try {
        const cfg = await cached("config", () => chainReader.config(contractId));
        projectId = String(cfg.enclave_project_id ?? projectId);
        pinned = (cfg.enclave_version_key as string | null | undefined) ?? null;
        if (pinned) source = "contract";
      } catch { /* fall back to the documented build */ }
    }
    return {
      runtime: "OutLayer TEE worker (Intel TDX) running a WASI module",
      projectId,
      wasmSha256: pinned || DOCUMENTED_ENCLAVE_BUILD,
      wasmHashSource: source,
      pinnedOnChain: !!pinned,
      outlayerContract: "outlayer.testnet",
      enclavePublicKey: config.enclavePublicKey || undefined,
      note: "Report keys are sealed to this enclave key. Only the enclave can open one, and only for a signed-in party the contract lists.",
    };
  };

  // ------------------------------------------------------------------ plumbing
  router.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "authorization, content-type");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return void res.status(204).end();
    if (req.method !== "GET" && req.method !== "HEAD") return next(new V1Error(405, "method_not_allowed", "This API is read-only. Use GET."));
    next();
  });
  const handler = (fn: (req: Request, res: Response) => Promise<void> | void) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
  const idOf = (req: Request) => {
    const id = String(req.params.id);
    if (!ID_PATTERN.test(id)) throw new V1Error(400, "invalid_id", "Report ids look like rl-0123456789ab.");
    return id;
  };

  // ------------------------------------------------------------------ routes
  router.get("/", handler(async (_req, res) => {
    res.json(describeApi(origin));
  }));

  router.get("/disclosures", (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));
    const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    let items = publicReports().map(summary);
    if (status) items = items.filter((i) => i.status === status);
    res.json({ total: items.length, limit, offset, ledgerMode: config.ledgerMode, disclosures: items.slice(offset, offset + limit) });
  });

  router.get("/disclosures/:id", handler(async (req, res) => {
    const r = store.get(idOf(req));
    if (!r || !isPublic(r)) throw new V1Error(404, "not_public", "No public disclosure has this id.");
    const v = publicView(r, authorOf(r));
    res.json({
      ...summary(r),
      summary: r.summary,
      body: v.body,
      bodyNote: v.bodyPublished ? "Decrypted body, published by the researcher. Its hash is in proof.evidenceHash." : "The researcher has not unsealed the body. It stays encrypted; only the summary and the payout are public.",
      mergeCommit: r.status === "paid" ? r.escrow?.mergeCommit : undefined,
      proof: { ...proof(r), enclave: await enclaveInfo() },
      timeline: v.timeline.map((t) => ({ at: t.at, kind: t.kind, title: t.title, detail: t.detail, txHash: t.txHash, explorer: txLink(t.txHash) })),
    });
  }));


  /** One public disclosure, reduced to what the leaderboard counts. */
  const boardItem = (r: StoredReport): BoardItem => {
    const s = summary(r);
    return { researcher: s.researcher, severity: s.severity, outcome: s.outcome as BoardItem["outcome"], bountyNear: s.bountyNear, paidAt: s.timestamps.paidAt };
  };
  const HANDLE_PATTERN = /^[a-z0-9_-]{3,30}$/;

  router.get("/leaderboard", (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));
    const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
    const profiles = (deps.profiles?.all() ?? []).map((p) => ({ handle: p.handle, displayName: p.displayName, avatarSeed: p.avatarSeed }));
    const board = buildLeaderboard(publicReports().map(boardItem), profiles);
    res.json({
      total: board.length,
      limit,
      offset,
      ledgerMode: config.ledgerMode,
      rankedBy: "totalEarnedNear (fixed-and-paid reports), then paid count, then disclosures, then handle",
      researchers: board.slice(offset, offset + limit).map((e) => ({ ...e, links: { profile: `${origin}/researchers/${e.handle}`, api: `${origin}/api/v1/researchers/${e.handle}` } })),
    });
  });

  router.get("/researchers/:handle", (req, res) => {
    const handle = String(req.params.handle).toLowerCase();
    if (!HANDLE_PATTERN.test(handle)) throw new V1Error(400, "invalid_handle", "Handles are 3 to 30 characters: a-z, 0-9, dash or underscore.");
    const p = deps.profiles?.byHandle(handle);
    if (!p) throw new V1Error(404, "not_found", "No researcher has that handle.");
    const mine = publicReports().filter((r) => r.researcherId === p.userId);
    const all = buildLeaderboard(publicReports().map(boardItem), deps.profiles!.all().map((x) => ({ handle: x.handle, displayName: x.displayName, avatarSeed: x.avatarSeed })));
    res.json({
      handle: p.handle,
      displayName: p.displayName,
      bio: p.bio,
      skills: p.skills,
      links: p.links,
      avatarSeed: p.avatarSeed,
      joinedAt: p.createdAt,
      rank: all.find((e) => e.handle === p.handle)?.rank ?? null,
      ...totalsOf(mine.map(boardItem)),
      ledgerMode: config.ledgerMode,
      disclosures: mine.map(summary),
      profilePage: `${origin}/researchers/${p.handle}`,
    });
  });

  router.get("/reports/:id", handler(async (req, res) => {
    const id = idOf(req);
    const r = store.get(id);
    if (!r) throw new V1Error(404, "not_found", "No report has this id.");
    const header = req.header("authorization");
    if (header !== undefined) {
      const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      let userId: string;
      try { userId = await verifyToken(token); } catch { throw new V1Error(401, "invalid_token", "The bearer token is missing, expired or invalid."); }
      const role = roleOf(r, userId);
      if (!role) throw new V1Error(403, "forbidden", "This token does not belong to a party of this report.");
      const names = (uid?: string) => { const p = uid ? deps.profiles?.get(uid) : undefined; return p ? { handle: p.handle, displayName: p.displayName } : undefined; };
      const { invites: _invites, ...party } = partyView(r, role, config.ledgerMode, contractId ?? "Preview ledger", { researcher: names(r.researcherId), team: names(r.teamId) });
      // The app labels an unnamed team with its invite handle, which can be an email. Never echo that here.
      const handles = r.invites.map((i) => i.handle).filter(Boolean);
      const scrubbed = JSON.parse(handles.reduce((text, h) => text.split(JSON.stringify(h).slice(1, -1)).join("Security team"), JSON.stringify(party)));
      res.json({ access: "party", role, report: scrubbed, note: "Ciphertext only. Open it with the report key via the enclave (see README)." });
      return;
    }
    const enclave = await enclaveInfo();
    if (isPublic(r)) {
      res.json({ access: "public", report: summary(r), proof: proof(r), enclave });
      return;
    }
    res.json({
      access: "metadata_only",
      report: {
        id: r.id,
        stage: stageOf(r),
        severity: r.severity,
        createdAt: r.createdAt,
        disclosureDeadline: r.disclosureDeadline,
        contentHash: r.contentHash,
        ciphertextBytes: r.ciphertextHex.length / 2,
        hasSealedKey: !!r.sealedKeyHex,
        messageCount: r.messages.length,
      },
      onChain: { ledgerMode: config.ledgerMode, contractId, contractUrl: contractId ? `${EXPLORER}/address/${contractId}` : undefined },
      enclave,
      note: "This report is private. Title, summary, body, chat and parties are hidden. Send a Bearer token of a party to see the encrypted record.",
    });
  }));

  router.get("/verify/:id", rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many verify calls. Slow down for a minute.", code: "rate_limited" } }), handler(async (req, res) => {
    const r = store.get(idOf(req));
    if (!r || !isPublic(r)) throw new V1Error(404, "not_public", "Only public disclosures can be verified here.");
    res.json(await cached(`verify:${r.id}:${r.updatedAt}`, () => verify(r)));
  }));

  async function verify(r: StoredReport) {
    const checks: Array<{ name: string; ok: boolean | null; detail: string }> = [];
    const check = (name: string, ok: boolean | null, detail: string) => checks.push({ name, ok, detail });

    // 1. The escrow contract.
    let onChain: Record<string, unknown>;
    if (!live || !contractId || !chainReader) {
      onChain = { available: false, reason: "This deployment runs the preview ledger, there is no contract to read." };
      check("onchain.record", null, "no contract in preview mode");
    } else {
      try {
        const rec = await chainReader.report(contractId, r.id);
        if (!rec) {
          onChain = { available: true, found: false };
          check("onchain.record", false, "the contract has no record for this id");
        } else {
          const toNear = (v: unknown) => (v === undefined || v === null ? undefined : Number((BigInt(String(v)) * 1_000_000n) / 10n ** 24n) / 1_000_000);
          const status = String(rec.status);
          onChain = {
            available: true, found: true, contractId, status,
            contentHash: rec.content_hash,
            researcher: rec.researcher, team: rec.team ?? undefined,
            agreedAmountNear: toNear(rec.terms?.amount), agreedRepo: rec.terms?.repo,
            pullRequest: rec.escrow?.pull_request ?? undefined,
            mergeConfirmedAtNs: rec.escrow?.merge_confirmed_at_ns ?? undefined,
            publishedAtNs: rec.published_at_ns ?? undefined,
            evidenceHash: rec.evidence_hash ?? undefined,
            messageCount: rec.message_count,
          };
          check("onchain.content_hash", rec.content_hash === r.contentHash, "the sealed ciphertext hash on chain equals the one served here");
          check("onchain.status", (ONCHAIN_STATUS[status] ?? []).includes(r.status), `chain says ${status}, the app says ${r.status}`);
          if (r.status === "paid" || r.status === "merge_confirmed") check("onchain.paid", status === "Paid", `contract status is ${status}`);
          if (r.escrow?.pullRequest !== undefined) check("onchain.pull_request", Number(rec.escrow?.pull_request) === r.escrow.pullRequest, "the PR number locked on chain matches");
          if (r.escrow?.amountNear !== undefined && rec.terms?.amount !== undefined) check("onchain.amount", toNear(rec.terms.amount) === r.escrow.amountNear, "the agreed amount on chain matches the bounty");
          if (r.published) check("onchain.evidence_hash", rec.evidence_hash === undefined || rec.evidence_hash === null ? null : rec.evidence_hash === r.published.evidenceHash, "the evidence hash of the published body");
        }
      } catch {
        onChain = { available: false, reason: "The NEAR RPC could not be reached right now." };
        check("onchain.record", null, "RPC unavailable");
      }
    }

    // 2. The fix pull request on GitHub.
    let github: Record<string, unknown> | undefined;
    const e = r.escrow;
    if (e?.repo && e.pullRequest) {
      const seen = await mergeLookup(e.repo, e.pullRequest, r.githubLogin);
      github = { repo: e.repo, pullRequest: e.pullRequest, url: e.pullRequestUrl, status: seen.status, mergeCommit: seen.mergeCommit, reason: (seen as { reason?: string }).reason };
      check("github.merged", seen.status === "merged" ? true : seen.status === "unknown" ? null : false, `GitHub reports the pull request as ${seen.status}`);
      if (seen.mergeCommit && e.mergeCommit) check("github.merge_commit", seen.mergeCommit === e.mergeCommit.toLowerCase(), "the merge commit recorded at payout equals GitHub's");
    }

    // 3. The transactions.
    const transactions: Array<Record<string, unknown>> = [];
    const wanted: Array<{ kind: "escrow_funded" | "payout"; method: string }> = [{ kind: "escrow_funded", method: "fund_escrow" }, { kind: "payout", method: "claim_payout" }];
    for (const w of wanted) {
      const t = stamp(r, w.kind);
      if (!t?.txHash) continue;
      const row: Record<string, unknown> = { kind: w.kind, txHash: t.txHash, at: t.at, explorer: txLink(t.txHash) };
      if (live && contractId && chainReader) {
        try {
          const facts = await chainReader.tx(t.txHash, [`team.${contractId}`, `researcher.${contractId}`]);
          row.found = facts.found;
          if (facts.found) {
            Object.assign(row, { success: facts.success, signer: facts.signer, receiver: facts.receiver, methods: facts.methods, transfers: facts.transfers });
            let ok = !!facts.success && facts.receiver === contractId && !!facts.methods?.includes(w.method);
            if (w.kind === "payout" && r.payoutAccount) ok = ok && !!facts.transfers?.some((x) => x.to === r.payoutAccount && x.amountNear >= (e?.amountNear ?? 0) - 1e-6);
            row.verified = ok;
            check(`tx.${w.kind}`, ok, w.kind === "payout" ? `${w.method} succeeded and a transfer of the bounty reached ${r.payoutAccount}` : `${w.method} succeeded on ${contractId}`);
          } else check(`tx.${w.kind}`, false, "the RPC does not know this transaction");
        } catch {
          row.verified = null;
          check(`tx.${w.kind}`, null, "RPC unavailable");
        }
      }
      transactions.push(row);
    }

    const failed = checks.some((c) => c.ok === false);
    const unknown = checks.some((c) => c.ok === null);
    return {
      id: r.id, checkedAt: clock().toISOString(), ledgerMode: config.ledgerMode,
      verdict: failed ? "mismatch" : unknown ? "partial" : "verified",
      checks, onChain, github, transactions,
      enclave: await enclaveInfo(),
      note: "Everything here is read live from the NEAR RPC and the GitHub API at request time (cached for 60 seconds).",
    };
  }

  router.use((_req, _res, next) => next(new V1Error(404, "unknown_route", "Unknown /api/v1 route. GET /api/v1 lists the endpoints.")));
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof V1Error) res.status(err.status).json({ error: err.message, code: err.code });
    else {
      console.error("unhandled v1 error", err instanceof Error ? err.message : "unknown");
      res.status(500).json({ error: "Something went wrong on our side.", code: "internal" });
    }
  });
  return router;
}

export function describeApi(origin: string) {
  return {
    name: "Redline agent API",
    version: "v1",
    readOnly: true,
    auth: "None for public data. GET /reports/:id accepts an optional Authorization: Bearer token of a party to the report.",
    docs: "https://github.com/p2pmerc/redline#for-ai-agents",
    endpoints: [
      { method: "GET", path: `${origin}/api/v1/disclosures`, query: "status=paid|published, limit (max 100), offset", about: "Published and fixed-and-paid reports with bounty, PR and transaction hashes." },
      { method: "GET", path: `${origin}/api/v1/disclosures/{id}`, about: "Full public detail: published body (when unsealed), proof fields, enclave info, public timeline." },
      { method: "GET", path: `${origin}/api/v1/leaderboard`, query: "limit (max 100), offset", about: "Researchers ranked by NEAR earned from paid reports, with disclosure and paid counts and highest severity." },
      { method: "GET", path: `${origin}/api/v1/researchers/{handle}`, about: "One researcher's public profile, totals, rank and every public disclosure (bounty, PR, tx hashes). No emails, wallets or private reports." },
      { method: "GET", path: `${origin}/api/v1/reports/{id}`, about: "No auth: metadata and hashes only for private reports. Bearer of a party: the encrypted record. Wrong token: 401 or 403." },
      { method: "GET", path: `${origin}/api/v1/verify/{id}`, about: "Live check of the escrow contract, the GitHub merge and the fund and payout transactions. 20 calls a minute." },
    ],
    discovery: [`${origin}/.well-known/redline.json`, `${origin}/llms.txt`],
    errors: "Every error is JSON: { error: string, code: string }.",
  };
}

/** /.well-known/redline.json and /llms.txt, served from the site root. */
export function createDiscoveryRouter(deps: ApiDeps): express.Router {
  const origin = deps.config.appOrigin;
  const router = express.Router();
  router.get("/.well-known/redline.json", (_req, res) => {
    res.set("Access-Control-Allow-Origin", "*").json({ ...describeApi(origin), api: `${origin}/api/v1`, llmsTxt: `${origin}/llms.txt`, contractId: deps.config.escrowContractId || undefined, network: "near-testnet" });
  });
  router.get("/llms.txt", (_req, res) => {
    res.type("text/plain").send(llmsTxt(origin));
  });
  return router;
}

export function llmsTxt(origin: string): string {
  return `# Redline

> Private vulnerability reports with escrowed bounties on NEAR testnet. Reports are sealed (AES-256-GCM); only an OutLayer TEE enclave can open a report key. Bounties are held by redline-escrow.testnet and paid when the fix pull request is merged.

Agents get a read-only, unauthenticated JSON API. It never returns report plaintext, keys, chat or invitee emails for a private report.

## API
- [Index](${origin}/api/v1): endpoint list
- [Disclosures](${origin}/api/v1/disclosures): published and paid reports (bounty, PR URL, fund and payout tx hashes)
- [One disclosure](${origin}/api/v1/disclosures/{id}): full public detail, proof fields, enclave info
- [Leaderboard](${origin}/api/v1/leaderboard): researchers ranked by NEAR earned from paid reports
- [One researcher](${origin}/api/v1/researchers/{handle}): public profile, totals and all their public disclosures
- [Report metadata](${origin}/api/v1/reports/{id}): no auth, private reports return hashes only; 401 or 403 on a wrong token
- [Verify](${origin}/api/v1/verify/{id}): checks the escrow contract, the GitHub merge and the transactions live
- [Manifest](${origin}/.well-known/redline.json)

## Optional
- [Source and docs](https://github.com/p2pmerc/redline#for-ai-agents)
- [Public disclosures page](${origin}/disclosures)
- [Researcher leaderboard page](${origin}/leaderboard)
`;
}
