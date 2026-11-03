/**
 * Fail-closed pull-request merge check (same rules as the enclave's github_merge_checker).
 * "merged" needs three agreeing GitHub answers; anything unclear is "unknown" and moves no money.
 */
import type { MergeAnswer } from "./escrow-ledger.js";
import { REPO_PATTERN } from "./escrow-ledger.js";

export type Fetcher = (url: string, init: { headers: Record<string, string> }) => Promise<{ status: number; json: () => Promise<unknown> }>;
export type MergeLookup = (repo: string, pullRequest: number) => Promise<MergeAnswer & { reason?: string }>;

const isSha = (v: unknown): v is string => typeof v === "string" && /^[0-9a-fA-F]{40}$/.test(v);
const sameRepo = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

type Obj = Record<string, any>;

export function createMergeLookup(fetcher: Fetcher = fetch as unknown as Fetcher, token?: string): MergeLookup {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "redline-merge-check" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const get = async (url: string): Promise<{ status: number; body: Obj }> => {
    const res = await fetcher(url, { headers });
    let body: Obj = {};
    if (res.status !== 204) body = ((await res.json().catch(() => ({}))) ?? {}) as Obj;
    return { status: res.status, body };
  };

  return async (repo, pullRequest) => {
    const unknown = (reason: string) => ({ status: "unknown" as const, repo, pullRequest, reason });
    if (!REPO_PATTERN.test(repo) || !Number.isInteger(pullRequest) || pullRequest <= 0) return unknown("invalid repository or pull request number");
    const base = `https://api.github.com/repos/${repo}`;
    try {
      const info = await get(base);
      if (info.status === 404) return unknown("repository not visible to the checker");
      if (info.status !== 200) return unknown("could not read the repository");
      const defaultBranch = info.body.default_branch;
      if (typeof defaultBranch !== "string") return unknown("repository has no default branch");
      if (!sameRepo(info.body.full_name, repo)) return unknown("repository name does not match");

      const pr = await get(`${base}/pulls/${pullRequest}`);
      if (pr.status === 404) return unknown("pull request not found");
      if (pr.status !== 200) return unknown("could not read the pull request");
      if (pr.body.number !== pullRequest) return unknown("pull request number does not match");
      if (!sameRepo(pr.body.base?.repo?.full_name, repo)) return unknown("pull request targets another repository");

      const endpoint = await get(`${base}/pulls/${pullRequest}/merge`);
      const viaEndpoint = endpoint.status === 204 ? true : endpoint.status === 404 ? false : undefined;
      const flag: unknown = pr.body.merged;
      const state: unknown = pr.body.state;

      if (flag === true && viaEndpoint === true) {
        if (!isSha(pr.body.merge_commit_sha) || !pr.body.merged_at) return unknown("merged but the merge commit is missing");
        if (pr.body.base?.ref !== defaultBranch) return unknown("merged into a branch that is not the default branch");
        return { status: "merged", repo, pullRequest, mergeCommit: String(pr.body.merge_commit_sha).toLowerCase() };
      }
      if (flag === false && viaEndpoint === false && (state === "open" || state === "closed")) {
        return { status: "not_merged", repo, pullRequest, reason: state === "open" ? "still open" : "closed without merging" };
      }
      if (typeof flag === "boolean" && viaEndpoint !== undefined) return unknown("GitHub answers disagree");
      return unknown("incomplete answer from GitHub");
    } catch {
      return unknown("GitHub did not answer");
    }
  };
}
