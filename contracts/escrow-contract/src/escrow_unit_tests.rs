//! Unit tests for the escrow state machine. The enclave is simulated by feeding answers
//! into the private callback exactly as OutLayer would.

use super::*;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, test_utils::get_logs, PromiseResult};

fn testing_env_with_promise_results(context: near_sdk::VMContext, result: PromiseResult) {
    testing_env!(context, near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), vec![result]);
}

const REPORT: &str = "rl-7f3a91";
const HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TERMS: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const AMOUNT: u128 = 5_000_000_000_000_000_000_000_000; // 5 NEAR
const START: u64 = 1_700_000_000_000_000_000;

fn contract_account() -> AccountId { accounts(0) }
fn researcher() -> AccountId { accounts(1) }
fn team() -> AccountId { accounts(2) }
fn stranger() -> AccountId { accounts(3) }
fn wallet() -> AccountId { "wallet.testnet".parse().unwrap() }

fn ctx(predecessor: AccountId, deposit: u128, at: u64) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(contract_account())
        .predecessor_account_id(predecessor)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_timestamp(at)
        .prepaid_gas(Gas::from_tgas(300))
        .build());
}

fn fee() -> u128 { NearToken::from_millinear(10).as_yoctonear() }

fn new_contract() -> EscrowContract {
    ctx(contract_account(), 0, START);
    EscrowContract::new(accounts(4), accounts(5), "https://github.com/example/redline-enclave".into(), None, 30, 14)
}

fn registered() -> EscrowContract {
    let mut c = new_contract();
    ctx(researcher(), fee(), START);
    c.register_report(REPORT.into(), HASH.into(), START + 60 * DAY_NS, None);
    ctx(researcher(), 0, START);
    c.set_team_account(REPORT.into(), team());
    c.set_payout_account(REPORT.into(), wallet());
    c.set_researcher_github(REPORT.into(), "p2pmerc".into());
    c
}

fn funded() -> EscrowContract {
    let mut c = new_contract();
    ctx(researcher(), fee(), START);
    c.register_report(REPORT.into(), HASH.into(), START + 60 * DAY_NS, None);
    ctx(researcher(), 0, START);
    c.set_team_account(REPORT.into(), team());
    c.set_payout_account(REPORT.into(), wallet());
    ctx(team(), 0, START);
    c.propose_terms(REPORT.into(), U128(AMOUNT), "acme/widgets".into(), TERMS.into());
    ctx(researcher(), 0, START);
    c.accept_terms(REPORT.into(), TERMS.into());
    ctx(team(), AMOUNT, START);
    c.fund_escrow(REPORT.into());
    ctx(team(), 0, START);
    c.link_pull_request(REPORT.into(), 42);
    ctx(researcher(), 0, START);
    c.confirm_pull_request(REPORT.into(), "p2pmerc".into());
    c
}

fn status(c: &EscrowContract) -> ReportStatus { c.get_report(REPORT.into()).unwrap().status }

/// Runs `on_merge_check` as the contract itself with the given enclave output.
fn answer(c: &mut EscrowContract, phase: CheckPhase, output: Option<String>, at: u64) {
    let bytes = match &output {
        Some(text) => near_sdk::serde_json::to_vec(&Some(text.clone())).unwrap(),
        None => near_sdk::serde_json::to_vec(&None::<String>).unwrap(),
    };
    let context = VMContextBuilder::new()
        .current_account_id(contract_account())
        .predecessor_account_id(contract_account())
        .block_timestamp(at)
        .prepaid_gas(Gas::from_tgas(300))
        .build();
    testing_env_with_promise_results(context, PromiseResult::Successful(bytes));
    let _ = c.on_merge_check(REPORT.into(), phase, Ok(output));
}

fn settle(c: &mut EscrowContract, kind: TransferKind, ok: bool, at: u64) {
    let context = VMContextBuilder::new()
        .current_account_id(contract_account())
        .predecessor_account_id(contract_account())
        .block_timestamp(at)
        .build();
    let result = if ok { PromiseResult::Successful(vec![]) } else { PromiseResult::Failed };
    testing_env_with_promise_results(context, result);
    c.on_transfer_settled(REPORT.into(), kind);
}

