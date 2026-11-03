//! Read-only views of NEAR testnet. The enclave never trusts the caller about who is a party to a report:
//! it reads the escrow contract itself.

use crate::http_client::HttpFetcher;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::Deserialize;
use serde_json::{json, Value};

pub const DEFAULT_RPC: &str = "https://test.rpc.fastnear.com";
pub const DEFAULT_CONTRACT: &str = match option_env!("REDLINE_ESCROW_CONTRACT") {
    Some(id) => id,
    None => "escrow.redline.testnet",
};

/// The slice of the contract's `ReportRecord` the enclave cares about.
#[derive(Deserialize, Debug, Clone, PartialEq)]
pub struct ReportView {
    pub researcher: String,
    pub content_hash: String,
    pub disclosure_deadline_ns: u64,
    /// Readers the researcher invited, as identity hashes. See `report_access_control`.
    #[serde(default)]
    pub members: Vec<MemberInvite>,
    #[serde(default)]
    pub published_at_ns: Option<u64>,
}

#[derive(Deserialize, Debug, Clone, PartialEq)]
pub struct MemberInvite {
    pub id_hash: String,
    #[serde(default)]
    pub revoked: bool,
}

pub trait ChainView {
    fn get_report(&self, report_id: &str) -> Result<Option<ReportView>, String>;
    /// True when `public_key` (`ed25519:...`) is a full access key of `account_id`.
    fn has_full_access_key(&self, account_id: &str, public_key: &str) -> Result<bool, String>;
}

pub struct RpcChain<'a> {
    pub fetcher: &'a dyn HttpFetcher,
    pub rpc_url: String,
    pub contract_id: String,
}

impl<'a> RpcChain<'a> {
    pub fn from_env(fetcher: &'a dyn HttpFetcher) -> Self {
        Self {
            fetcher,
            rpc_url: std::env::var("REDLINE_NEAR_RPC").unwrap_or_else(|_| DEFAULT_RPC.to_string()),
            contract_id: std::env::var("REDLINE_ESCROW_CONTRACT").unwrap_or_else(|_| DEFAULT_CONTRACT.to_string()),
        }
    }

    fn query(&self, params: Value) -> Result<Value, String> {
        let body = json!({"jsonrpc": "2.0", "id": "redline", "method": "query", "params": params}).to_string();
        let (status, bytes) = self.fetcher.post_json(&self.rpc_url, &body)?;
        if status != 200 {
            return Err("the NEAR node did not answer".into());
        }
        let value: Value = serde_json::from_slice(&bytes).map_err(|_| "the NEAR node answer is not json".to_string())?;
        Ok(value)
    }
}

impl ChainView for RpcChain<'_> {
    fn get_report(&self, report_id: &str) -> Result<Option<ReportView>, String> {
        let args = json!({ "report_id": report_id }).to_string();
        let answer = self.query(json!({
            "request_type": "call_function", "finality": "final",
            "account_id": self.contract_id, "method_name": "get_report",
            "args_base64": B64.encode(args)
        }))?;
        if answer["error"].is_object() {
            return Err("the escrow contract could not be read".into());
        }
        let bytes: Vec<u8> = answer["result"]["result"]
            .as_array()
            .ok_or("the escrow contract answer is malformed")?
            .iter()
            .map(|b| b.as_u64().unwrap_or(0) as u8)
            .collect();
        let parsed: Option<ReportView> = serde_json::from_slice(&bytes).map_err(|_| "the report record is malformed".to_string())?;
        Ok(parsed)
    }

    fn has_full_access_key(&self, account_id: &str, public_key: &str) -> Result<bool, String> {
        let answer = self.query(json!({
            "request_type": "view_access_key", "finality": "final",
            "account_id": account_id, "public_key": public_key
        }))?;
        if answer["error"].is_object() {
            return Ok(false);
        }
        Ok(answer["result"]["permission"] == "FullAccess")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http_client::Header;

    struct Canned(u16, String);
    impl HttpFetcher for Canned {
        fn get(&self, _: &str, _: &[Header]) -> Result<(u16, Vec<u8>), String> {
            Err("unused".into())
        }
        fn post_json(&self, _: &str, _: &str) -> Result<(u16, Vec<u8>), String> {
            Ok((self.0, self.1.clone().into_bytes()))
        }
    }

    fn chain<'a>(f: &'a Canned) -> RpcChain<'a> {
        RpcChain { fetcher: f, rpc_url: "x".into(), contract_id: "c.testnet".into() }
    }

    fn rpc_result(record: &str) -> String {
        let bytes: Vec<u8> = record.bytes().collect();
        json!({"result": {"result": bytes}}).to_string()
    }

    #[test]
    fn reads_a_report_record() {
        let record = r#"{"researcher":"bob.testnet","content_hash":"aa","disclosure_deadline_ns":5,"team":"acme.testnet","members":[{"id_hash":"cc","revoked":true}],"status":"Funded","extra":1}"#;
        let f = Canned(200, rpc_result(record));
        let view = chain(&f).get_report("rl-1").unwrap().unwrap();
        assert_eq!(view.researcher, "bob.testnet");
        assert_eq!(view.members, vec![MemberInvite { id_hash: "cc".into(), revoked: true }]);
    }

    #[test]
    fn missing_report_is_none_and_errors_propagate() {
        assert_eq!(chain(&Canned(200, rpc_result("null"))).get_report("rl-1").unwrap(), None);
        assert!(chain(&Canned(500, String::new())).get_report("rl-1").is_err());
        assert!(chain(&Canned(200, r#"{"error":{"name":"x"}}"#.into())).get_report("rl-1").is_err());
    }

    #[test]
    fn only_full_access_keys_count() {
        let full = Canned(200, r#"{"result":{"permission":"FullAccess","nonce":1}}"#.into());
        assert!(chain(&full).has_full_access_key("a.testnet", "ed25519:x").unwrap());
        let limited = Canned(200, r#"{"result":{"permission":{"FunctionCall":{}}}}"#.into());
        assert!(!chain(&limited).has_full_access_key("a.testnet", "ed25519:x").unwrap());
        let unknown = Canned(200, r#"{"error":{"name":"UNKNOWN_ACCESS_KEY"}}"#.into());
        assert!(!chain(&unknown).has_full_access_key("a.testnet", "ed25519:x").unwrap());
    }
}
