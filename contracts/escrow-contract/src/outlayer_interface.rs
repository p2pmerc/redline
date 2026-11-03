//! The part of OutLayer this contract talks to.
//!
//! Shape taken from the OutLayer on-chain integration guide. The two documented forms of
//! `code_source` differ, so the JSON is built in one place to make that easy to change.

use near_sdk::serde_json::{json, Value};
use near_sdk::{ext_contract, AccountId};

use crate::report_types::{CheckPhase, ContractConfig};

#[ext_contract(ext_outlayer)]
#[allow(dead_code)]
pub trait OutLayer {
    fn request_execution(
        &mut self,
        code_source: Value,
        resource_limits: Value,
        input_data: String,
        secrets_ref: Option<Value>,
        response_format: String,
        payer_account_id: Option<AccountId>,
    );
}

pub fn code_source(config: &ContractConfig) -> Value {
    json!({
        "GitHub": {
            "url": config.enclave_source_url,
            "hash": config.enclave_source_hash,
        }
    })
}

pub fn resource_limits() -> Value {
    json!({ "max_memory_mb": 128, "max_instructions": 2_000_000_000u64, "max_execution_seconds": 30 })
}

/// Input for the enclave action that checks a pull request.
pub fn merge_check_input(report_id: &str, repo: &str, pull_request: u64, phase: CheckPhase) -> String {
    json!({
        "action": "check_merge",
        "report_id": report_id,
        "repo": repo,
        "pull_request": pull_request,
        "phase": match phase {
            CheckPhase::Confirm => "confirm",
            CheckPhase::Payout => "payout",
            CheckPhase::Refund => "refund",
        },
    })
    .to_string()
}

/// What the enclave answers. Anything that does not parse is treated as `unknown`.
#[derive(near_sdk::serde::Deserialize, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct MergeCheckAnswer {
    pub status: String,
    pub repo: String,
    pub pull_request: u64,
    #[serde(default)]
    pub merge_commit: Option<String>,
}
