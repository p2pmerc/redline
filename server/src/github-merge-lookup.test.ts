import { describe, expect, it } from "vitest";
import { createMergeLookup, type Fetcher } from "./github-merge-lookup.js";

const sha = "c".repeat(40);
const repoInfo = { full_name: "acme/widgets", default_branch: "main" };
const pr = (over: Record<string, unknown> = {}) => ({ number: 5, state: "closed", merged: true, merged_at: "2026-01-01T00:00:00Z", merge_commit_sha: sha, base: { ref: "main", repo: { full_name: "acme/widgets" } }, ...over });

function fake(routes: Record<string, [number, unknown]>): Fetcher {
  return async (url) => {
    const hit = routes[url.replace("https://api.github.com/repos/", "")];
    if (!hit) throw new Error("offline");
    return { status: hit[0], json: async () => hit[1] };
  };
}
const ok = (prBody: unknown, mergeStatus: number) => fake({ "acme/widgets": [200, repoInfo], "acme/widgets/pulls/5": [200, prBody], "acme/widgets/pulls/5/merge": [mergeStatus, {}] });

describe("merge lookup", () => {
  it("says merged only when all sources agree", async () => {
    expect(await createMergeLookup(ok(pr(), 204))("acme/widgets", 5)).toMatchObject({ status: "merged", mergeCommit: sha });
  });
  it("says not_merged for an open pull request", async () => {
    expect((await createMergeLookup(ok(pr({ state: "open", merged: false, merge_commit_sha: null, merged_at: null }), 404))("acme/widgets", 5)).status).toBe("not_merged");
  });
  it("fails closed when sources disagree, the branch is wrong, or GitHub is down", async () => {
    expect((await createMergeLookup(ok(pr(), 404))("acme/widgets", 5)).status).toBe("unknown");
    expect((await createMergeLookup(ok(pr({ base: { ref: "dev", repo: { full_name: "acme/widgets" } } }), 204))("acme/widgets", 5)).status).toBe("unknown");
    expect((await createMergeLookup(ok(pr({ merge_commit_sha: "abc" }), 204))("acme/widgets", 5)).status).toBe("unknown");
    expect((await createMergeLookup(fake({}))("acme/widgets", 5)).status).toBe("unknown");
    expect((await createMergeLookup(fake({ "acme/widgets": [404, {}] }))("acme/widgets", 5)).status).toBe("unknown");
  });
  it("rejects malformed repositories", async () => {
    expect((await createMergeLookup(fake({}))("../etc", 5)).status).toBe("unknown");
    expect((await createMergeLookup(fake({}))("acme/widgets", 0)).status).toBe("unknown");
  });
});
