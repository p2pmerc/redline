//! Maps one JSON request (stdin) to one JSON answer (stdout).
//!
//! Actions:
//!   pubkey          the enclave's ECIES public key
//!   merge_check     fail-closed PR merge status, answers in the exact shape the escrow contract reads
//!   reveal_report   the researcher or an invited, verified, non-revoked member gets the AES key,
//!                   re-sealed to their one-time browser key (see report_access_control)
//!   chat_key        the same people get the report's negotiation key, re-sealed the same way
//!   publish_key     after the researcher published on chain, anyone gets the key in the clear
//!   verify_identity prove the caller holds an email, X, Telegram, GitHub or NEAR identity

use crate::enclave_report_sealing::{envelope_matches_hash, open_envelope, seal_to_recipient};
use crate::github_merge_checker::check_pull_request;
use crate::http_client::HttpFetcher;
use crate::near_chain_reader::{ChainView, ReportView};
use crate::nep413_wallet_login::WalletProof;
use crate::privy_identity_check::SignedInUser;
use crate::report_access_control::{authorize, ProvenCaller};
use crate::sealed_negotiation::chat_key_for_party;
use serde::Deserialize;
use serde_json::{json, Value};

/// Who is calling: a Privy token or a NEP-413 wallet proof.
#[derive(Deserialize, Default, Debug)]
pub struct CallerAuth {
    #[serde(default)]
    pub id_token: Option<String>,
    #[serde(default)]
    pub wallet: Option<WalletProof>,
    /// NEAR account the caller says they act as. Must be proven by the token or wallet.
    #[serde(default)]
    pub account: Option<String>,
}

pub trait CallerIdentity {
    /// Everything the caller has proven: their Privy-linked identities, or a wallet proof.
    fn prove(&self, auth: &CallerAuth) -> Result<ProvenCaller, String>;
    fn signed_in_user(&self, id_token: &str) -> Result<SignedInUser, String>;
}

pub struct Services<'a> {
    pub http: &'a dyn HttpFetcher,
    pub chain: &'a dyn ChainView,
    pub identity: &'a dyn CallerIdentity,
    /// Master secret, or the reason it is missing.
    pub master: Result<Vec<u8>, String>,
    pub github_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
