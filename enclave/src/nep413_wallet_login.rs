//! NEP-413 "sign a message" wallet login, for people who sign in with a NEAR wallet instead of Privy.
//!
//! The signed message is bound to this app (recipient), is fresh (timestamp in the message), and the
//! signing key must be a full access key of the claimed account on chain.

use crate::near_chain_reader::ChainView;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};

pub const RECIPIENT: &str = "redline";
pub const MESSAGE_PREFIX: &str = "redline-signin:";
const MAX_AGE_MS: u64 = 10 * 60 * 1000;
const NEP413_TAG: u32 = (1u32 << 31) + 413;

#[derive(Deserialize, Debug, Clone)]
pub struct WalletProof {
    pub account_id: String,
    /// `ed25519:<base58>`
    pub public_key: String,
    /// base64 signature
    pub signature: String,
    pub message: String,
    /// base64, 32 bytes
    pub nonce: String,
    pub recipient: String,
}

fn borsh_string(out: &mut Vec<u8>, s: &str) {
    out.extend_from_slice(&(s.len() as u32).to_le_bytes());
    out.extend_from_slice(s.as_bytes());
}

/// SHA-256 of `borsh(tag) || borsh(payload)`, the value that wallets sign.
pub fn signing_digest(message: &str, nonce: &[u8; 32], recipient: &str) -> [u8; 32] {
    let mut buf = Vec::new();
    buf.extend_from_slice(&NEP413_TAG.to_le_bytes());
    borsh_string(&mut buf, message);
    buf.extend_from_slice(nonce);
    borsh_string(&mut buf, recipient);
    buf.push(0); // callbackUrl: None
    Sha256::digest(&buf).into()
}

fn parse_public_key(public_key: &str) -> Result<VerifyingKey, String> {
    let encoded = public_key.strip_prefix("ed25519:").ok_or("only ed25519 keys are supported")?;
    let bytes = bs58::decode(encoded).into_vec().map_err(|_| "public key is not base58".to_string())?;
    let array: [u8; 32] = bytes.try_into().map_err(|_| "public key has the wrong length".to_string())?;
    VerifyingKey::from_bytes(&array).map_err(|_| "public key is invalid".to_string())
}

/// Verifies the proof and returns the account that signed in.
pub fn wallet_login(proof: &WalletProof, chain: &dyn ChainView, now_ms: u64) -> Result<String, String> {
    if proof.recipient != RECIPIENT {
        return Err("the wallet signed for another app".into());
    }
    let stamp: u64 = proof
        .message
        .strip_prefix(MESSAGE_PREFIX)
        .and_then(|s| s.parse().ok())
        .ok_or("the signed message is not a Redline sign-in")?;
    if stamp > now_ms + 60_000 || now_ms.saturating_sub(stamp) > MAX_AGE_MS {
        return Err("the wallet sign-in is stale, sign in again".into());
    }
    let nonce: [u8; 32] = B64
        .decode(&proof.nonce)
        .map_err(|_| "nonce is not base64".to_string())?
        .try_into()
        .map_err(|_| "nonce must be 32 bytes".to_string())?;
    let key = parse_public_key(&proof.public_key)?;
    let signature = Signature::from_slice(&B64.decode(&proof.signature).map_err(|_| "signature is not base64".to_string())?)
        .map_err(|_| "signature is invalid".to_string())?;
    key.verify(&signing_digest(&proof.message, &nonce, &proof.recipient), &signature)
        .map_err(|_| "the wallet signature is not valid".to_string())?;
    if !chain.has_full_access_key(&proof.account_id, &proof.public_key)? {
        return Err("that key does not control the account".into());
    }
    Ok(proof.account_id.to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::near_chain_reader::ReportView;
    use ed25519_dalek::{Signer, SigningKey};

    struct Chain(bool);
    impl ChainView for Chain {
        fn get_report(&self, _: &str) -> Result<Option<ReportView>, String> {
            Ok(None)
        }
        fn has_full_access_key(&self, _: &str, _: &str) -> Result<bool, String> {
            Ok(self.0)
        }
    }

    const NOW: u64 = 1_800_000_000_000;

    fn proof_at(stamp: u64, recipient: &str) -> WalletProof {
        let signing = SigningKey::from_bytes(&[5u8; 32]);
        let message = format!("{MESSAGE_PREFIX}{stamp}");
        let nonce = [1u8; 32];
        let signature = signing.sign(&signing_digest(&message, &nonce, recipient));
        WalletProof {
            account_id: "Bob.testnet".into(),
            public_key: format!("ed25519:{}", bs58::encode(signing.verifying_key().to_bytes()).into_string()),
            signature: B64.encode(signature.to_bytes()),
            message,
            nonce: B64.encode(nonce),
            recipient: recipient.into(),
        }
    }

    #[test]
    fn accepts_a_fresh_signature_from_a_controlling_key() {
        assert_eq!(wallet_login(&proof_at(NOW - 1000, RECIPIENT), &Chain(true), NOW).unwrap(), "bob.testnet");
    }

    #[test]
    fn rejects_keys_that_do_not_control_the_account() {
        assert!(wallet_login(&proof_at(NOW, RECIPIENT), &Chain(false), NOW).is_err());
    }

    #[test]
    fn rejects_stale_future_and_foreign_messages() {
        assert!(wallet_login(&proof_at(NOW - MAX_AGE_MS - 1, RECIPIENT), &Chain(true), NOW).is_err());
        assert!(wallet_login(&proof_at(NOW + 120_000, RECIPIENT), &Chain(true), NOW).is_err());
        assert!(wallet_login(&proof_at(NOW, "other-app"), &Chain(true), NOW).is_err());
    }

    #[test]
    fn rejects_tampered_proofs() {
        let mut p = proof_at(NOW, RECIPIENT);
        p.message = format!("{MESSAGE_PREFIX}{}", NOW - 5);
        assert!(wallet_login(&p, &Chain(true), NOW).is_err());
        let mut p = proof_at(NOW, RECIPIENT);
        p.signature = B64.encode([0u8; 64]);
        assert!(wallet_login(&p, &Chain(true), NOW).is_err());
        let mut p = proof_at(NOW, RECIPIENT);
        p.public_key = "secp256k1:abc".into();
        assert!(wallet_login(&p, &Chain(true), NOW).is_err());
    }
}
