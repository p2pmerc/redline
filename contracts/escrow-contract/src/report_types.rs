//! Data model stored on chain. Report bodies are never stored here, only hashes.

use near_sdk::json_types::U128;
use near_sdk::near;
use near_sdk::AccountId;

/// Where a report is in its life. Money only moves in `Funded`, `MergeConfirmed`, `Paying`.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ReportStatus {
    /// Ciphertext hash is registered, no counterparty terms yet.
    Registered,
    /// The team proposed an amount and a repository.
    TermsProposed,
    /// The researcher accepted exactly those terms.
    TermsAccepted,
    /// The escrow holds the agreed amount.
    Funded,
    /// The enclave saw the fix pull request merged once. Payout needs a second look.
    MergeConfirmed,
    /// A payout is in flight. Nothing else may touch the escrow.
    Paying,
    Paid,
    Refunded,
}

/// What the two sides signed on chain by calling propose_terms and accept_terms.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct AgreedTerms {
    pub amount: U128,
    /// GitHub repository in `owner/name` form that the fix must land in.
    pub repo: String,
    /// Hash of the off-chain text of the agreement, produced in the sealed chat.
    pub terms_hash: String,
    pub researcher_accepted: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct EscrowDetails {
    pub amount: U128,
    pub funded_at_ns: u64,
    /// After this moment the funder may start a refund.
    pub expires_at_ns: u64,
    pub pull_request: Option<u64>,
    pub merge_confirmed_at_ns: Option<u64>,
    /// Time the current enclave request was sent, `None` when nothing is in flight.
    pub check_started_at_ns: Option<u64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct ReportRecord {
    pub researcher: AccountId,
    /// Hex SHA-256 of the ciphertext. Lets anyone prove the unsealed text is the sealed text.
    pub content_hash: String,
    pub disclosure_deadline_ns: u64,
    pub registered_at_ns: u64,
    pub team: Option<AccountId>,
    pub terms: Option<AgreedTerms>,
    pub escrow: Option<EscrowDetails>,
    pub status: ReportStatus,
    pub message_count: u64,
    pub published_at_ns: Option<u64>,
    pub evidence_hash: Option<String>,
}

/// Which question the enclave is being asked. Decides what happens with the answer.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CheckPhase {
    /// First sighting of the merge.
    Confirm,
    /// Second sighting, right before money leaves.
    Payout,
    /// Right before the funder gets the money back.
    Refund,
}

/// Contract-wide settings. Changing them can never move escrowed money.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct ContractConfig {
    pub owner: AccountId,
    pub outlayer_contract: AccountId,
    /// GitHub URL of the enclave project that OutLayer is asked to run.
    pub enclave_source_url: String,
    /// Optional pinned build hash of that project.
    pub enclave_source_hash: Option<String>,
    /// Smallest deposit forwarded to OutLayer to pay for one execution.
    pub min_outlayer_deposit: U128,
    /// How long funded money stays locked before the funder can ask for a refund.
    pub escrow_ttl_ns: u64,
    /// After expiry plus this grace, the funder may refund even if the enclave is silent.
    pub liveness_grace_ns: u64,
}

/// Which kind of money movement a transfer callback is settling.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TransferKind {
    Payout,
    Refund,
}