enum Request {
    Pubkey,
    MergeCheck { repo: String, pull_request: u64, #[serde(default)] expected_author: Option<String> },
    RevealReport { report_id: String, sealed_key: String, eph_pub: String, #[serde(flatten)] auth: CallerAuth },
    ChatKey { report_id: String, eph_pub: String, #[serde(flatten)] auth: CallerAuth },
    PublishKey { report_id: String, sealed_key: String },
    VerifyIdentity { id_token: String, kind: String, handle: String },
}

fn ok(result: Value) -> Value {
    json!({ "success": true, "result": result })
}

fn fail(message: &str) -> Value {
    json!({ "success": false, "result": null, "error": message })
}

/// Entry point. Never panics on bad input: every failure becomes `{"success":false,...}`.
pub fn route(raw_input: &str, services: &Services) -> Value {
    let request: Request = match serde_json::from_str(raw_input) {
        Ok(r) => r,
        Err(_) => return fail("the request is not understood"),
    };
    match handle(request, services) {
        Ok(value) => value,
        Err(message) => fail(&message),
    }
}

fn load_report(services: &Services, report_id: &str) -> Result<ReportView, String> {
    services.chain.get_report(report_id)?.ok_or_else(|| "report is not registered on chain".to_string())
}

fn master<'s>(services: &'s Services) -> Result<&'s Vec<u8>, String> {
    services.master.as_ref().map_err(|e| e.clone())
}

fn handle(request: Request, services: &Services) -> Result<Value, String> {
    match request {
        Request::Pubkey => {
            let secret = crate::enclave_key::derive_ecies_secret(master(services)?)?;
            Ok(ok(json!({ "public_key": crate::enclave_key::public_key_hex(&secret)?, "enclave_version": env!("CARGO_PKG_VERSION") })))
        }
        // The contract reads this answer, so it is returned bare, not wrapped.
        Request::MergeCheck { repo, pull_request, expected_author } => {
            let answer = check_pull_request(services.http, &repo, pull_request, services.github_token.as_deref(), expected_author.as_deref());
            Ok(serde_json::to_value(answer).map_err(|_| "could not encode the answer".to_string())?)
        }
        Request::RevealReport { report_id, sealed_key, eph_pub, auth } => {
            let caller = services.identity.prove(&auth)?;
            let report = load_report(services, &report_id)?;
            authorize(&report, &caller)?;
            let secret = crate::enclave_key::derive_ecies_secret(master(services)?)?;
            let envelope = open_envelope(&secret, &sealed_key)?;
            if !envelope_matches_hash(&envelope, &report.content_hash) {
                return Err("this key does not belong to the report registered on chain".into());
            }
            let sealed = seal_to_recipient(&eph_pub, envelope.key.as_bytes())?;
            Ok(ok(json!({ "sealed_key": sealed, "content_hash": report.content_hash })))
        }
        Request::ChatKey { report_id, eph_pub, auth } => {
            let caller = services.identity.prove(&auth)?;
            let report = load_report(services, &report_id)?;
            let sealed = chat_key_for_party(master(services)?, &report_id, &report, &caller, &eph_pub)?;
            Ok(ok(json!({ "sealed_chat_key": sealed })))
        }
        Request::PublishKey { report_id, sealed_key } => {
            let report = load_report(services, &report_id)?;
            if report.published_at_ns.is_none() {
                return Err("the researcher has not published this report".into());
            }
            let secret = crate::enclave_key::derive_ecies_secret(master(services)?)?;
            let envelope = open_envelope(&secret, &sealed_key)?;
            if !envelope_matches_hash(&envelope, &report.content_hash) {
                return Err("this key does not belong to the report registered on chain".into());
            }
            Ok(ok(json!({ "key": envelope.key, "content_hash": report.content_hash })))
        }
        Request::VerifyIdentity { id_token, kind, handle } => {
            let user = services.identity.signed_in_user(&id_token)?;
            if !user.holds(&kind, &handle) {
                return Err("this sign-in does not hold that identity".into());
            }
            let near_accounts: Vec<&str> =
                user.identities.iter().filter(|i| i.kind == "near").map(|i| i.handle.as_str()).collect();
            Ok(ok(json!({ "verified": true, "kind": kind, "near_accounts": near_accounts })))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::enclave_report_sealing::KeyEnvelope;
    use crate::http_client::Header;
    use crate::near_chain_reader::MemberInvite;
    use crate::privy_identity_check::LinkedIdentity;
    use crate::report_access_control::invite_hash;

    struct NoNet;
    impl HttpFetcher for NoNet {
        fn get(&self, _: &str, _: &[Header]) -> Result<(u16, Vec<u8>), String> {
            Err("offline".into())
        }
        fn post_json(&self, _: &str, _: &str) -> Result<(u16, Vec<u8>), String> {
            Err("offline".into())
        }
    }

    struct FixedChain(Option<ReportView>);
    impl ChainView for FixedChain {
        fn get_report(&self, _: &str) -> Result<Option<ReportView>, String> {
            Ok(self.0.clone())
        }
        fn has_full_access_key(&self, _: &str, _: &str) -> Result<bool, String> {
            Ok(false)
        }
    }

    /// Stand-in for Privy: the token text says who signed in. "forged" fails like a bad signature.
    struct FakePrivy;
    fn user_for(token: &str) -> Result<SignedInUser, String> {
        let identities = match token {
            "bob" | "t" => vec![("near", "bob.testnet"), ("email", "bob@example.com")],
            "ada" => vec![("email", "ada@acme.com"), ("github", "ada")],
            "eve" => vec![("email", "eve@evil.com"), ("near", "eve.testnet")],
            _ => return Err("sign-in token has the wrong shape".into()),
        };
        Ok(SignedInUser {
            user_id: token.into(),
            identities: identities.into_iter().map(|(k, h)| LinkedIdentity { kind: k.into(), handle: h.into() }).collect(),
        })
    }
    impl CallerIdentity for FakePrivy {
        fn prove(&self, auth: &CallerAuth) -> Result<ProvenCaller, String> {
            let token = auth.id_token.as_deref().ok_or("sign in first")?;
            Ok(ProvenCaller { identities: user_for(token)?.identities })
        }
        fn signed_in_user(&self, token: &str) -> Result<SignedInUser, String> {
            user_for(token)
        }
    }

    const MASTER: [u8; 32] = [8u8; 32];
    const HASH: &str = "abababababababababababababababababababababababababababababababab";

    fn view(published: Option<u64>) -> ReportView {
        view_with(published, Some(false))
    }

    /// `ada@acme.com` is invited unless `revoked` is None; `Some(true)` means the invite was withdrawn.
    fn view_with(published: Option<u64>, revoked: Option<bool>) -> ReportView {
        ReportView {
            researcher: "bob.testnet".into(),
            content_hash: HASH.into(),
            disclosure_deadline_ns: 1,
            members: revoked
                .map(|r| vec![MemberInvite { id_hash: invite_hash("email", "ada@acme.com"), revoked: r }])
                .unwrap_or_default(),
            published_at_ns: published,
        }
    }

    fn run(chain: &FixedChain, input: Value) -> Value {
        let services = Services {
            http: &NoNet,
            chain,
            identity: &FakePrivy,
            master: Ok(MASTER.to_vec()),
            github_token: None,
        };
        route(&input.to_string(), &services)
    }

    fn enclave_public() -> String {
        crate::enclave_key::public_key_hex(&crate::enclave_key::derive_ecies_secret(&MASTER).unwrap()).unwrap()
    }

    fn sealed_key(hash: &str) -> String {
        let envelope = KeyEnvelope { v: 1, key: "22".repeat(32), content_hash: hash.into() };
        seal_to_recipient(&enclave_public(), serde_json::to_string(&envelope).unwrap().as_bytes()).unwrap()
    }

    fn browser() -> ([u8; 32], String) {
        let secret = crate::enclave_key::derive_ecies_secret(&[6u8; 32]).unwrap();
        (secret, crate::enclave_key::public_key_hex(&secret).unwrap())
    }

    #[test]
    fn unknown_and_malformed_requests_fail_cleanly() {
        let chain = FixedChain(None);
        assert_eq!(run(&chain, json!({"action": "nope"}))["success"], false);
        assert_eq!(run(&chain, json!({"hello": 1}))["success"], false);
    }

    #[test]
    fn pubkey_matches_the_derived_key() {
        let out = run(&FixedChain(None), json!({"action": "pubkey"}));
        assert_eq!(out["result"]["public_key"], enclave_public());
    }

    #[test]
    fn merge_check_without_network_is_a_bare_unknown() {
        let out = run(&FixedChain(None), json!({"action": "merge_check", "repo": "acme/widgets", "pull_request": 3}));
        assert_eq!(out["status"], "unknown");
        assert_eq!(out["pull_request"], 3);
    }

    fn reveal(chain: &FixedChain, token: &str) -> Value {
        let (_, browser_public) = browser();
        run(chain, json!({
            "action": "reveal_report", "report_id": "rl-1", "sealed_key": sealed_key(HASH),
            "eph_pub": browser_public, "id_token": token
        }))
    }

    #[test]
    fn the_researcher_and_an_invited_member_can_reveal_the_report_key() {
        for token in ["bob", "ada"] {
            let (browser_secret, browser_public) = browser();
            let out = run(&FixedChain(Some(view(None))), json!({
                "action": "reveal_report", "report_id": "rl-1", "sealed_key": sealed_key(HASH),
                "eph_pub": browser_public, "id_token": token
            }));
            assert_eq!(out["success"], true, "{token}: {out}");
            let sealed = out["result"]["sealed_key"].as_str().unwrap();
            let plain = ecies::decrypt(&browser_secret, &hex::decode(sealed).unwrap()).unwrap();
            assert_eq!(String::from_utf8(plain).unwrap(), "22".repeat(32));
        }
    }

    #[test]
    fn an_uninvited_user_is_denied_the_report_key() {
        let out = reveal(&FixedChain(Some(view(None))), "eve");
        assert_eq!(out["success"], false);
        assert!(out["result"].is_null(), "no key material in a denial: {out}");
    }

    #[test]
    fn a_revoked_invite_is_denied_the_report_key() {
        let chain = FixedChain(Some(view_with(None, Some(true))));
        assert_eq!(reveal(&chain, "ada")["success"], false);
        assert_eq!(reveal(&chain, "bob")["success"], true, "the researcher keeps access");
    }

    #[test]
    fn claiming_an_account_without_a_valid_sign_in_gets_nothing() {
        let (_, browser_public) = browser();
        let chain = FixedChain(Some(view(None)));
        // Naming bob's account is not proof. The caller needs a sign-in that holds it.
        let named = run(&chain, json!({
            "action": "reveal_report", "report_id": "rl-1", "sealed_key": sealed_key(HASH),
            "eph_pub": browser_public, "account": "bob.testnet"
        }));
        assert_eq!(named["success"], false);
        assert_eq!(reveal(&chain, "forged")["success"], false);
    }

    #[test]
    fn an_unregistered_report_gives_nothing() {
        assert_eq!(reveal(&FixedChain(None), "bob")["success"], false);
    }

    #[test]
    fn a_key_for_a_different_ciphertext_is_refused() {
        let (_, browser_public) = browser();
        let out = run(&FixedChain(Some(view(None))), json!({
            "action": "reveal_report", "report_id": "rl-1", "sealed_key": sealed_key(&"cd".repeat(32)),
            "eph_pub": browser_public, "id_token": "bob"
        }));
        assert_eq!(out["success"], false);
    }

    #[test]
    fn the_key_is_only_public_after_publication_on_chain() {
        let input = json!({"action": "publish_key", "report_id": "rl-1", "sealed_key": sealed_key(HASH)});
        assert_eq!(run(&FixedChain(Some(view(None))), input.clone())["success"], false);
        let out = run(&FixedChain(Some(view(Some(99)))), input);
        assert_eq!(out["result"]["key"], "22".repeat(32));
    }

    #[test]
    fn chat_key_is_for_the_researcher_and_invited_members_only() {
        let (_, browser_public) = browser();
        let ask = |chain: &FixedChain, token: &str| {
            run(chain, json!({"action": "chat_key", "report_id": "rl-1", "eph_pub": browser_public, "id_token": token}))
        };
        let open = FixedChain(Some(view(None)));
        assert_eq!(ask(&open, "bob")["success"], true);
        assert_eq!(ask(&open, "ada")["success"], true);
        assert_eq!(ask(&open, "eve")["success"], false);
        let revoked = FixedChain(Some(view_with(None, Some(true))));
        assert_eq!(ask(&revoked, "ada")["success"], false);
        assert_eq!(ask(&revoked, "bob")["success"], false, "nobody left to talk to");
        let nobody_invited = FixedChain(Some(view_with(None, None)));
        assert_eq!(ask(&nobody_invited, "ada")["success"], false);
    }

    #[test]
    fn after_publication_the_public_key_endpoint_needs_no_sign_in_but_reveal_still_does() {
        let chain = FixedChain(Some(view(Some(99))));
        assert_eq!(reveal(&chain, "eve")["success"], false);
        let public = run(&chain, json!({"action": "publish_key", "report_id": "rl-1", "sealed_key": sealed_key(HASH)}));
        assert_eq!(public["success"], true);
    }

    #[test]
    fn verify_identity_checks_the_linked_account() {
        let chain = FixedChain(None);
        let ok = run(&chain, json!({"action": "verify_identity", "id_token": "t", "kind": "email", "handle": "Bob@Example.com"}));
        assert_eq!(ok["result"]["verified"], true);
        assert_eq!(ok["result"]["near_accounts"][0], "bob.testnet");
        let bad = run(&chain, json!({"action": "verify_identity", "id_token": "t", "kind": "twitter", "handle": "bob"}));
        assert_eq!(bad["success"], false);
    }

    #[test]
    fn a_missing_master_secret_is_an_error_not_a_panic() {
        let chain = FixedChain(None);
        let services = Services { http: &NoNet, chain: &chain, identity: &FakePrivy, master: Err("missing".into()), github_token: None };
        assert_eq!(route(r#"{"action":"pubkey"}"#, &services)["success"], false);
    }
}
