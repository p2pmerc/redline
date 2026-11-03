import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { setAuthBridge } from "./api-client";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { redlineConfig } from "./redline-config";

interface RedlineSession {
  ready: boolean;
  signedIn: boolean;
  displayName: string;
  signIn: () => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<RedlineSession | null>(null);

function SessionBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();

  const signOut = useCallback(async () => {
    if (authenticated) await logout();
  }, [authenticated, logout]);

  const value = useMemo<RedlineSession>(() => {
    const email = user?.email?.address;
    const x = user?.twitter?.username;
    const gh = user?.github?.username;
    const wallet = user?.wallet?.address;
    const displayName = email ?? (x ? `@${x}` : undefined) ?? gh ?? (wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Signed in");
    return {
      ready,
      signedIn: authenticated,
      displayName,
      signIn: login,
      signOut,
    };
  }, [ready, authenticated, user, login, signOut]);

  // Data calls read the token and name through this bridge. It is set during render, not in an effect,
  // because child effects (the first data loads) run before a parent effect would.
  setAuthBridge({ getToken: async () => (authenticated ? getAccessToken() : null), displayName: value.displayName });

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={redlineConfig.privyAppId}
      config={{
        loginMethods: ["email", "google", "twitter", "github", "wallet"],
        appearance: { theme: "light", accentColor: "#6B97FF", showWalletLoginFirst: false },
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
