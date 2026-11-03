# Redline enclave

Rust worker for OutLayer (`wasm32-wasip2`, runs in an Intel TDX enclave). JSON in on stdin, JSON out on stdout.

| Action | Who | What |
| --- | --- | --- |
| `pubkey` | anyone | ECIES public key browsers seal report keys to |
| `merge_check` | anyone (the escrow contract calls it) | Fail-closed PR check, answers `merged`, `not_merged` or `unknown` |
| `reveal_report` | researcher or team | AES key re-sealed to a one-time browser key |
| `chat_key` | researcher or team | Negotiation key for the report, re-sealed |
| `publish_key` | anyone, after the researcher published on chain | Key in the clear so the report can be verified |
| `verify_identity` | signed-in user | Proves the Privy user holds an email, X, Telegram, GitHub or NEAR identity |

The enclave never trusts the caller about who is a party. It reads the escrow contract over NEAR RPC and checks the caller's Privy token (ES256 against the app's JWKS) or NEP-413 wallet proof itself.

## Modules
`action_router`, `enclave_key`, `enclave_report_sealing`, `github_merge_checker`, `near_chain_reader`, `nep413_wallet_login`, `privy_identity_check`, `sealed_negotiation`, `http_client`.

## Configuration
- `PROTECTED_REDLINE_MASTER`: 32+ byte hex secret, generated inside the OutLayer keystore. Never set by hand.
- `REDLINE_GITHUB_TOKEN`: optional, raises GitHub rate limits and allows private repositories.
- `REDLINE_NEAR_RPC`, `REDLINE_ESCROW_CONTRACT`: runtime overrides. `REDLINE_ESCROW_CONTRACT`, `REDLINE_PRIVY_APP_ID` and `REDLINE_APP_ORIGIN` can also be set at build time.

## Develop
```
cargo test
cargo build --release --target wasm32-wasip2
echo '{"action":"merge_check","repo":"octocat/Hello-World","pull_request":6}' | wasmtime run -S http target/wasm32-wasip2/release/redline-enclave.wasm
```
