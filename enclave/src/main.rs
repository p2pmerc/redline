//! Redline enclave (OutLayer WASI worker, Intel TDX). JSON in on stdin, JSON out on stdout.

mod action_router;
mod enclave_key;
mod enclave_report_sealing;
mod github_merge_checker;
mod http_client;
mod near_chain_reader;
mod nep413_wallet_login;
mod privy_identity_check;
mod report_access_control;
mod sealed_negotiation;

use action_router::{CallerAuth, CallerIdentity, Services};
use http_client::{HostHttp, HttpFetcher};
use near_chain_reader::RpcChain;
use privy_identity_check::{LinkedIdentity, SignedInUser};
use report_access_control::ProvenCaller;
use std::io::{Read, Write};

/// Identity checks backed by Privy and NEAR, running from inside the worker.
struct LiveIdentity<'a> {
    http: &'a dyn HttpFetcher,
    chain: &'a RpcChain<'a>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl CallerIdentity for LiveIdentity<'_> {
    fn prove(&self, auth: &CallerAuth) -> Result<ProvenCaller, String> {
        if let Some(proof) = &auth.wallet {
            let account = nep413_wallet_login::wallet_login(proof, self.chain, now_ms())?;
            return match auth.account.as_deref() {
                Some(claimed) if claimed.to_lowercase() != account => Err("the wallet belongs to another account".into()),
                _ => Ok(ProvenCaller { identities: vec![LinkedIdentity { kind: "near".into(), handle: account }] }),
            };
        }
        // Everything the caller is allowed to be comes from Privy's own record of their sign-in.
        let token = auth.id_token.as_deref().ok_or("sign in first")?;
        Ok(ProvenCaller { identities: privy_identity_check::sign_in(self.http, token)?.identities })
    }

    fn signed_in_user(&self, id_token: &str) -> Result<SignedInUser, String> {
        privy_identity_check::sign_in(self.http, id_token)
    }
}

fn main() {
    let mut input = String::new();
    let output = match std::io::stdin().read_to_string(&mut input) {
        Err(_) => serde_json::json!({ "success": false, "result": null, "error": "could not read the request" }),
        Ok(_) => {
            let http = HostHttp;
            let chain = RpcChain::from_env(&http);
            let identity = LiveIdentity { http: &http, chain: &chain };
            let services = Services {
                http: &http,
                chain: &chain,
                identity: &identity,
                master: std::env::var("PROTECTED_REDLINE_MASTER")
                    .map_err(|_| "enclave master secret is missing".to_string())
                    .and_then(|m| hex::decode(m.trim()).map_err(|_| "enclave master secret is not hex".to_string())),
                github_token: std::env::var("REDLINE_GITHUB_TOKEN").ok().filter(|t| !t.is_empty()),
            };
            action_router::route(&input, &services)
        }
    };
    let _ = std::io::stdout().write_all(output.to_string().as_bytes());
    let _ = std::io::stdout().flush();
}
