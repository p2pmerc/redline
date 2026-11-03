import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { setAuthBridge } from "./api-client";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { useCreateWallet } from "@privy-io/react-auth/extended-chains";
import { redlineConfig } from "./redline-config";
import { connectHotWallet, disconnectHotWallet, onWalletChange, readWalletSession } from "./near-wallet";

interface RedlineSession {
  ready: boolean;
  signedIn: boolean;
  displayName: string;
  /** The person's NEAR account: a HOT wallet account, or the NEAR wallet Privy created for a social login. */
  account: string | null;
  accountSource: "hot" | "privy" | null;
  /** Social and email sign-in (Privy). */
  signIn: () => void;
  /** Sign in with a NEAR wallet through HOT Wallet connect. Rejects with a readable message. */
  connectWallet: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<RedlineSession | null>(null);

const nearWalletOf = (user: unknown): string | null => {
  const accounts = (user as { linkedAccounts?: Array<{ type?: string; chainType?: string; address?: string }> } | null)?.linkedAccounts ?? [];
  return accounts.find((a) => a.type === "wallet" && a.chainType === "near")?.address ?? null;
};

let cachedSession = readWalletSession();
const subscribeWallet = (cb: () => void) => onWalletChange(() => { cachedSession = readWalletSession(); cb(); });
const walletSnapshot = () => cachedSession;

function SessionBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { createWallet } = useCreateWallet();
  const hot = useSyncExternalStore(subscribeWallet, walletSnapshot);
  const creating = useRef(false);
  const privyNear = nearWalletOf(user);

  // Social logins get a NEAR wallet from Privy automatically, once.
  useEffect(() => {
    if (!ready || !authenticated || !user || privyNear || creating.current) return;
    creating.current = true;
    createWallet({ chainType: "near" })
      .catch((e: unknown) => console.warn("Could not create a NEAR wallet for this login", e instanceof Error ? e.message : e))
      .finally(() => { creating.current = false; });
  }, [ready, authenticated, user, privyNear, createWallet]);

  const signOut = useCallback(async () => {
    if (hot) await disconnectHotWallet();
    if (authenticated) await logout();
  }, [hot, authenticated, logout]);

  const value = useMemo<RedlineSession>(() => {
    const email = user?.email?.address;
    const x = user?.twitter?.username;
    const gh = user?.github?.username;
    const account = hot ? hot.account : privyNear;
    const displayName = hot && !authenticated ? hot.account : email ?? (x ? `@${x}` : undefined) ?? gh ?? (account ?? "Signed in");
    return {
      ready,
      signedIn: authenticated || !!hot,
      displayName,
      account: account ?? null,
      accountSource: hot ? "hot" : privyNear ? "privy" : null,
      signIn: () => login({ loginMethods: ["email", "google", "twitter", "github"] }),
      connectWallet: async () => { await connectHotWallet(); },
      signOut,
    };
  }, [ready, authenticated, user, hot, privyNear, login, signOut]);

  // Data calls read the token and name through this bridge. It is set during render, not in an effect,
  // because child effects (the first data loads) run before a parent effect would.
  setAuthBridge({ getToken: async () => (hot ? hot.token : authenticated ? getAccessToken() : null), displayName: value.displayName });

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={redlineConfig.privyAppId}
      config={{
        loginMethods: ["email", "google", "twitter", "github"],
        appearance: { theme: "light", accentColor: "#F25C05" },
        embeddedWallets: { ethereum: { createOnLogin: "off" } },
      }}
    >
      <SessionBridge>{children}</SessionBridge>
    </PrivyProvider>
  );
}

export function useSession(): RedlineSession {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside AuthProvider");
  return ctx;
}