fn merged_answer() -> String {
    r#"{"status":"merged","repo":"acme/widgets","pull_request":42,"merge_commit":"c0ffee"}"#.into()
}
fn open_answer() -> String {
    r#"{"status":"not_merged","repo":"acme/widgets","pull_request":42}"#.into()
}

// ------------------------------------------------------------------ registration

#[test]
fn registers_a_report_and_logs_an_event() {
    let c = registered();
    let record = c.get_report(REPORT.into()).unwrap();
    assert_eq!(record.status, ReportStatus::Registered);
    assert_eq!(record.researcher, researcher());
    assert_eq!(record.team, Some(team()));
    assert!(get_logs().iter().any(|l| l.contains("team_set")));
}

#[test]
#[should_panic(expected = "report id already registered")]
fn rejects_duplicate_report_ids() {
    let mut c = registered();
    ctx(researcher(), fee(), START);
    c.register_report(REPORT.into(), HASH.into(), START + 60 * DAY_NS, None);
}

#[test]
#[should_panic(expected = "attach at least 0.01 NEAR")]
fn registration_requires_the_storage_fee() {
    let mut c = new_contract();
    ctx(researcher(), 0, START);
    c.register_report(REPORT.into(), HASH.into(), START + 60 * DAY_NS, None);
}

#[test]
#[should_panic(expected = "between 7 and 365 days")]
fn rejects_a_disclosure_deadline_that_is_too_soon() {
    let mut c = new_contract();
    ctx(researcher(), fee(), START);
    c.register_report(REPORT.into(), HASH.into(), START + DAY_NS, None);
}

#[test]
#[should_panic(expected = "64 hex")]
fn rejects_a_malformed_content_hash() {
    let mut c = new_contract();
    ctx(researcher(), fee(), START);
    c.register_report(REPORT.into(), "xyz".into(), START + 60 * DAY_NS, None);
}

#[test]
#[should_panic(expected = "only the researcher or the team")]
fn strangers_cannot_post_messages() {
    let mut c = registered();
    ctx(stranger(), 0, START);
    c.post_message_hash(REPORT.into(), HASH.into());
}

#[test]
fn both_sides_can_log_message_hashes() {
    let mut c = registered();
    ctx(researcher(), 0, START);
    c.post_message_hash(REPORT.into(), HASH.into());
    ctx(team(), 0, START);
    c.post_message_hash(REPORT.into(), TERMS.into());
    assert_eq!(c.get_report(REPORT.into()).unwrap().message_count, 2);
}

// ------------------------------------------------------------------ terms and funding

#[test]
#[should_panic(expected = "only the team account")]
fn only_the_team_can_propose_terms() {
    let mut c = registered();
    ctx(stranger(), 0, START);
    c.propose_terms(REPORT.into(), U128(AMOUNT), "acme/widgets".into(), TERMS.into());
}

#[test]
#[should_panic(expected = "repo must look like owner/name")]
fn rejects_a_bad_repository() {
    let mut c = registered();
    ctx(team(), 0, START);
    c.propose_terms(REPORT.into(), U128(AMOUNT), "not a repo".into(), TERMS.into());
}

#[test]
#[should_panic(expected = "terms changed")]
fn researcher_must_accept_the_exact_terms() {
    let mut c = registered();
    ctx(team(), 0, START);
    c.propose_terms(REPORT.into(), U128(AMOUNT), "acme/widgets".into(), TERMS.into());
    ctx(researcher(), 0, START);
    c.accept_terms(REPORT.into(), HASH.into());
}

#[test]
#[should_panic(expected = "terms must be accepted")]
fn cannot_fund_before_the_researcher_accepts() {
    let mut c = registered();
    ctx(team(), 0, START);
    c.propose_terms(REPORT.into(), U128(AMOUNT), "acme/widgets".into(), TERMS.into());
    ctx(team(), AMOUNT, START);
    c.fund_escrow(REPORT.into());
}

