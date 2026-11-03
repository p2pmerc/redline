//! The part of OutLayer this contract talks to.
//!
//! Shape taken from the OutLayer on-chain integration guide (`source` is `Project` or `WasmUrl`).
//! The JSON is built in one place so a change in the shape touches only this file.

use near_sdk::serde_json::{json, Value};
use near_sdk::{ext_contract, AccountId};

use crate::report_types::{CheckPhase, ContractConfig};

#[ext_contract(ext_outlayer)]
#[allow(dead_code)]
pub trait OutLayer {
    fn request_execution(
        &mut self,
        source: Value,
        resource_limits: Value,
        input_data: String,
        secrets_ref: Option<Value>,
        response_format: String,
        payer_account_id: Option<AccountId>,
    );
}

/// The keystore secrets (the enclave master secret) live under the project owner's default profile.
pub fn secrets_ref(config: &ContractConfig) -> Value {
    let owner = config.enclave_project_id.split('/').next().unwrap_or_default();
    json!({ "profile": "default", "account_id": owner })
}

/// The enclave is run as a registered OutLayer project, so the version cannot change under a running escrow.
/// `version_key` is the wasm sha256 of one version, or null for the active version.
pub fn execution_source(config: &ContractConfig) -> Value {
    json!({
        "Project": {
            "project_id": config.enclave_project_id,
            "version_key": config.enclave_version_key,
        }
    })
}

pub fn resource_limits() -> Value {
    json!({ "max_memory_mb": 128, "max_instructions": 2_000_000_000u64, "max_execution_seconds": 30 })
}

/// Input for the enclave action that checks a pull request.
pub fn merge_check_input(report_id: &str, repo: &str, pull_request: u64, phase: CheckPhase, expected_author: Option<&str>) -> String {
    let mut body = json!({
        "action": "merge_check",
        "report_id": report_id,
        "repo": repo,
        "pull_request": pull_request,
        "phase": match phase {
            CheckPhase::Confirm => "confirm",
            CheckPhase::Payout => "payout",
            CheckPhase::Refund => "refund",
        },
    });
    if let Some(author) = expected_author.map(|s| s.trim().trim_start_matches('@')).filter(|s| !s.is_empty()) {
        body["expected_author"] = json!(author);
    }
    body.to_string()
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

/// The worker wraps most outputs as `{"success": true, "result": ...}`.
#[derive(near_sdk::serde::Deserialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct AnswerEnvelope {
    pub success: bool,
    pub result: MergeCheckAnswer,
}
