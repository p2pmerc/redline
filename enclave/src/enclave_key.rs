//! The enclave's long-lived ECIES key (secp256k1). It is derived with HKDF from a master secret that the
//! OutLayer keystore generates inside the TEE (`PROTECTED_REDLINE_MASTER`, read in `main.rs`). Nobody,
//! including the operator, ever sees the master or the derived key.

use hkdf::Hkdf;
use sha2::Sha256;

const KEY_SALT: &[u8] = b"redline";
const ECIES_INFO: &[u8] = b"redline:ecies:v1";
const CHAT_INFO_PREFIX: &str = "redline:chat:v1:";

pub fn derive_ecies_secret(master: &[u8]) -> Result<[u8; 32], String> {
    let mut out = [0u8; 32];
    Hkdf::<Sha256>::new(Some(KEY_SALT), master)
        .expand(ECIES_INFO, &mut out)
        .map_err(|_| "key derivation failed".to_string())?;
    libsecp256k1::SecretKey::parse(&out).map_err(|_| "derived key is not a valid curve scalar".to_string())?;
    Ok(out)
}

/// One symmetric key per report for the sealed negotiation channel.
pub fn derive_chat_key(master: &[u8], report_id: &str) -> Result<[u8; 32], String> {
    let mut out = [0u8; 32];
    let info = format!("{CHAT_INFO_PREFIX}{report_id}");
    Hkdf::<Sha256>::new(Some(KEY_SALT), master)
        .expand(info.as_bytes(), &mut out)
        .map_err(|_| "key derivation failed".to_string())?;
    Ok(out)
}

/// Uncompressed public key, hex. Browsers seal report keys to this.
pub fn public_key_hex(secret: &[u8; 32]) -> Result<String, String> {
    let sk = libsecp256k1::SecretKey::parse(secret).map_err(|_| "bad secret".to_string())?;
    let pk = libsecp256k1::PublicKey::from_secret_key(&sk);
    Ok(hex::encode(pk.serialize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derivation_is_stable_and_domain_separated() {
        let master = [7u8; 32];
        let a = derive_ecies_secret(&master).unwrap();
        assert_eq!(a, derive_ecies_secret(&master).unwrap());
        assert_ne!(a, derive_chat_key(&master, "rl-1").unwrap());
        assert_ne!(derive_chat_key(&master, "rl-1").unwrap(), derive_chat_key(&master, "rl-2").unwrap());
    }

    #[test]
    fn public_key_is_uncompressed() {
        let secret = derive_ecies_secret(&[9u8; 32]).unwrap();
        let hex_key = public_key_hex(&secret).unwrap();
        assert_eq!(hex_key.len(), 130);
        assert!(hex_key.starts_with("04"));
    }
}