#[test]
#[should_panic(expected = "attach exactly the agreed amount")]
fn funding_must_match_the_agreed_amount() {
    let mut c = registered();
    ctx(team(), 0, START);
    c.propose_terms(REPORT.into(), U128(AMOUNT), "acme/widgets".into(), TERMS.into());
    ctx(researcher(), 0, START);
    c.accept_terms(REPORT.into(), TERMS.into());
    ctx(team(), AMOUNT - 1, START);
    c.fund_escrow(REPORT.into());
}

#[test]
fn changed_terms_reset_the_researcher_acceptance() {
    let mut c = registered();
    ctx(team(), 0, START);
    c.propose_terms(REPORT.into(), U128(AMOUNT), "acme/widgets".into(), TERMS.into());
    ctx(researcher(), 0, START);
    c.accept_terms(REPORT.into(), TERMS.into());
    ctx(team(), 0, START);
    c.propose_terms(REPORT.into(), U128(AMOUNT * 2), "acme/widgets".into(), HASH.into());
    let record = c.get_report(REPORT.into()).unwrap();
    assert_eq!(record.status, ReportStatus::TermsProposed);
    assert!(!record.terms.unwrap().researcher_accepted);
}

#[test]
fn funding_locks_the_agreed_amount() {
    let c = funded();
    let record = c.get_report(REPORT.into()).unwrap();
    assert_eq!(record.status, ReportStatus::Funded);
    let escrow = record.escrow.unwrap();
    assert_eq!(escrow.amount.0, AMOUNT);
    assert_eq!(escrow.expires_at_ns, START + 30 * DAY_NS);
    assert_eq!(escrow.pull_request, Some(42));
}

#[test]
#[should_panic(expected = "terms can only change before funding")]
fn terms_are_frozen_after_funding() {
    let mut c = funded();
    ctx(team(), 0, START);
    c.propose_terms(REPORT.into(), U128(1), "acme/widgets".into(), TERMS.into());
}

// ------------------------------------------------------------------ merge checks and payout

#[test]
#[should_panic(expected = "link a pull request first")]
fn merge_check_needs_a_linked_pull_request() {
    let mut c = registered();
    ctx(team(), 0, START);
    c.propose_terms(REPORT.into(), U128(AMOUNT), "acme/widgets".into(), TERMS.into());
    ctx(researcher(), 0, START);
    c.accept_terms(REPORT.into(), TERMS.into());
    ctx(team(), AMOUNT, START);
    c.fund_escrow(REPORT.into());
    ctx(researcher(), fee(), START);
    let _ = c.request_merge_check(REPORT.into());
}

#[test]
#[should_panic(expected = "attach the OutLayer execution fee")]
fn merge_check_needs_the_execution_fee() {
    let mut c = funded();
    ctx(researcher(), 0, START);
    let _ = c.request_merge_check(REPORT.into());
}

#[test]
#[should_panic(expected = "a check is already in flight")]
fn only_one_check_runs_at_a_time() {
    let mut c = funded();
    ctx(researcher(), fee(), START);
    let _ = c.request_merge_check(REPORT.into());
    ctx(researcher(), fee(), START + 1_000);
    let _ = c.request_merge_check(REPORT.into());
}

#[test]
fn a_stale_check_can_be_asked_again() {
    let mut c = funded();
    ctx(researcher(), fee(), START);
    let _ = c.request_merge_check(REPORT.into());
    ctx(researcher(), fee(), START + STALE_CHECK_NS + 1);
    let _ = c.request_merge_check(REPORT.into());
}

#[test]
fn a_merged_answer_confirms_the_merge_once() {
    let mut c = funded();
    ctx(researcher(), fee(), START);
    let _ = c.request_merge_check(REPORT.into());
    answer(&mut c, CheckPhase::Confirm, Some(merged_answer()), START + 100);
    assert_eq!(status(&c), ReportStatus::MergeConfirmed);
    assert!(c.get_report(REPORT.into()).unwrap().escrow.unwrap().check_started_at_ns.is_none());
}

#[test]
fn not_merged_leaves_the_escrow_funded() {
    let mut c = funded();
    answer(&mut c, CheckPhase::Confirm, Some(open_answer()), START + 100);
    assert_eq!(status(&c), ReportStatus::Funded);
}

