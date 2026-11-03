//! Privy sign-in verification, done from inside the enclave.
//!
//! The caller's Privy access token is verified here: ES256 signature against the app's JWKS, issuer
//! `privy.io`, audience equal to the app id compiled in, and not expired. The enclave then asks Privy over
//! TLS which accounts (NEAR wallets, email, X, Telegram, GitHub) belong to that user, so a caller cannot
//! claim an identity it does not hold.

use crate::http_client::{Header, HttpFetcher};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use p256::ecdsa::{signature::Verifier, Signature, VerifyingKey};
use serde_json::Value;

pub const ISSUER: &str = "privy.io";
pub const APP_ID: &str = match option_env!("REDLINE_PRIVY_APP_ID") {
    Some(id) => id,
    None => "cmw091k5e006v0glbrx3ouzry",
};
/// Privy's client API wants an allowed Origin. Set `REDLINE_APP_ORIGIN` at build time to the deployed site.
pub const APP_ORIGIN: &str = match option_env!("REDLINE_APP_ORIGIN") {
    Some(origin) => origin,
    None => "http://localhost:5173",
};

#[derive(Debug, PartialEq)]
pub struct VerifiedClaims {
    pub user_id: String,
}

/// Checks the token against a JWKS document. Pure, so it can be unit tested.
pub fn verify_token(token: &str, jwks: &Value, app_id: &str, now_secs: u64) -> Result<VerifiedClaims, String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err("sign-in token has the wrong shape".into());
    }
    let header: Value = decode_json(parts[0], "token header")?;
    if header["alg"] != "ES256" {
        return Err("sign-in token uses an unsupported algorithm".into());
    }
    let keys = jwks["keys"].as_array().ok_or("the sign-in key set is invalid")?;
    let jwk = match header["kid"].as_str() {
        Some(kid) => keys.iter().find(|k| k["kid"] == kid),
        None => keys.first(),
    }
    .ok_or("the sign-in key is unknown")?;
    let x = B64.decode(jwk["x"].as_str().ok_or("jwk x missing")?).map_err(|_| "jwk x is invalid")?;
    let y = B64.decode(jwk["y"].as_str().ok_or("jwk y missing")?).map_err(|_| "jwk y is invalid")?;
    let mut sec1 = vec![4u8];
    sec1.extend_from_slice(&x);
    sec1.extend_from_slice(&y);
    let key = VerifyingKey::from_sec1_bytes(&sec1).map_err(|_| "sign-in key is invalid")?;
    let signature = Signature::from_slice(&B64.decode(parts[2]).map_err(|_| "signature is invalid")?)
        .map_err(|_| "signature is invalid")?;
    key.verify(format!("{}.{}", parts[0], parts[1]).as_bytes(), &signature)
        .map_err(|_| "sign-in signature is not valid".to_string())?;

    let claims: Value = decode_json(parts[1], "token claims")?;
    if claims["iss"] != ISSUER {
        return Err("sign-in token has the wrong issuer".into());
    }
    let audience_ok = claims["aud"] == app_id
        || claims["aud"].as_array().map_or(false, |list| list.iter().any(|a| a == app_id));
    if !audience_ok {
        return Err("sign-in token is for another app".into());
    }
    if claims["exp"].as_u64().unwrap_or(0) <= now_secs {
        return Err("sign-in has expired, sign in again".into());
    }
    let user_id = claims["sub"].as_str().ok_or("sign-in token has no subject")?.to_string();
    Ok(VerifiedClaims { user_id })
}

fn decode_json(part: &str, what: &str) -> Result<Value, String> {
    serde_json::from_slice(&B64.decode(part).map_err(|_| format!("{what} is not base64"))?).map_err(|_| format!("{what} is not json"))
}

/// A normalized linked account of a Privy user.
#[derive(Debug, PartialEq, Clone)]
pub struct LinkedIdentity {
    /// "near", "email", "twitter", "telegram" or "github".
    pub kind: String,
    /// Lowercase NEAR account, email address or handle without a leading @.
    pub handle: String,
}

pub fn linked_identities(user: &Value) -> Vec<LinkedIdentity> {
    let Some(list) = user["linked_accounts"].as_array() else { return vec![] };
    list.iter()
        .filter_map(|account| {
            let kind = account["type"].as_str()?;
            let (kind, handle) = match kind {
                "wallet" if account["chain_type"] == "near" || account["chainType"] == "near" => {
                    ("near", account["address"].as_str()?)
                }
                "email" => ("email", account["address"].as_str().or_else(|| account["email"].as_str())?),
                "twitter_oauth" => ("twitter", account["username"].as_str()?),
                "github_oauth" => ("github", account["username"].as_str()?),
                "telegram" => ("telegram", account["username"].as_str()?),
                _ => return None,
            };
            Some(LinkedIdentity { kind: kind.into(), handle: handle.trim_start_matches('@').to_lowercase() })
        })
        .collect()
}

/// A signed-in user: Privy id plus everything linked to them, as reported by Privy.
#[derive(Debug)]
#[allow(dead_code)]
pub struct SignedInUser {
    pub user_id: String,
    pub identities: Vec<LinkedIdentity>,
}

