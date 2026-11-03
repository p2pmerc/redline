//! Redline escrow contract.
//!
//! Holds the reward for a sealed vulnerability report and releases it to the researcher once the
//! enclave has seen the fix pull request merged, twice. Report text is never stored on chain,
//! only its ciphertext hash and the hash of each negotiation message.
//!
//! The contract only trusts answers that come back through its own private callback after a
//! `request_execution` call it started itself.

mod escrow_events;
mod outlayer_interface;
mod report_types;

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
};

use escrow_events::emit;
use outlayer_interface::{ext_outlayer, AnswerEnvelope, MergeCheckAnswer};
pub use report_types::*;

const DAY_NS: u64 = 86_400_000_000_000;
const MIN_DISCLOSURE_WINDOW_NS: u64 = 7 * DAY_NS;
const MAX_DISCLOSURE_WINDOW_NS: u64 = 365 * DAY_NS;
/// A request that has not answered after this long may be asked again.
const STALE_CHECK_NS: u64 = 15 * 60 * 1_000_000_000;
/// Paid by the researcher on registration. Covers the storage the record occupies.
const REGISTRATION_FEE: NearToken = NearToken::from_millinear(10);
const MAX_MEMBERS: usize = 20;
const CHECK_CALLBACK_GAS: Gas = Gas::from_tgas(25);
const SETTLE_CALLBACK_GAS: Gas = Gas::from_tgas(10);

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct EscrowContract {
    config: ContractConfig,
    reports: LookupMap<String, ReportRecord>,
}

/// Outcome of one enclave check after it was validated against the stored pull request.
#[derive(PartialEq, Eq, Debug)]
enum Verdict {
    Merged,
    NotMerged,
    Unknown,
}

#[near]
impl EscrowContract {
    #[init]
    pub fn new(
        owner: AccountId,
        outlayer_contract: AccountId,
        enclave_source_url: String,
        enclave_source_hash: Option<String>,
        escrow_ttl_days: u64,
        liveness_grace_days: u64,
    ) -> Self {
        require!(escrow_ttl_days >= 1, "escrow ttl must be at least one day");
        Self {
            config: ContractConfig {
                owner,
                outlayer_contract,
                enclave_source_url,
                enclave_source_hash,
                min_outlayer_deposit: U128(NearToken::from_millinear(10).as_yoctonear()),
                escrow_ttl_ns: escrow_ttl_days * DAY_NS,
                liveness_grace_ns: liveness_grace_days * DAY_NS,
            },
            reports: LookupMap::new(b"r"),
        }
    }

    // ---------------------------------------------------------------- registration and chat

    /// The researcher registers the hash of the sealed report. Pays a small storage fee.
    #[payable]
    pub fn register_report(
        &mut self,
        report_id: String,
        content_hash: String,
        disclosure_deadline_ns: u64,
    ) {
        require!(valid_report_id(&report_id), "report id must be 1-64 chars of a-z, 0-9 or '-'");
        require!(valid_sha256_hex(&content_hash), "content hash must be 64 hex characters");
        require!(!self.reports.contains_key(&report_id), "report id already registered");
        let now = env::block_timestamp();
        require!(
            disclosure_deadline_ns >= now + MIN_DISCLOSURE_WINDOW_NS
                && disclosure_deadline_ns <= now + MAX_DISCLOSURE_WINDOW_NS,
            "disclosure deadline must be between 7 and 365 days from now"
        );
        let deposit = env::attached_deposit();
        require!(deposit >= REGISTRATION_FEE, "attach at least 0.01 NEAR for storage");

        let researcher = env::predecessor_account_id();
        self.reports.insert(
            report_id.clone(),
            ReportRecord {
                researcher: researcher.clone(),
                content_hash: content_hash.clone(),
                disclosure_deadline_ns,
                registered_at_ns: now,
                team: None,
                members: Vec::new(),
                terms: None,
                escrow: None,
                status: ReportStatus::Registered,
                message_count: 0,
                published_at_ns: None,
                evidence_hash: None,
            },
        );
        emit(
            "report_registered",
            json!({ "report_id": report_id, "researcher": researcher, "content_hash": content_hash,
                    "disclosure_deadline_ns": disclosure_deadline_ns }),
        );
        let excess = deposit.saturating_sub(REGISTRATION_FEE);
        if !excess.is_zero() {
            let _ = Promise::new(researcher).transfer(excess);
        }
    }

