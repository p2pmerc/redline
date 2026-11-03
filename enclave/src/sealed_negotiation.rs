//! The private channel between researcher and team.
//!
//! Each report has its own symmetric chat key derived inside the enclave. Only the two accounts named in
//! the escrow contract can get it, re-sealed to a one-time browser key. Messages are encrypted and
//! decrypted in the browsers, and their SHA-256 hashes can be logged on chain as a tamper-evident record.

use crate::enclave_key::derive_chat_key;
use crate::enclave_report_sealing::seal_to_recipient;
use crate::near_chain_reader::ReportView;

/// Returns the chat key for `account`, sealed to `recipient_pub_hex`, or an error if `account` is not
/// one of the two parties.
pub fn chat_key_for_party(
    master: &[u8],
    report_id: &str,
    report: &ReportView,
    account: &str,
    recipient_pub_hex: &str,
) -> Result<String, String> {
    if !report.is_party(account) {
        return Err("only the researcher and the team can open this conversation".into());
    }
    if report.team.is_none() {
        return Err("the conversation opens once the team account is set".into());
    }
    let key = derive_chat_key(master, report_id)?;
    seal_to_recipient(recipient_pub_hex, &key)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report(team: Option<&str>) -> ReportView {
        ReportView {
            researcher: "bob.testnet".into(),
            content_hash: "aa".into(),
            disclosure_deadline_ns: 1,
            team: team.map(String::from),
            published_at_ns: None,
        }
    }

    fn browser() -> ([u8; 32], String) {
        let secret = crate::enclave_key::derive_ecies_secret(&[4u8; 32]).unwrap();
        let public = crate::enclave_key::public_key_hex(&secret).unwrap();
        (secret, public)
    }

    #[test]
    fn both_parties_get_the_same_key() {
        let (secret, public) = browser();
        let r = report(Some("acme.testnet"));
        let a = chat_key_for_party(&[1u8; 32], "rl-1", &r, "bob.testnet", &public).unwrap();
        let b = chat_key_for_party(&[1u8; 32], "rl-1", &r, "acme.testnet", &public).unwrap();
        let open = |s: &str| ecies::decrypt(&secret, &hex::decode(s).unwrap()).unwrap();
        assert_eq!(open(&a), open(&b));
        assert_eq!(open(&a), derive_chat_key(&[1u8; 32], "rl-1").unwrap());
    }

    #[test]
    fn outsiders_and_early_requests_are_refused() {
        let (_, public) = browser();
        assert!(chat_key_for_party(&[1u8; 32], "rl-1", &report(Some("acme.testnet")), "eve.testnet", &public).is_err());
        assert!(chat_key_for_party(&[1u8; 32], "rl-1", &report(None), "bob.testnet", &public).is_err());
    }
}