#[test]
fn a_failed_enclave_call_counts_as_unknown_and_changes_nothing() {
    let mut c = funded();
    let context = VMContextBuilder::new()
        .current_account_id(contract_account())
        .predecessor_account_id(contract_account())
        .block_timestamp(START + 100)
        .build();
    testing_env_with_promise_results(context, PromiseResult::Failed);
    let _ = c.on_merge_check(REPORT.into(), CheckPhase::Confirm, Err(PromiseError::Failed));
    assert_eq!(status(&c), ReportStatus::Funded);
}

#[test]
fn answers_for_another_pull_request_are_ignored() {
    let mut c = funded();
    let other_pr = r#"{"status":"merged","repo":"acme/widgets","pull_request":7,"merge_commit":"c0ffee"}"#.to_string();
    answer(&mut c, CheckPhase::Confirm, Some(other_pr), START + 100);
    assert_eq!(status(&c), ReportStatus::Funded);
}

#[test]
fn answers_for_another_repository_are_ignored() {
    let mut c = funded();
    let other_repo = r#"{"status":"merged","repo":"evil/widgets","pull_request":42,"merge_commit":"c0ffee"}"#.to_string();
    answer(&mut c, CheckPhase::Confirm, Some(other_repo), START + 100);
    assert_eq!(status(&c), ReportStatus::Funded);
}

#[test]
fn a_merged_answer_without_a_commit_is_not_trusted() {
    let mut c = funded();
    let no_commit = r#"{"status":"merged","repo":"acme/widgets","pull_request":42}"#.to_string();
    answer(&mut c, CheckPhase::Confirm, Some(no_commit), START + 100);
    assert_eq!(status(&c), ReportStatus::Funded);
}