    /// The researcher names the NEAR account of the team that will fund the escrow.
    pub fn set_team_account(&mut self, report_id: String, team: AccountId) {
        let mut record = self.record(&report_id);
        self.require_researcher(&record);
        require!(team != record.researcher, "the team account must differ from the researcher");
        require!(
            matches!(
                record.status,
                ReportStatus::Registered | ReportStatus::TermsProposed | ReportStatus::TermsAccepted
            ),
            "the team can only change before funding"
        );
        record.team = Some(team.clone());
        self.save(&report_id, record);
        emit("team_set", json!({ "report_id": report_id, "team": team }));
    }

    /// The researcher invites one person to read the report and the chat. The person is named by the
    /// hash of a Privy-linked identity, and the enclave checks it against their verified sign-in.
    pub fn invite_member(&mut self, report_id: String, id_hash: String) {
        require!(valid_sha256_hex(&id_hash), "identity hash must be 64 hex characters");
        let mut record = self.record(&report_id);
        self.require_researcher(&record);
        require!(record.published_at_ns.is_none(), "report is already published");
        let id_hash = id_hash.to_lowercase();
        match record.members.iter_mut().find(|m| m.id_hash == id_hash) {
            Some(existing) => existing.revoked = false,
            None => {
                require!(record.members.len() < MAX_MEMBERS, "too many invited members");
                record.members.push(MemberInvite { id_hash: id_hash.clone(), revoked: false });
            }
        }
        self.save(&report_id, record);
        emit("member_invited", json!({ "report_id": report_id, "id_hash": id_hash }));
    }

    /// The researcher withdraws an invite. The enclave stops handing that person keys on its next read.
    pub fn revoke_member(&mut self, report_id: String, id_hash: String) {
        let mut record = self.record(&report_id);
        self.require_researcher(&record);
        let id_hash = id_hash.to_lowercase();
        let member = record.members.iter_mut().find(|m| m.id_hash == id_hash);
        require!(member.is_some(), "that person was not invited");
        member.unwrap().revoked = true;
        self.save(&report_id, record);
        emit("member_revoked", json!({ "report_id": report_id, "id_hash": id_hash }));
    }

    /// Either side logs the hash of one chat message. The text itself stays off chain.
    pub fn post_message_hash(&mut self, report_id: String, message_hash: String) {
        require!(valid_sha256_hex(&message_hash), "message hash must be 64 hex characters");
        let mut record = self.record(&report_id);
        let caller = env::predecessor_account_id();
        require!(
            caller == record.researcher || Some(&caller) == record.team.as_ref(),
            "only the researcher or the team may post"
        );
        require!(record.published_at_ns.is_none(), "report is already published");
        record.message_count += 1;
        let index = record.message_count;
        self.save(&report_id, record);
        emit(
            "message_logged",
            json!({ "report_id": report_id, "from": caller, "index": index, "message_hash": message_hash }),
        );
    }

    // ---------------------------------------------------------------- terms and funding

    /// The team proposes the amount and the repository the fix must land in.
    pub fn propose_terms(&mut self, report_id: String, amount: U128, repo: String, terms_hash: String) {
        let mut record = self.record(&report_id);
        self.require_team(&record);
        require!(
            matches!(
                record.status,
                ReportStatus::Registered | ReportStatus::TermsProposed | ReportStatus::TermsAccepted
            ),
            "terms can only change before funding"
        );
        require!(amount.0 > 0, "amount must be greater than zero");
        require!(valid_repo(&repo), "repo must look like owner/name");
        require!(valid_sha256_hex(&terms_hash), "terms hash must be 64 hex characters");
        record.terms = Some(AgreedTerms { amount, repo: repo.clone(), terms_hash: terms_hash.clone(), researcher_accepted: false });
        record.status = ReportStatus::TermsProposed;
        self.save(&report_id, record);
        emit(
            "terms_proposed",
            json!({ "report_id": report_id, "amount": amount, "repo": repo, "terms_hash": terms_hash }),
        );
    }

    /// The researcher accepts exactly the terms that are currently proposed.
    pub fn accept_terms(&mut self, report_id: String, terms_hash: String) {
        let mut record = self.record(&report_id);
        self.require_researcher(&record);
        require!(record.status == ReportStatus::TermsProposed, "there are no open terms to accept");
        let terms = record.terms.as_mut().expect("terms present");
        require!(terms.terms_hash == terms_hash, "terms changed, review them again");
        terms.researcher_accepted = true;
        record.status = ReportStatus::TermsAccepted;
        self.save(&report_id, record);
        emit("terms_accepted", json!({ "report_id": report_id, "terms_hash": terms_hash }));
    }

