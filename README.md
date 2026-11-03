# Redline

Sealed vulnerability disclosure and PR-merge bounties on NEAR testnet, with private compute on OutLayer (Intel TDX).

Researchers write a report that is encrypted in their browser. Named team members get the key only after an enclave verifies their identity. Both sides negotiate privately and sign a reward. The team funds a NEAR escrow, and the contract pays the researcher when the linked fix pull request is merged on GitHub, as checked inside the enclave. If the team never responds, the researcher can publish after a disclosure date, with an attestable delivery log.

Status: work in progress, testnet only.

## Layout

| Folder | What it is |
| --- | --- |
| `web/` | React app: landing page, dashboard, report editor |
| `contracts/escrow-contract/` | NEAR smart contract: registry, escrow, OutLayer callbacks |
| `enclave/` | OutLayer WASI program (Rust): sealing, identity check, GitHub merge check |
| `server/` | Node API: ciphertext store, read model, OutLayer relay |