#[test]
fn the_worker_envelope_is_accepted() {
    let mut c = funded();
    let wrapped = format!(r#"{{"success":true,"result":{}}}"#, merged_answer());
    answer(&mut c, CheckPhase::Confirm, Some(wrapped), START + 100);
    assert_eq!(status(&c), ReportStatus::MergeConfirmed);
}

#[test]
fn a_failed_envelope_is_unknown() {
    let mut c = funded();
    let wrapped = format!(r#"{{"success":false,"result":{}}}"#, merged_answer());
    answer(&mut c, CheckPhase::Confirm, Some(wrapped), START + 100);
    assert_eq!(status(&c), ReportStatus::Funded);
}

#[test]
fn garbage_output_is_unknown() {
    let mut c = funded();
    answer(&mut c, CheckPhase::Confirm, Some("not json at all".into()), START + 100);
    assert_eq!(status(&c), ReportStatus::Funded);
}

#[test]
#[should_panic(expected = "the merge has not been confirmed yet")]
fn payout_cannot_be_claimed_before_the_first_confirmation() {
    let mut c = funded();
    ctx(researcher(), fee(), START);
    let _ = c.claim_payout(REPORT.into());
}

#[test]
#[should_panic(expected = "only the researcher")]
fn only_the_researcher_can_claim() {
    let mut c = funded();
    answer(&mut c, CheckPhase::Confirm, Some(merged_answer()), START + 100);
    ctx(team(), fee(), START + 200);
    let _ = c.claim_payout(REPORT.into());
}

#[test]
fn claim_moves_to_paying_then_second_check_pays_out() {
    let mut c = funded();
    answer(&mut c, CheckPhase::Confirm, Some(merged_answer()), START + 100);
    ctx(researcher(), fee(), START + 200);
    let _ = c.claim_payout(REPORT.into());
    assert_eq!(status(&c), ReportStatus::Paying);
    answer(&mut c, CheckPhase::Payout, Some(merged_answer()), START + 300);
    // transfer is queued; the state stays `Paying` until the transfer settles
    assert_eq!(status(&c), ReportStatus::Paying);
    assert!(get_logs().iter().any(|l| l.contains("transfer_started") && l.contains("Payout")));
    settle(&mut c, TransferKind::Payout, true, START + 400);
    assert_eq!(status(&c), ReportStatus::Paid);
}

#[test]
fn second_check_not_merged_pays_nothing_and_drops_the_confirmation() {
    let mut c = funded();
    answer(&mut c, CheckPhase::Confirm, Some(merged_answer()), START + 100);
    ctx(researcher(), fee(), START + 200);
    let _ = c.claim_payout(REPORT.into());
    answer(&mut c, CheckPhase::Payout, Some(open_answer()), START + 300);
    assert_eq!(status(&c), ReportStatus::Funded);
    assert!(c.get_report(REPORT.into()).unwrap().escrow.unwrap().merge_confirmed_at_ns.is_none());
}

#[test]
fn second_check_unknown_lets_the_researcher_retry() {
    let mut c = funded();
    answer(&mut c, CheckPhase::Confirm, Some(merged_answer()), START + 100);
    ctx(researcher(), fee(), START + 200);
    let _ = c.claim_payout(REPORT.into());
    answer(&mut c, CheckPhase::Payout, Some("???".into()), START + 300);
    assert_eq!(status(&c), ReportStatus::MergeConfirmed);
}

#[test]
#[should_panic(expected = "escrow must be funded and not yet confirmed")]
fn cannot_claim_twice_while_paying() {
    let mut c = funded();
    answer(&mut c, CheckPhase::Confirm, Some(merged_answer()), START + 100);
    ctx(researcher(), fee(), START + 200);
    let _ = c.claim_payout(REPORT.into());
    ctx(researcher(), fee(), START + 300);
    let _ = c.request_merge_check(REPORT.into());
}

#[test]
fn a_failed_payout_transfer_restores_the_confirmed_state() {
    let mut c = funded();
    answer(&mut c, CheckPhase::Confirm, Some(merged_answer()), START + 100);
    ctx(researcher(), fee(), START + 200);
    let _ = c.claim_payout(REPORT.into());
    answer(&mut c, CheckPhase::Payout, Some(merged_answer()), START + 300);
    settle(&mut c, TransferKind::Payout, false, START + 400);
    assert_eq!(status(&c), ReportStatus::MergeConfirmed);
}

// ------------------------------------------------------------------ refunds

#[test]
#[should_panic(expected = "the escrow has not expired")]
fn no_refund_before_expiry() {
    let mut c = funded();
    ctx(team(), fee(), START + 29 * DAY_NS);
    let _ = c.refund_after_expiry(REPORT.into());
}

#[test]
#[should_panic(expected = "only the team account")]
fn only_the_team_can_ask_for_a_refund() {
    let mut c = funded();
    ctx(researcher(), fee(), START + 31 * DAY_NS);
    let _ = c.refund_after_expiry(REPORT.into());
}

#[test]
fn refund_after_expiry_returns_money_when_the_pull_request_is_still_open() {
    let mut c = funded();
    ctx(team(), fee(), START + 31 * DAY_NS);
    let _ = c.refund_after_expiry(REPORT.into());
    answer(&mut c, CheckPhase::Refund, Some(open_answer()), START + 31 * DAY_NS + 100);
    assert_eq!(status(&c), ReportStatus::Refunded);
    assert!(get_logs().iter().any(|l| l.contains("transfer_started") && l.contains("Refund")));
}

#[test]
fn refund_turns_into_a_confirmation_if_the_fix_actually_merged() {
    let mut c = funded();
    ctx(team(), fee(), START + 31 * DAY_NS);
    let _ = c.refund_after_expiry(REPORT.into());
    answer(&mut c, CheckPhase::Refund, Some(merged_answer()), START + 31 * DAY_NS + 100);
    assert_eq!(status(&c), ReportStatus::MergeConfirmed);
}

#[test]
fn refund_with_a_silent_enclave_changes_nothing() {
    let mut c = funded();
    ctx(team(), fee(), START + 31 * DAY_NS);
    let _ = c.refund_after_expiry(REPORT.into());
    answer(&mut c, CheckPhase::Refund, Some("???".into()), START + 31 * DAY_NS + 100);
    assert_eq!(status(&c), ReportStatus::Funded);
}

#[test]
#[should_panic(expected = "liveness grace period has not passed")]
fn emergency_refund_waits_for_the_grace_period() {
    let mut c = funded();
    ctx(team(), 0, START + 31 * DAY_NS);
    let _ = c.emergency_refund(REPORT.into());
}

#[test]
fn emergency_refund_works_after_expiry_plus_grace() {
    let mut c = funded();
    ctx(team(), 0, START + 45 * DAY_NS);
    let _ = c.emergency_refund(REPORT.into());
    assert_eq!(status(&c), ReportStatus::Refunded);
}

#[test]
#[should_panic(expected = "nothing to refund in this state")]
fn emergency_refund_is_blocked_while_a_payout_is_in_flight() {
    let mut c = funded();
    answer(&mut c, CheckPhase::Confirm, Some(merged_answer()), START + 100);
    ctx(researcher(), fee(), START + 200);
    let _ = c.claim_payout(REPORT.into());
    ctx(team(), 0, START + 50 * DAY_NS);
    let _ = c.emergency_refund(REPORT.into());
}

#[test]
#[should_panic(expected = "nothing to refund in this state")]
fn cannot_refund_twice() {
    let mut c = funded();
    ctx(team(), 0, START + 45 * DAY_NS);
    let _ = c.emergency_refund(REPORT.into());
    ctx(team(), 0, START + 46 * DAY_NS);
    let _ = c.emergency_refund(REPORT.into());
}

// ------------------------------------------------------------------ disclosure

#[test]
#[should_panic(expected = "the disclosure date has not arrived")]
fn cannot_publish_before_the_deadline() {
    let mut c = registered();
    ctx(researcher(), 0, START + 10 * DAY_NS);
    c.publish_report(REPORT.into(), HASH.into());
}

#[test]
fn researcher_can_publish_after_the_deadline() {
    let mut c = registered();
    ctx(researcher(), 0, START + 61 * DAY_NS);
    c.publish_report(REPORT.into(), HASH.into());
    let record = c.get_report(REPORT.into()).unwrap();
    assert!(record.published_at_ns.is_some());
    assert_eq!(record.evidence_hash.as_deref(), Some(HASH));
}

#[test]
#[should_panic(expected = "only the researcher")]
fn only_the_researcher_can_publish() {
    let mut c = registered();
    ctx(team(), 0, START + 61 * DAY_NS);
    c.publish_report(REPORT.into(), HASH.into());
}

#[test]
#[should_panic(expected = "only the owner")]
fn only_the_owner_can_update_the_enclave_source() {
    let mut c = new_contract();
    ctx(stranger(), 0, START);
    c.update_enclave_project("someone.testnet/other-enclave".into(), None, U128(1));
}

// ------------------------------------------------------------------ invited readers

fn member_hash(n: u8) -> String { format!("{:02x}", n).repeat(32) }

#[test]
fn the_researcher_invites_and_revokes_readers() {
    let mut c = registered();
    ctx(researcher(), 0, START);
    c.invite_member(REPORT.into(), member_hash(1));
    c.invite_member(REPORT.into(), member_hash(1));
    c.invite_member(REPORT.into(), member_hash(2));
    let record = c.get_report(REPORT.into()).unwrap();
    assert_eq!(record.members.len(), 2, "inviting twice does not duplicate");
    c.revoke_member(REPORT.into(), member_hash(1));
    let record = c.get_report(REPORT.into()).unwrap();
    assert!(record.members[0].revoked && !record.members[1].revoked);
    c.invite_member(REPORT.into(), member_hash(1));
    assert!(!c.get_report(REPORT.into()).unwrap().members[0].revoked, "a re-invite lifts the revocation");
}

#[test]
#[should_panic(expected = "only the researcher")]
fn the_team_cannot_invite_readers() {
    let mut c = registered();
    ctx(team(), 0, START);
    c.invite_member(REPORT.into(), member_hash(1));
}

#[test]
#[should_panic(expected = "only the researcher")]
fn strangers_cannot_revoke_readers() {
    let mut c = registered();
    ctx(researcher(), 0, START);
    c.invite_member(REPORT.into(), member_hash(1));
    ctx(stranger(), 0, START);
    c.revoke_member(REPORT.into(), member_hash(1));
}

#[test]
#[should_panic(expected = "64 hex")]
fn invites_need_a_proper_identity_hash() {
    let mut c = registered();
    ctx(researcher(), 0, START);
    c.invite_member(REPORT.into(), "bob@example.com".into());
}

#[test]
#[should_panic(expected = "was not invited")]
fn revoking_someone_never_invited_fails() {
    let mut c = registered();
    ctx(researcher(), 0, START);
    c.revoke_member(REPORT.into(), member_hash(9));
}

#[test]
#[should_panic(expected = "too many")]
fn the_invite_list_is_bounded() {
    let mut c = registered();
    ctx(researcher(), 0, START);
    for n in 0..21u8 { c.invite_member(REPORT.into(), member_hash(n)); }
}


// ------------------------------------------------------------------ payout account

#[test]
#[should_panic(expected = "set a payout account before funding")]
fn funding_is_blocked_until_a_payout_account_is_set() {
    let mut c = new_contract();
    ctx(researcher(), fee(), START);
    c.register_report(REPORT.into(), HASH.into(), START + 60 * DAY_NS, None);
    ctx(researcher(), 0, START);
    c.set_team_account(REPORT.into(), team());
    ctx(team(), 0, START);
    c.propose_terms(REPORT.into(), U128(AMOUNT), "acme/widgets".into(), TERMS.into());
    ctx(researcher(), 0, START);
    c.accept_terms(REPORT.into(), TERMS.into());
    ctx(team(), AMOUNT, START);
    c.fund_escrow(REPORT.into());
}

#[test]
fn payout_account_can_be_bound_at_registration() {
    let mut c = new_contract();
    ctx(researcher(), fee(), START);
    c.register_report(REPORT.into(), HASH.into(), START + 60 * DAY_NS, Some(wallet()));
    assert_eq!(c.get_payout_account(REPORT.into()), Some(wallet()));
}

#[test]
fn payout_goes_to_the_bound_account_not_the_researcher_account() {
    let mut c = funded();
    answer(&mut c, CheckPhase::Confirm, Some(merged_answer()), START + 100);
    ctx(researcher(), fee(), START + 200);
    let _ = c.claim_payout(REPORT.into());
    answer(&mut c, CheckPhase::Payout, Some(merged_answer()), START + 300);
    let logs = get_logs();
    let started = logs.iter().find(|l| l.contains("transfer_started") && l.contains("Payout")).expect("transfer started");
    assert!(started.contains("wallet.testnet"), "{started}");
    assert!(!started.contains(&researcher().to_string()), "{started}");
}

#[test]
#[should_panic(expected = "can only change before funding")]
fn payout_account_is_locked_once_funded() {
    let mut c = funded();
    ctx(researcher(), 0, START + 1);
    c.set_payout_account(REPORT.into(), stranger());
}

#[test]
#[should_panic(expected = "only the researcher")]
fn only_the_researcher_sets_the_payout_account() {
    let mut c = registered();
    ctx(team(), 0, START + 1);
    c.set_payout_account(REPORT.into(), stranger());
}

#[test]
fn unmigrated_reports_fall_back_to_the_researcher_account() {
    let mut c = new_contract();
    ctx(researcher(), fee(), START);
    c.register_report(REPORT.into(), HASH.into(), START + 60 * DAY_NS, None);
    assert_eq!(c.get_payout_account(REPORT.into()), Some(researcher()));
}

// ------------------------------------------------------------------ editing

#[test]
fn the_researcher_can_register_a_new_content_hash_and_it_is_logged() {
    let mut c = registered();
    ctx(researcher(), 0, START + 1);
    let new_hash = "cd".repeat(32);
    c.update_content_hash(REPORT.into(), new_hash.clone());
    assert_eq!(c.get_report(REPORT.into()).unwrap().content_hash, new_hash);
    assert!(get_logs().iter().any(|l| l.contains("report_edited")));
}

#[test]
#[should_panic(expected = "only the researcher")]
fn nobody_else_can_edit() {
    let mut c = registered();
    ctx(team(), 0, START + 1);
    c.update_content_hash(REPORT.into(), "cd".repeat(32));
}

#[test]
#[should_panic(expected = "64 hex")]
fn an_edit_needs_a_real_hash() {
    let mut c = registered();
    ctx(researcher(), 0, START + 1);
    c.update_content_hash(REPORT.into(), "nope".into());
}


// ------------------------------------------------------------------ author bound for the enclave

#[test]
fn github_login_is_normalised_and_stored() {
    let mut c = registered();
    ctx(researcher(), 0, START);
    c.set_researcher_github(REPORT.into(), "@P2PMerc".into());
    assert_eq!(c.get_researcher_github(REPORT.into()), Some("p2pmerc".into()));
}

#[test]
#[should_panic(expected = "not a valid GitHub login")]
fn invalid_github_login_is_rejected() {
    let mut c = registered();
    ctx(researcher(), 0, START);
    c.set_researcher_github(REPORT.into(), "bad login!".into());
}

#[test]
#[should_panic(expected = "only the researcher")]
fn only_the_researcher_binds_the_github_login() {
    let mut c = registered();
    ctx(team(), 0, START);
    c.set_researcher_github(REPORT.into(), "someone".into());
}

#[test]
fn funding_no_longer_requires_a_github_author_binding() {
    let mut c = new_contract();
    ctx(researcher(), fee(), START);
    c.register_report(REPORT.into(), HASH.into(), START + 60 * DAY_NS, Some(wallet()));
    ctx(researcher(), 0, START);
    c.set_team_account(REPORT.into(), team());
    ctx(team(), 0, START);
    c.propose_terms(REPORT.into(), U128(AMOUNT), "acme/widgets".into(), TERMS.into());
    ctx(researcher(), 0, START);
    c.accept_terms(REPORT.into(), TERMS.into());
    ctx(team(), AMOUNT, START);
    c.fund_escrow(REPORT.into());
    assert_eq!(status(&c), ReportStatus::Funded);
}

#[test]
#[should_panic(expected = "confirm the pull request first")]
fn merge_check_needs_a_confirmed_pull_request() {
    let mut c = new_contract();
    ctx(researcher(), fee(), START);
    c.register_report(REPORT.into(), HASH.into(), START + 60 * DAY_NS, None);
    ctx(researcher(), 0, START);
    c.set_team_account(REPORT.into(), team());
    c.set_payout_account(REPORT.into(), wallet());
    ctx(team(), 0, START);
    c.propose_terms(REPORT.into(), U128(AMOUNT), "acme/widgets".into(), TERMS.into());
    ctx(researcher(), 0, START);
    c.accept_terms(REPORT.into(), TERMS.into());
    ctx(team(), AMOUNT, START);
    c.fund_escrow(REPORT.into());
    ctx(team(), 0, START);
    c.link_pull_request(REPORT.into(), 42);
    ctx(researcher(), fee(), START);
    let _ = c.request_merge_check(REPORT.into());
}

#[test]
#[should_panic(expected = "only the team")]
fn only_the_team_submits_the_pull_request() {
    let mut c = new_contract();
    ctx(researcher(), fee(), START);
    c.register_report(REPORT.into(), HASH.into(), START + 60 * DAY_NS, None);
    ctx(researcher(), 0, START);
    c.set_team_account(REPORT.into(), team());
    c.set_payout_account(REPORT.into(), wallet());
    ctx(team(), 0, START);
    c.propose_terms(REPORT.into(), U128(AMOUNT), "acme/widgets".into(), TERMS.into());
    ctx(researcher(), 0, START);
    c.accept_terms(REPORT.into(), TERMS.into());
    ctx(team(), AMOUNT, START);
    c.fund_escrow(REPORT.into());
    ctx(researcher(), 0, START);
    c.link_pull_request(REPORT.into(), 42);
}

#[test]
#[should_panic(expected = "the pull request is locked after confirmation")]
fn confirmed_pull_request_cannot_be_replaced() {
    let mut c = funded();
    ctx(team(), 0, START);
    c.link_pull_request(REPORT.into(), 99);
}

#[test]
fn the_enclave_request_carries_the_expected_author() {
    let input = crate::outlayer_interface::merge_check_input(REPORT, "acme/widgets", 42, CheckPhase::Confirm, Some("p2pmerc"));
    assert!(input.contains("\"expected_author\":\"p2pmerc\""));
}