    /// The team locks the agreed amount. The deposit must equal it exactly.
    #[payable]
    pub fn fund_escrow(&mut self, report_id: String) {
        let mut record = self.record(&report_id);
        self.require_team(&record);
        require!(record.status == ReportStatus::TermsAccepted, "terms must be accepted before funding");
        let terms = record.terms.as_ref().expect("terms present");
        require!(env::attached_deposit().as_yoctonear() == terms.amount.0, "attach exactly the agreed amount");
        let now = env::block_timestamp();
        let expires = now + self.config.escrow_ttl_ns;
        record.escrow = Some(EscrowDetails {
            amount: terms.amount,
            funded_at_ns: now,
            expires_at_ns: expires,
            pull_request: None,
            merge_confirmed_at_ns: None,
            check_started_at_ns: None,
        });
        record.status = ReportStatus::Funded;
        let amount = terms.amount;
        self.save(&report_id, record);
        emit("escrow_funded", json!({ "report_id": report_id, "amount": amount, "expires_at_ns": expires }));
    }

    // ---------------------------------------------------------------- merge checks

    /// The researcher points the escrow at the fix pull request in the agreed repository.
    pub fn link_pull_request(&mut self, report_id: String, pull_request: u64) {
        let mut record = self.record(&report_id);
        self.require_researcher(&record);
        require!(record.status == ReportStatus::Funded, "escrow must be funded and not yet confirmed");
        require!(pull_request > 0, "pull request number must be positive");
        let escrow = record.escrow.as_mut().expect("escrow present");
        require!(escrow.check_started_at_ns.is_none(), "a check is in flight");
        escrow.pull_request = Some(pull_request);
        self.save(&report_id, record);
        emit("pull_request_linked", json!({ "report_id": report_id, "pull_request": pull_request }));
    }

    /// Anyone may ask the enclave to look at the pull request. The deposit pays for the run.
    #[payable]
    pub fn request_merge_check(&mut self, report_id: String) -> Promise {
        let mut record = self.record(&report_id);
        require!(record.status == ReportStatus::Funded, "escrow must be funded and not yet confirmed");
        self.start_check(&report_id, &mut record, CheckPhase::Confirm)
    }

    /// The researcher claims the payout. The enclave looks a second time before money leaves.
    #[payable]
    pub fn claim_payout(&mut self, report_id: String) -> Promise {
        let mut record = self.record(&report_id);
        self.require_researcher(&record);
        require!(record.status == ReportStatus::MergeConfirmed, "the merge has not been confirmed yet");
        // `Paying` blocks every other path to the money until the second check answers.
        record.status = ReportStatus::Paying;
        self.start_check(&report_id, &mut record, CheckPhase::Payout)
    }

    /// After expiry the team asks for its money back. The enclave checks the merge one last time.
    #[payable]
    pub fn refund_after_expiry(&mut self, report_id: String) -> Promise {
        let mut record = self.record(&report_id);
        self.require_team(&record);
        require!(
            matches!(record.status, ReportStatus::Funded | ReportStatus::MergeConfirmed),
            "nothing to refund in this state"
        );
        let expires = record.escrow.as_ref().expect("escrow present").expires_at_ns;
        require!(env::block_timestamp() >= expires, "the escrow has not expired");
        self.start_check(&report_id, &mut record, CheckPhase::Refund)
    }

    /// Escape hatch when the enclave stays silent far past expiry.
    pub fn emergency_refund(&mut self, report_id: String) -> Promise {
        let record = self.record(&report_id);
        self.require_team(&record);
        require!(
            matches!(record.status, ReportStatus::Funded | ReportStatus::MergeConfirmed),
            "nothing to refund in this state"
        );
        let now = env::block_timestamp();
        let escrow = record.escrow.as_ref().expect("escrow present");
        require!(
            now >= escrow.expires_at_ns + self.config.liveness_grace_ns,
            "the liveness grace period has not passed"
        );
        require!(
            escrow.check_started_at_ns.map_or(true, |t| now >= t + STALE_CHECK_NS),
            "a check is still in flight"
        );
        self.refund_now(&report_id, record)
    }

