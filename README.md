# Redline

Sealed vulnerability disclosure and PR-merge bounties on NEAR testnet, with private compute on OutLayer (Intel TDX).

A researcher writes a report that is encrypted in their browser. Only the researcher, and team members the researcher invites and the enclave verifies, can ever decrypt it or read its negotiation chat. Both sides negotiate privately and agree a reward. The team funds a NEAR escrow, and the contract pays the researcher when the linked fix pull request is merged on GitHub, as checked inside the enclave. If the team never responds, the researcher can publish after a disclosure date with an on-chain evidence hash.

Status: testnet only. The web app and API run today in **preview mode**. The contract and enclave are built and tested locally and are not deployed (see below).

## Layout

| Folder | What it is |
| --- | --- |
| `web/` | React app: landing page, dashboard, Tiptap report editor with `.md` and PDF export, sealed chat, escrow, invites |
| `contracts/escrow-contract/` | NEAR contract (Rust): report registry, invites by identity hash, escrow, OutLayer callbacks |
| `enclave/` | OutLayer WASI program (Rust): sealing, identity check, access control, GitHub merge check |
| `server/` | Node API: ciphertext store, read model, preview ledger |

## Access control

- Reports and chat messages are AES-256-GCM ciphertext. The server stores ciphertext only.
- The report key is sealed to the enclave public key. Only the enclave can unseal it.
- The enclave releases the key to exactly two kinds of caller: the researcher (the verified identity equal to the on-chain owner), and a member whose Privy-verified identity hash is on the contract's invite list and not revoked.
- Invites are stored on chain as `sha256("redline:invite:v1:<kind>:<handle>")`. No emails or handles are on chain.
- A revoked invite is denied. Uninvited users, the server, the operator and the public are denied until the researcher publishes.
- Tests: `enclave/src/report_access_control.rs` and the router tests (uninvited denied, revoked denied), `server/src/api-routes.test.ts` (outsiders get 404, revoke closes access at once).

## Preview mode

Without a deployed contract and enclave (`LEDGER_MODE=preview`, empty `VITE_ENCLAVE_PUBLIC_KEY`):

- The server plays the chain: it runs the same escrow state machine, and no funds move. Ledger references are marked `preview:`.
- The report key stays in the researcher's browser and in invite link fragments (`#k=`), never on the server. An invite link is therefore a bearer link. The enclave's identity binding applies once the enclave is deployed.
- GitHub merge status is read from the public API by the server.

## Run locally

```sh
cp .env.example .env            # optional, defaults work
cd server && npm ci && npm run dev    # API on :8791
cd web && npm ci && npm run dev       # app on :5173, proxies /api
```

Sign-in uses Privy (app id in `.env.example`; add your origin to the Privy allowed origins). Without Privy a read-only demo session shows sample data.

## Tests

```sh
cd server && npm test                                   # API, access, persistence
cd web && npm test                                      # encryption round trip, key vault, avatars
cd contracts/escrow-contract && cargo test              # escrow state machine and invites
cd enclave && cargo test                                # sealing, identity, access control, merge check
```

Build the contract wasm: `cargo near build non-reproducible-wasm --no-abi`. Build the enclave: `cargo build --release --target wasm32-wasip2`.

## Deploy (web and API)

The `Dockerfile` builds both and serves them from one Node process on `$PORT`. Set `DATA_DIR` to a mounted volume so reports survive restarts. Never commit `.env`.

## Not deployed yet

The contract and enclave need a dedicated testnet account and an OutLayer project. Until that exists they are not deployed, and the app stays in preview mode.

## Avatars

Profile pictures come from [RoboHash](https://robohash.org) (`set1`), seeded by a hash of the account id and never by an email or name.
