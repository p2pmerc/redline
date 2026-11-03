//! Fail-closed pull-request merge check.
//!
//! `merged` is only ever returned when three GitHub answers agree: the pull request says it merged into
//! the repository's default branch, a merge commit exists, and the `/merge` endpoint confirms it.
//! Anything else that is not a clear "not merged" is `unknown`, which the escrow contract treats as
//! "do not move money".

use crate::http_client::{Header, HttpFetcher};
use serde::Serialize;
use serde_json::Value;

#[derive(Serialize, Debug, PartialEq, Clone)]
pub struct MergeAnswer {
    /// "merged", "not_merged" or "unknown".
    pub status: &'static str,
    pub repo: String,
    pub pull_request: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_commit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

impl MergeAnswer {
    fn unknown(repo: &str, pull_request: u64, reason: &str) -> Self {
        Self { status: "unknown", repo: repo.into(), pull_request, merge_commit: None, reason: Some(reason.into()) }
    }
}

pub fn valid_repo(repo: &str) -> bool {
    let mut parts = repo.split('/');
    let (Some(owner), Some(name), None) = (parts.next(), parts.next(), parts.next()) else { return false };
    let ok = |s: &str| {
        !s.is_empty() && s.len() <= 100 && s != "." && s != ".."
            && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
    };
    ok(owner) && ok(name)
}

fn is_commit_sha(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

fn json_get(fetcher: &dyn HttpFetcher, url: &str, bearer: Option<&str>) -> Result<(u16, Value), String> {
    let (status, body) = fetcher.get(url, &auth_headers(bearer))?;
    let value = if body.is_empty() { Value::Null } else { serde_json::from_slice(&body).unwrap_or(Value::Null) };
    Ok((status, value))
}

pub fn check_pull_request(fetcher: &dyn HttpFetcher, repo: &str, pull_request: u64, token: Option<&str>, expected_author: Option<&str>) -> MergeAnswer {
    if !valid_repo(repo) || pull_request == 0 {
        return MergeAnswer::unknown(repo, pull_request, "invalid repository or pull request number");
    }
    let base = format!("https://api.github.com/repos/{repo}");
    let bearer = token.map(|t| format!("Bearer {t}"));
    let token = bearer.as_deref();

    let repo_info = match json_get(fetcher, &base, token) {
        Ok((200, v)) => v,
        Ok((404, _)) => return MergeAnswer::unknown(repo, pull_request, "repository not visible to the checker"),
        _ => return MergeAnswer::unknown(repo, pull_request, "could not read the repository"),
    };
    let Some(default_branch) = repo_info["default_branch"].as_str() else {
        return MergeAnswer::unknown(repo, pull_request, "repository has no default branch");
    };
    if !repo_info["full_name"].as_str().map_or(false, |n| n.eq_ignore_ascii_case(repo)) {
        return MergeAnswer::unknown(repo, pull_request, "repository name does not match");
    }

    let pr = match json_get(fetcher, &format!("{base}/pulls/{pull_request}"), token) {
        Ok((200, v)) => v,
        Ok((404, _)) => return MergeAnswer::unknown(repo, pull_request, "pull request not found"),
        _ => return MergeAnswer::unknown(repo, pull_request, "could not read the pull request"),
    };
    if pr["number"].as_u64() != Some(pull_request) {
        return MergeAnswer::unknown(repo, pull_request, "pull request number does not match");
    }
    if !pr["base"]["repo"]["full_name"].as_str().map_or(false, |n| n.eq_ignore_ascii_case(repo)) {
        return MergeAnswer::unknown(repo, pull_request, "pull request targets another repository");
    }

    if let Some(wanted) = expected_author.map(|s| s.trim().trim_start_matches('@').to_ascii_lowercase()).filter(|s| !s.is_empty()) {
        let login = pr["user"]["login"].as_str().unwrap_or("").trim().trim_start_matches('@').to_ascii_lowercase();
        if login.is_empty() {
            return MergeAnswer::unknown(repo, pull_request, "pull request has no author login");
        }
        if login != wanted {
            return MergeAnswer::unknown(repo, pull_request, "pull request author does not match the researcher's linked GitHub");
        }
    }

    let merged_flag = pr["merged"].as_bool();
    let state = pr["state"].as_str().unwrap_or("");

    // Second source: the dedicated merge endpoint. 204 means merged, 404 means not merged.
    let merge_endpoint = match fetcher.get(
        &format!("{base}/pulls/{pull_request}/merge"),
        &auth_headers(token),
    ) {
        Ok((204, _)) => Some(true),
        Ok((404, _)) => Some(false),
        _ => None,
    };

    match (merged_flag, merge_endpoint) {
        (Some(true), Some(true)) => {
            let commit = pr["merge_commit_sha"].as_str().unwrap_or("");
            let merged_at_present = pr["merged_at"].as_str().map_or(false, |s| !s.is_empty());
            let on_default_branch = pr["base"]["ref"].as_str() == Some(default_branch);
            if !is_commit_sha(commit) || !merged_at_present {
                return MergeAnswer::unknown(repo, pull_request, "merged but the merge commit is missing");
            }
            if !on_default_branch {
                return MergeAnswer::unknown(repo, pull_request, "merged into a branch that is not the default branch");
            }
            MergeAnswer {
                status: "merged",
                repo: repo.into(),
                pull_request,
                merge_commit: Some(commit.to_ascii_lowercase()),
                reason: None,
            }
        }
        (Some(false), Some(false)) if state == "open" || state == "closed" => MergeAnswer {
            status: "not_merged",
            repo: repo.into(),
            pull_request,
            merge_commit: None,
            reason: Some(if state == "open" { "still open".into() } else { "closed without merging".into() }),
        },
        (Some(_), Some(_)) => MergeAnswer::unknown(repo, pull_request, "GitHub answers disagree"),
        _ => MergeAnswer::unknown(repo, pull_request, "incomplete answer from GitHub"),
    }
}

fn auth_headers(bearer: Option<&str>) -> Vec<Header<'_>> {
    let mut headers = vec![Header("Accept", "application/vnd.github+json"), Header("X-GitHub-Api-Version", "2022-11-28")];
    if let Some(value) = bearer {
        headers.push(Header("Authorization", value));
    }
    headers
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    /// Canned GitHub: url suffix -> (status, body).
    struct FakeGithub(HashMap<String, (u16, String)>);

    impl HttpFetcher for FakeGithub {
        fn get(&self, url: &str, _: &[Header]) -> Result<(u16, Vec<u8>), String> {
            let key = url.trim_start_matches("https://api.github.com/repos/").to_string();
            self.0.get(&key).map(|(s, b)| (*s, b.clone().into_bytes())).ok_or_else(|| "offline".to_string())
        }
        fn post_json(&self, _: &str, _: &str) -> Result<(u16, Vec<u8>), String> {
            Err("unused".into())
        }
    }

    const SHA: &str = "0123456789abcdef0123456789abcdef01234567";

    fn pr_body(merged: bool, state: &str, base_ref: &str, commit: Option<&str>, repo: &str) -> String {
        serde_json::json!({
            "number": 42, "state": state, "merged": merged,
            "merged_at": if merged { Some("2026-11-01T10:00:00Z") } else { None },
            "merge_commit_sha": commit,
            "base": { "ref": base_ref, "repo": { "full_name": repo } }
        })
        .to_string()
    }

    fn world(pr: (u16, String), merge_status: Option<u16>) -> FakeGithub {
        let mut m = HashMap::new();
        m.insert("acme/widgets".into(), (200, r#"{"full_name":"acme/widgets","default_branch":"main"}"#.into()));
        m.insert("acme/widgets/pulls/42".into(), pr);
        if let Some(s) = merge_status {
            m.insert("acme/widgets/pulls/42/merge".into(), (s, String::new()));
        }
        FakeGithub(m)
    }

    fn run(world: &FakeGithub) -> MergeAnswer {
        check_pull_request(world, "acme/widgets", 42, None, None)
    }

    #[test]
    fn merged_when_every_source_agrees() {
        let w = world((200, pr_body(true, "closed", "main", Some(SHA), "acme/widgets")), Some(204));
        let a = run(&w);
        assert_eq!(a.status, "merged");
        assert_eq!(a.merge_commit.as_deref(), Some(SHA));
    }

    #[test]
    fn open_pull_request_is_not_merged() {
        let w = world((200, pr_body(false, "open", "main", None, "acme/widgets")), Some(404));
        assert_eq!(run(&w).status, "not_merged");
    }

    #[test]
    fn closed_without_merge_is_not_merged() {
        let w = world((200, pr_body(false, "closed", "main", None, "acme/widgets")), Some(404));
        assert_eq!(run(&w).status, "not_merged");
    }

    #[test]
    fn merged_into_another_branch_is_unknown() {
        let w = world((200, pr_body(true, "closed", "scratch", Some(SHA), "acme/widgets")), Some(204));
        assert_eq!(run(&w).status, "unknown");
    }

    #[test]
    fn disagreeing_sources_are_unknown() {
        let w = world((200, pr_body(true, "closed", "main", Some(SHA), "acme/widgets")), Some(404));
        assert_eq!(run(&w).status, "unknown");
        let w = world((200, pr_body(false, "open", "main", None, "acme/widgets")), Some(204));
        assert_eq!(run(&w).status, "unknown");
    }

    #[test]
    fn missing_merge_endpoint_answer_is_unknown() {
        let w = world((200, pr_body(true, "closed", "main", Some(SHA), "acme/widgets")), None);
        assert_eq!(run(&w).status, "unknown");
        let w = world((200, pr_body(true, "closed", "main", Some(SHA), "acme/widgets")), Some(500));
        assert_eq!(run(&w).status, "unknown");
    }

    #[test]
    fn missing_or_malformed_commit_is_unknown() {
        let w = world((200, pr_body(true, "closed", "main", None, "acme/widgets")), Some(204));
        assert_eq!(run(&w).status, "unknown");
        let w = world((200, pr_body(true, "closed", "main", Some("abc"), "acme/widgets")), Some(204));
        assert_eq!(run(&w).status, "unknown");
    }

    #[test]
    fn pull_request_in_another_repository_is_unknown() {
        let w = world((200, pr_body(true, "closed", "main", Some(SHA), "evil/widgets")), Some(204));
        assert_eq!(run(&w).status, "unknown");
    }

    #[test]
    fn network_failure_and_garbage_are_unknown() {
        assert_eq!(run(&FakeGithub(HashMap::new())).status, "unknown");
        let w = world((200, "<html>".into()), Some(204));
        assert_eq!(run(&w).status, "unknown");
        let w = world((502, String::new()), Some(204));
        assert_eq!(run(&w).status, "unknown");
    }

    #[test]
    fn rejects_hostile_repository_names() {
        for bad in ["", "acme", "acme/widgets/extra", "../etc/passwd", "acme/..", "a b/c", "acme/wid?gets"] {
            assert!(!valid_repo(bad), "{bad}");
        }
        assert!(valid_repo("acme/widgets.rs"));
        let w = world((200, String::new()), None);
        assert_eq!(check_pull_request(&w, "acme/../x", 1, None, None).status, "unknown");
        assert_eq!(check_pull_request(&w, "acme/widgets", 0, None, None).status, "unknown");
    }

    #[test]
    fn author_must_match_when_expected() {
        let mut body: serde_json::Value = serde_json::from_str(&pr_body(true, "closed", "main", Some(SHA), "acme/widgets")).unwrap();
        body["user"] = serde_json::json!({ "login": "alice" });
        let w = world((200, body.to_string()), Some(204));
        assert_eq!(check_pull_request(&w, "acme/widgets", 42, None, Some("alice")).status, "merged");
        assert_eq!(check_pull_request(&w, "acme/widgets", 42, None, Some("bob")).status, "unknown");
    }

    #[test]
    fn the_answer_serializes_to_what_the_contract_expects() {
        let w = world((200, pr_body(true, "closed", "main", Some(SHA), "acme/widgets")), Some(204));
        let value = serde_json::to_value(run(&w)).unwrap();
        assert_eq!(value["status"], "merged");
        assert_eq!(value["repo"], "acme/widgets");
        assert_eq!(value["pull_request"], 42);
        assert_eq!(value["merge_commit"], SHA);
    }
}