    /// Private: receives the enclave's answer to a merge check.
    #[private]
    pub fn on_merge_check(
        &mut self,
        report_id: String,
        phase: CheckPhase,
        #[callback_result] result: Result<Option<String>, PromiseError>,
    ) -> Option<Promise> {
        let mut record = self.record(&report_id);
        let verdict = verdict_for(&record, result);
        if let Some(escrow) = record.escrow.as_mut() {
            escrow.check_started_at_ns = None;
        }
        emit(
            "merge_checked",
            json!({ "report_id": report_id, "phase": phase, "verdict": format!("{verdict:?}") }),
        );
        let now = env::block_timestamp();

        match (phase, verdict) {
            (CheckPhase::Confirm, Verdict::Merged) => {
                if record.status == ReportStatus::Funded {
                    record.status = ReportStatus::MergeConfirmed;
                    record.escrow.as_mut().expect("escrow present").merge_confirmed_at_ns = Some(now);
                    emit("merge_confirmed", json!({ "report_id": report_id }));
                }
                self.save(&report_id, record);
                None
            }
            (CheckPhase::Payout, Verdict::Merged) => {
                require!(record.status == ReportStatus::Paying, "no payout in flight");
                let amount = record.escrow.as_ref().expect("escrow present").amount.0;
                let researcher = record.researcher.clone();
                self.save(&report_id, record);
                Some(self.transfer_then_settle(report_id, researcher, amount, TransferKind::Payout))
            }
            (CheckPhase::Payout, Verdict::NotMerged) => {
                // The merge was not visible the second time, so nothing is paid.
                record.status = ReportStatus::Funded;
                record.escrow.as_mut().expect("escrow present").merge_confirmed_at_ns = None;
                self.save(&report_id, record);
                None
            }
            (CheckPhase::Payout, Verdict::Unknown) => {
                // No answer: keep the confirmation so the researcher can try again.
                record.status = ReportStatus::MergeConfirmed;
                self.save(&report_id, record);
                None
            }
            (CheckPhase::Refund, Verdict::NotMerged) => {
                if matches!(record.status, ReportStatus::Funded | ReportStatus::MergeConfirmed) {
                    Some(self.refund_now(&report_id, record))
                } else {
                    self.save(&report_id, record);
                    None
                }
            }
            (CheckPhase::Refund, Verdict::Merged) => {
                // The fix landed after all: the researcher gets paid instead.
                if record.status == ReportStatus::Funded {
                    record.status = ReportStatus::MergeConfirmed;
                    record.escrow.as_mut().expect("escrow present").merge_confirmed_at_ns = Some(now);
                }
                self.save(&report_id, record);
                None
            }
            (_, Verdict::NotMerged) | (_, Verdict::Unknown) => {
                self.save(&report_id, record);
                None
            }
        }
    }

    /// Private: settles a payout or refund transfer, undoing the state change if it failed.
    #[private]
    pub fn on_transfer_settled(&mut self, report_id: String, kind: TransferKind) {
        let failed = !matches!(env::promise_result_checked(0, 64), Ok(_));
        let mut record = self.record(&report_id);
        if failed {
            record.status = match kind {
                TransferKind::Payout => ReportStatus::MergeConfirmed,
                TransferKind::Refund => ReportStatus::Funded,
            };
            emit("transfer_failed", json!({ "report_id": report_id, "kind": kind }));
        } else {
            record.status = match kind {
                TransferKind::Payout => ReportStatus::Paid,
                TransferKind::Refund => ReportStatus::Refunded,
            };
            emit("transfer_settled", json!({ "report_id": report_id, "kind": kind }));
        }
        self.save(&report_id, record);
    }

    // ---------------------------------------------------------------- disclosure

    /// After the disclosure date the researcher records that the report was unsealed publicly.
    pub fn publish_report(&mut self, report_id: String, evidence_hash: String) {
        let mut record = self.record(&report_id);
        self.require_researcher(&record);
        require!(valid_sha256_hex(&evidence_hash), "evidence hash must be 64 hex characters");
        require!(env::block_timestamp() >= record.disclosure_deadline_ns, "the disclosure date has not arrived");
        require!(record.published_at_ns.is_none(), "already published");
        require!(record.status != ReportStatus::Paying, "a payout is in flight");
        record.published_at_ns = Some(env::block_timestamp());
        record.evidence_hash = Some(evidence_hash.clone());
        self.save(&report_id, record);
        emit("report_published", json!({ "report_id": report_id, "evidence_hash": evidence_hash }));
    }

    // ---------------------------------------------------------------- admin and views

    /// Owner only. Never touches escrowed funds.
    pub fn update_enclave_source(&mut self, url: String, hash: Option<String>, min_outlayer_deposit: U128) {
        require!(env::predecessor_account_id() == self.config.owner, "only the owner");
        self.config.enclave_source_url = url;
        self.config.enclave_source_hash = hash;
        self.config.min_outlayer_deposit = min_outlayer_deposit;
    }

    pub fn get_report(&self, report_id: String) -> Option<ReportRecord> {
        self.reports.get(&report_id).cloned()
    }

    pub fn get_config(&self) -> ContractConfig {
        self.config.clone()
    }
}

// -------------------------------------------------------------------- private helpers

impl EscrowContract {
    fn record(&self, report_id: &str) -> ReportRecord {
        self.reports.get(report_id).cloned().unwrap_or_else(|| env::panic_str("unknown report"))
    }

