# Redline escrow contract

NEAR contract (near-sdk 5) that holds a bounty and releases it only after an OutLayer enclave reports the fix pull request as merged.

## Trust model
- Money moves only from the contract's own private callback, never from a caller-supplied answer.
- Payout needs two enclave "merged" answers: `request_merge_check` (confirm), then `claim_payout` (payout).
- Every answer is checked against the stored repository and pull request number. A malformed, mismatched or missing answer counts as `Unknown`, never as `Merged`.
- The team can get a refund after expiry only if a third check does not see a merge, or via `emergency_refund` after expiry plus a liveness grace period.
- A failed transfer restores the previous state.

## Methods
`register_report`, `set_team_account`, `post_message_hash`, `propose_terms`, `accept_terms`, `fund_escrow`, `link_pull_request`, `request_merge_check`, `claim_payout`, `refund_after_expiry`, `emergency_refund`, `publish_report`, `update_enclave_source`, views `get_report` and `get_config`. Callbacks: `on_merge_check`, `on_transfer_settled`.

## Develop
```
cargo test
cargo near build non-reproducible-wasm --no-abi
```
Plain `cargo check` needs `--target wasm32-unknown-unknown`.

## Status
Unit tests cover registration, terms, funding, two-phase payout, fail-closed answers, refunds, failed transfers and disclosure. Not deployed. The OutLayer `request_execution` call shape (`code_source`) is unverified against a live deployment.
