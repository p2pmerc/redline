//! Who may read a sealed report and its chat. Decided here, inside the enclave, from two things the
//! enclave checks itself: the escrow contract's record, and the caller's Privy sign-in.
//!
//! A caller gets in only as
//!   * the researcher: one of the NEAR accounts linked to their verified sign-in (or a NEP-413 wallet
//!     proof) is the researcher recorded on chain, or
//!   * an invited member: the researcher invited an identity (email, X, Telegram, GitHub or NEAR) on
//!     chain, the invite is not revoked, and the caller's verified sign-in holds that identity.
//! Everyone else is refused: strangers, people who were never invited, people whose invite was revoked,
//! and anyone who only claims an identity without a valid sign-in. The server and the operator hold
//! no key that would let them in. Once the researcher publishes, the key is public by design and
//! `publish_key` serves it without this check.

use crate::near_chain_reader::{MemberInvite, ReportView};
use crate::privy_identity_check::LinkedIdentity;
use sha2::{Digest, Sha256};

/// What the enclave has verified about the caller. Built only from a checked Privy token or wallet proof.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ProvenCaller {
    pub identities: Vec<LinkedIdentity>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    Researcher,
    InvitedMember,
}

/// The value stored on chain for an invite. Handles are lowercased and lose a leading `@`, so the
/// researcher's browser and the enclave always produce the same hash. No raw handle goes on chain.
pub fn invite_hash(kind: &str, handle: &str) -> String {
    let handle = handle.trim().trim_start_matches('@').to_lowercase();
    let mut hasher = Sha256::new();
    hasher.update(format!("redline:invite:v1:{}:{}", kind.trim().to_lowercase(), handle).as_bytes());
    hex::encode(hasher.finalize())
}

pub fn authorize(report: &ReportView, caller: &ProvenCaller) -> Result<Access, String> {
    let is_researcher = caller.identities.iter().any(|i| i.kind == "near" && i.handle == report.researcher.to_lowercase());
    if is_researcher {
        return Ok(Access::Researcher);
    }
    let mut invited = false;
    for identity in &caller.identities {
        let hash = invite_hash(&identity.kind, &identity.handle);
        for entry in report.members.iter().filter(|m| m.id_hash.to_lowercase() == hash) {
            // A revoked entry for any identity the caller holds closes the door, even if another
            // identity of theirs is still listed. The researcher decides who is out.
            if entry.revoked {
                return Err("your invitation to this report was withdrawn".into());
            }
            invited = true;
        }
    }
    if invited {
        Ok(Access::InvitedMember)
    } else {
        Err("only the researcher and people they invited can read this report".into())
    }
}

/// True when at least one invite is still active, so a chat has someone on the other side.
pub fn has_active_member(members: &[MemberInvite]) -> bool {
    members.iter().any(|m| !m.revoked)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(kind: &str, handle: &str) -> LinkedIdentity {
        LinkedIdentity { kind: kind.into(), handle: handle.into() }
    }

    fn caller(items: &[(&str, &str)]) -> ProvenCaller {
        ProvenCaller { identities: items.iter().map(|(k, h)| id(k, h)).collect() }
    }

    fn report(members: Vec<MemberInvite>) -> ReportView {
        ReportView {
            researcher: "bob.testnet".into(),
            content_hash: "aa".into(),
            disclosure_deadline_ns: 1,
            members,
            published_at_ns: None,
        }
    }

    fn invite(kind: &str, handle: &str, revoked: bool) -> MemberInvite {
        MemberInvite { id_hash: invite_hash(kind, handle), revoked }
    }

    #[test]
    fn the_researcher_gets_in_through_their_verified_account() {
        assert_eq!(authorize(&report(vec![]), &caller(&[("near", "bob.testnet")])), Ok(Access::Researcher));
    }

    #[test]
    fn an_uninvited_user_is_denied() {
        let r = report(vec![invite("email", "ada@acme.com", false)]);
        assert!(authorize(&r, &caller(&[("email", "eve@evil.com"), ("near", "eve.testnet")])).is_err());
        assert!(authorize(&r, &caller(&[])).is_err());
        assert!(authorize(&report(vec![]), &caller(&[("email", "ada@acme.com")])).is_err());
    }

    #[test]
    fn an_invited_person_gets_in_with_any_identity_kind() {
        let r = report(vec![invite("twitter", "ada_x", false)]);
        assert_eq!(authorize(&r, &caller(&[("email", "ada@acme.com"), ("twitter", "ada_x")])), Ok(Access::InvitedMember));
    }

    #[test]
    fn a_revoked_invite_is_denied() {
        let r = report(vec![invite("email", "ada@acme.com", true)]);
        assert!(authorize(&r, &caller(&[("email", "ada@acme.com")])).is_err());
    }

    #[test]
    fn a_revoked_identity_wins_over_another_still_listed_identity() {
        let r = report(vec![invite("email", "ada@acme.com", true), invite("github", "ada", false)]);
        assert!(authorize(&r, &caller(&[("email", "ada@acme.com"), ("github", "ada")])).is_err());
    }

    #[test]
    fn the_same_handle_under_another_kind_does_not_match() {
        let r = report(vec![invite("email", "ada", false)]);
        assert!(authorize(&r, &caller(&[("github", "ada")])).is_err());
    }

    #[test]
    fn someone_else_holding_the_researchers_name_in_another_kind_is_denied() {
        // A GitHub user called "bob.testnet" is not the NEAR account bob.testnet.
        assert!(authorize(&report(vec![]), &caller(&[("github", "bob.testnet")])).is_err());
    }

    #[test]
    fn invite_hashes_ignore_case_at_signs_and_spacing() {
        assert_eq!(invite_hash("twitter", "@Ada_X "), invite_hash("Twitter", "ada_x"));
        assert_ne!(invite_hash("email", "a@b.c"), invite_hash("github", "a@b.c"));
        assert_eq!(invite_hash("email", "a@b.c").len(), 64);
    }

    #[test]
    fn chat_needs_an_active_member() {
        assert!(!has_active_member(&[]));
        assert!(!has_active_member(&[invite("email", "a@b.c", true)]));
        assert!(has_active_member(&[invite("email", "a@b.c", true), invite("email", "d@e.f", false)]));
    }
}
