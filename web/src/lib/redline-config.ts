/** Public, non-secret configuration for the web app. */
export const redlineConfig = {
  /** Hex secp256k1 public key of the deployed OutLayer enclave (public by design). */
  enclavePublicKey: (import.meta.env.VITE_ENCLAVE_PUBLIC_KEY as string | undefined) ?? "04d810a6542b6d4cff3fd8ad01310dd0e2f8d897a14459f35d6b17506b2c7cb5ae58dfe2ee72ab790efb3863d241f6b6dd9c7e33bb6f284628e41233de4a6a6d78",
  /** Privy application id. Public by design. */
  privyAppId: import.meta.env.VITE_PRIVY_APP_ID ?? "cmw091k5e006v0glbrx3ouzry",
  nearNetwork: "testnet" as const,
  escrowContractId: import.meta.env.VITE_ESCROW_CONTRACT_ID ?? "redline-escrow.testnet",
  explorerBase: "https://testnet.nearblocks.io",
  apiBase: import.meta.env.VITE_API_BASE ?? "/api",
};

export const explorerTxUrl = (hash: string) => `${redlineConfig.explorerBase}/txns/${hash}`;
