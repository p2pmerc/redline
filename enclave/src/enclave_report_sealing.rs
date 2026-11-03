//! Sealing and unsealing of report keys.
//!
//! The browser encrypts the report body with a random AES-256-GCM key, hashes the ciphertext (that hash goes
//! on chain), then ECIES-seals `{key, content_hash}` to the enclave. The enclave opens that envelope, checks
//! it names the ciphertext registered on chain, and re-seals the key to a one-time browser key.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct KeyEnvelope {
    pub v: u8,
    /// AES-256-GCM key, hex.
    pub key: String,
    /// SHA-256 of the stored ciphertext, hex. Binds the key to one report.
    pub content_hash: String,
}

fn strip_0x(s: &str) -> &str {
    s.strip_prefix("0x").unwrap_or(s)
}

pub fn open_envelope(secret: &[u8; 32], sealed_hex: &str) -> Result<KeyEnvelope, String> {
    let bytes = hex::decode(strip_0x(sealed_hex.trim())).map_err(|_| "sealed key is not hex".to_string())?;
    let plain = ecies::decrypt(secret, &bytes).map_err(|_| "could not open the sealed key".to_string())?;
    let envelope: KeyEnvelope = serde_json::from_slice(&plain).map_err(|_| "sealed key has an unknown format".to_string())?;
    if envelope.v != 1 {
        return Err("sealed key version is not supported".into());
    }
    let key = hex::decode(&envelope.key).map_err(|_| "report key is not hex".to_string())?;
    if key.len() != 32 {
        return Err("report key must be 32 bytes".into());
    }
    Ok(envelope)
}

/// Encrypts `plain` to a recipient's one-time public key.
pub fn seal_to_recipient(recipient_pub_hex: &str, plain: &[u8]) -> Result<String, String> {
    let pk = hex::decode(strip_0x(recipient_pub_hex.trim())).map_err(|_| "recipient key is not hex".to_string())?;
    ecies::encrypt(&pk, plain).map(hex::encode).map_err(|_| "could not seal to the recipient key".to_string())
}

pub fn envelope_matches_hash(envelope: &KeyEnvelope, on_chain_hash: &str) -> bool {
    envelope.content_hash.eq_ignore_ascii_case(on_chain_hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keypair(seed: u8) -> ([u8; 32], String) {
        let secret = crate::enclave_key::derive_ecies_secret(&[seed; 32]).unwrap();
        let public = crate::enclave_key::public_key_hex(&secret).unwrap();
        (secret, public)
    }

    fn seal(public: &str, envelope: &KeyEnvelope) -> String {
        seal_to_recipient(public, serde_json::to_string(envelope).unwrap().as_bytes()).unwrap()
    }

    fn sample() -> KeyEnvelope {
        KeyEnvelope { v: 1, key: "11".repeat(32), content_hash: "ab".repeat(32) }
    }

    #[test]
    fn round_trips_an_envelope() {
        let (secret, public) = keypair(1);
        let opened = open_envelope(&secret, &seal(&public, &sample())).unwrap();
        assert_eq!(opened, sample());
    }

    #[test]
    fn the_wrong_enclave_key_cannot_open_it() {
        let (_, public) = keypair(1);
        let (other_secret, _) = keypair(2);
        assert!(open_envelope(&other_secret, &seal(&public, &sample())).is_err());
    }

    #[test]
    fn rejects_short_keys_and_bad_versions() {
        let (secret, public) = keypair(1);
        let mut short = sample();
        short.key = "11".repeat(16);
        assert!(open_envelope(&secret, &seal(&public, &short)).is_err());
        let mut wrong = sample();
        wrong.v = 2;
        assert!(open_envelope(&secret, &seal(&public, &wrong)).is_err());
    }

    #[test]
    fn hash_binding_ignores_case_only() {
        let envelope = sample();
        assert!(envelope_matches_hash(&envelope, &"AB".repeat(32)));
        assert!(!envelope_matches_hash(&envelope, &"cd".repeat(32)));
    }

    #[test]
    fn reseals_to_a_one_time_browser_key() {
        let (browser_secret, browser_public) = keypair(5);
        let sealed = seal_to_recipient(&browser_public, b"hello").unwrap();
        let plain = ecies::decrypt(&browser_secret, &hex::decode(sealed).unwrap()).unwrap();
        assert_eq!(plain, b"hello");
    }
}