    fn save(&mut self, report_id: &str, record: ReportRecord) {
        self.reports.insert(report_id.to_string(), record);
    }

    fn require_researcher(&self, record: &ReportRecord) {
        require!(env::predecessor_account_id() == record.researcher, "only the researcher");
    }

    fn require_team(&self, record: &ReportRecord) {
        require!(
            Some(&env::predecessor_account_id()) == record.team.as_ref(),
            "only the team account set by the researcher"
        );
    }

    /// Marks a check as in flight, saves the record and sends the request to OutLayer.
    fn start_check(&mut self, report_id: &str, record: &mut ReportRecord, phase: CheckPhase) -> Promise {
        let now = env::block_timestamp();
        let terms = record.terms.clone().expect("terms present");
        let escrow = record.escrow.as_mut().expect("escrow present");
        let pull_request = escrow.pull_request.unwrap_or_else(|| env::panic_str("link a pull request first"));
        require!(
            escrow.check_started_at_ns.map_or(true, |t| now >= t + STALE_CHECK_NS),
            "a check is already in flight"
        );
        let deposit = env::attached_deposit();
        require!(
            deposit.as_yoctonear() >= self.config.min_outlayer_deposit.0,
            "attach the OutLayer execution fee"
        );
        escrow.check_started_at_ns = Some(now);
        self.save(report_id, record.clone());

        ext_outlayer::ext(self.config.outlayer_contract.clone())
            .with_attached_deposit(deposit)
            .with_unused_gas_weight(1)
            .request_execution(
                outlayer_interface::code_source(&self.config),
                outlayer_interface::resource_limits(),
                outlayer_interface::merge_check_input(report_id, &terms.repo, pull_request, phase),
                None,
                "String".to_string(),
                Some(env::predecessor_account_id()),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(CHECK_CALLBACK_GAS)
                    .on_merge_check(report_id.to_string(), phase),
            )
    }

    fn refund_now(&mut self, report_id: &str, mut record: ReportRecord) -> Promise {
        let team = record.team.clone().expect("team present");
        let amount = record.escrow.as_ref().expect("escrow present").amount.0;
        record.status = ReportStatus::Refunded;
        self.save(report_id, record);
        self.transfer_then_settle(report_id.to_string(), team, amount, TransferKind::Refund)
    }

    /// State is already updated. If the transfer fails the settle callback restores it.
    fn transfer_then_settle(&self, report_id: String, to: AccountId, amount: u128, kind: TransferKind) -> Promise {
        emit("transfer_started", json!({ "report_id": report_id, "to": to, "amount": U128(amount), "kind": kind }));
        Promise::new(to)
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(SETTLE_CALLBACK_GAS)
                    .on_transfer_settled(report_id, kind),
            )
    }
}

/// Reads the enclave answer. Everything unexpected counts as `Unknown`, never as `Merged`.
fn verdict_for(record: &ReportRecord, result: Result<Option<String>, PromiseError>) -> Verdict {
    let Ok(Some(raw)) = result else { return Verdict::Unknown };
    let Some(answer) = parse_answer(&raw) else { return Verdict::Unknown };
    let (Some(terms), Some(escrow)) = (record.terms.as_ref(), record.escrow.as_ref()) else { return Verdict::Unknown };
    if !answer.repo.eq_ignore_ascii_case(&terms.repo) || Some(answer.pull_request) != escrow.pull_request {
        return Verdict::Unknown;
    }
    match answer.status.as_str() {
        "merged" if answer.merge_commit.as_deref().map_or(false, |c| !c.is_empty()) => Verdict::Merged,
        "not_merged" => Verdict::NotMerged,
        _ => Verdict::Unknown,
    }
}

/// Accepts the bare answer or the worker's `{"success":true,"result":{...}}` envelope.
fn parse_answer(raw: &str) -> Option<MergeCheckAnswer> {
    if let Ok(answer) = near_sdk::serde_json::from_str::<MergeCheckAnswer>(raw) {
        return Some(answer);
    }
    near_sdk::serde_json::from_str::<AnswerEnvelope>(raw).ok().filter(|e| e.success).map(|e| e.result)
}

fn valid_report_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn valid_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

fn valid_repo(repo: &str) -> bool {
    let mut parts = repo.split('/');
    let (Some(owner), Some(name), None) = (parts.next(), parts.next(), parts.next()) else { return false };
    let ok = |s: &str| !s.is_empty() && s.len() <= 100 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.');
    ok(owner) && ok(name)
}

#[cfg(test)]
mod escrow_unit_tests;
