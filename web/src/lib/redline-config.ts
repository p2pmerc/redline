/** Public, non-secret configuration for the web app. */
export const redlineConfig = {
  /** Hex secp256k1 public key of the enclave. Empty until the enclave is deployed. */
  enclavePublicKey: (import.meta.env.VITE_ENCLAVE_PUBLIC_KEY as string | undefined) ?? "",
  /** Privy application id. Public by design. */
  privyAppId: import.meta.env.VITE_PRIVY_APP_ID ?? "cmw091k5e006v0glbrx3ouzry",
  nearNetwork: "testnet" as const,
  escrowContractId: import.meta.env.VITE_ESCROW_CONTRACT_ID ?? "escrow.redline.testnet",
  explorerBase: "https://testnet.nearblocks.io",
  apiBase: import.meta.env.VITE_API_BASE ?? "/api",
};

export const explorerTxUrl = (hash: string) => `${redlineConfig.explorerBase}/txns/${hash}`;