impl SignedInUser {
    pub fn holds(&self, kind: &str, handle: &str) -> bool {
        let wanted = handle.trim_start_matches('@').to_lowercase();
        self.identities.iter().any(|i| i.kind == kind && i.handle == wanted)
    }
}

pub fn sign_in(fetcher: &dyn HttpFetcher, token: &str) -> Result<SignedInUser, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (status, body) = fetcher.get(&format!("https://auth.privy.io/api/v1/apps/{APP_ID}/jwks.json"), &[])?;
    if status != 200 {
        return Err("could not load the sign-in keys".into());
    }
    let jwks: Value = serde_json::from_slice(&body).map_err(|_| "the sign-in keys are not json".to_string())?;
    let claims = verify_token(token, &jwks, APP_ID, now)?;

    let bearer = format!("Bearer {token}");
    let (status, body) = fetcher.get(
        "https://auth.privy.io/api/v1/users/me",
        &[Header("Authorization", &bearer), Header("privy-app-id", APP_ID), Header("Origin", APP_ORIGIN)],
    )?;
    if status != 200 {
        return Err("the sign-in check failed".into());
    }
    let me: Value = serde_json::from_slice(&body).map_err(|_| "the user record is not json".to_string())?;
    let user = if me["user"].is_object() { &me["user"] } else { &me };
    if user["id"] != claims.user_id {
        return Err("the sign-in belongs to another user".into());
    }
    Ok(SignedInUser { user_id: claims.user_id, identities: linked_identities(user) })
}

#[cfg(test)]
mod tests {
    use super::*;
    use p256::ecdsa::{signature::Signer, SigningKey};
    use serde_json::json;

    const APP: &str = "test-app";

    fn signing_key() -> SigningKey {
        SigningKey::from_slice(&[3u8; 32]).unwrap()
    }

    fn jwks() -> Value {
        let point = signing_key().verifying_key().to_encoded_point(false);
        json!({"keys": [{"kid": "k1", "kty": "EC", "crv": "P-256",
            "x": B64.encode(point.x().unwrap()), "y": B64.encode(point.y().unwrap())}]})
    }

    fn token(claims: Value, alg: &str) -> String {
        let header = B64.encode(json!({"alg": alg, "kid": "k1", "typ": "JWT"}).to_string());
        let payload = B64.encode(claims.to_string());
        let signature: Signature = signing_key().sign(format!("{header}.{payload}").as_bytes());
        format!("{header}.{payload}.{}", B64.encode(signature.to_bytes()))
    }

    fn good_claims() -> Value {
        json!({"iss": "privy.io", "aud": APP, "sub": "did:privy:abc", "exp": 2_000_000_000u64})
    }

    #[test]
    fn accepts_a_valid_token() {
        let claims = verify_token(&token(good_claims(), "ES256"), &jwks(), APP, 1_900_000_000).unwrap();
        assert_eq!(claims.user_id, "did:privy:abc");
    }

    #[test]
    fn rejects_expired_wrong_issuer_and_wrong_audience() {
        let t = token(good_claims(), "ES256");
        assert!(verify_token(&t, &jwks(), APP, 2_000_000_001).is_err());
        let mut c = good_claims();
        c["iss"] = json!("evil.example");
        assert!(verify_token(&token(c, "ES256"), &jwks(), APP, 1).is_err());
        let mut c = good_claims();
        c["aud"] = json!("other-app");
        assert!(verify_token(&token(c, "ES256"), &jwks(), APP, 1).is_err());
    }

    #[test]
    fn accepts_an_audience_list() {
        let mut c = good_claims();
        c["aud"] = json!(["x", APP]);
        assert!(verify_token(&token(c, "ES256"), &jwks(), APP, 1).is_ok());
    }

    #[test]
    fn rejects_bad_signature_alg_and_shape() {
        let t = token(good_claims(), "ES256");
        let mut parts: Vec<String> = t.split('.').map(String::from).collect();
        parts[1] = B64.encode(json!({"iss":"privy.io","aud":APP,"sub":"did:privy:other","exp":2_000_000_000u64}).to_string());
        assert!(verify_token(&parts.join("."), &jwks(), APP, 1).is_err());
        assert!(verify_token(&token(good_claims(), "HS256"), &jwks(), APP, 1).is_err());
        assert!(verify_token("a.b", &jwks(), APP, 1).is_err());
        assert!(verify_token("", &jwks(), APP, 1).is_err());
    }

    #[test]
    fn normalizes_linked_accounts() {
        let user = json!({"id": "u", "linked_accounts": [
            {"type": "wallet", "chain_type": "near", "address": "ABC.testnet"},
            {"type": "wallet", "chain_type": "ethereum", "address": "0xabc"},
            {"type": "email", "address": "Ada@Example.com"},
            {"type": "twitter_oauth", "username": "Ada_X"},
            {"type": "github_oauth", "username": "ada"},
            {"type": "telegram", "username": "ada_t"},
            {"type": "passkey"}
        ]});
        let signed = SignedInUser { user_id: "u".into(), identities: linked_identities(&user) };
        assert_eq!(signed.identities.len(), 5);
        assert!(signed.holds("near", "abc.testnet"));
        assert!(signed.holds("email", "ada@example.com"));
        assert!(signed.holds("twitter", "@ada_x"));
        assert!(!signed.holds("near", "0xabc"));
        assert!(!signed.holds("github", "someone-else"));
    }
}
