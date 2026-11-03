//! The private channel between researcher and team.
//!
//! Each report has its own symmetric chat key derived inside the enclave. Only the two accounts named in
//! the escrow contract can get it, re-sealed to a one-time browser key. Messages are encrypted and
//! decrypted in the browsers, and their SHA-256 hashes can be logged on chain as a tamper-evident record.

use crate::enclave_key::derive_chat_key;
use crate::enclave_report_sealing::seal_to_recipient;
use crate::near_chain_reader::ReportView;
use crate::report_access_control::{authorize, has_active_member, ProvenCaller};

/// Returns the chat key for the caller, sealed to `recipient_pub_hex`. Only the researcher and invited,
/// verified, non-revoked members get it, and only once someone has been invited.
pub fn chat_key_for_party(
    master: &[u8],
    report_id: &str,
    report: &ReportView,
    caller: &ProvenCaller,
    recipient_pub_hex: &str,
) -> Result<String, String> {
    authorize(report, caller)?;
    if !has_active_member(&report.members) {
        return Err("the conversation opens once the researcher has invited someone".into());
    }
    let key = derive_chat_key(master, report_id)?;
    seal_to_recipient(recipient_pub_hex, &key)
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::near_chain_reader::MemberInvite;
    use crate::privy_identity_check::LinkedIdentity;
    use crate::report_access_control::invite_hash;

    fn report(revoked: Option<bool>) -> ReportView {
        ReportView {
            researcher: "bob.testnet".into(),
            content_hash: "aa".into(),
            disclosure_deadline_ns: 1,
            members: revoked.map(|r| vec![MemberInvite { id_hash: invite_hash("email", "ada@acme.com"), revoked: r }]).unwrap_or_default(),
            published_at_ns: None,
        }
    }

    fn who(kind: &str, handle: &str) -> ProvenCaller {
        ProvenCaller { identities: vec![LinkedIdentity { kind: kind.into(), handle: handle.into() }] }
    }

    fn browser() -> ([u8; 32], String) {
        let secret = crate::enclave_key::derive_ecies_secret(&[4u8; 32]).unwrap();
        let public = crate::enclave_key::public_key_hex(&secret).unwrap();
        (secret, public)
    }

    #[test]
    fn the_researcher_and_the_invited_member_get_the_same_key() {
        let (secret, public) = browser();
        let r = report(Some(false));
        let a = chat_key_for_party(&[1u8; 32], "rl-1", &r, &who("near", "bob.testnet"), &public).unwrap();
        let b = chat_key_for_party(&[1u8; 32], "rl-1", &r, &who("email", "ada@acme.com"), &public).unwrap();
        let open = |s: &str| ecies::decrypt(&secret, &hex::decode(s).unwrap()).unwrap();
        assert_eq!(open(&a), open(&b));
        assert_eq!(open(&a), derive_chat_key(&[1u8; 32], "rl-1").unwrap());
    }

    #[test]
    fn uninvited_revoked_and_early_requests_are_refused() {
        let (_, public) = browser();
        let r = report(Some(false));
        assert!(chat_key_for_party(&[1u8; 32], "rl-1", &r, &who("email", "eve@evil.com"), &public).is_err());
        assert!(chat_key_for_party(&[1u8; 32], "rl-1", &report(Some(true)), &who("email", "ada@acme.com"), &public).is_err());
        // The researcher alone has nobody to talk to yet, and the key stays sealed.
        assert!(chat_key_for_party(&[1u8; 32], "rl-1", &report(None), &who("near", "bob.testnet"), &public).is_err());
        // A revoked-only list leaves the researcher without a counterpart too.
        assert!(chat_key_for_party(&[1u8; 32], "rl-1", &report(Some(true)), &who("near", "bob.testnet"), &public).is_err());
    }
}
