import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spinner } from "@phosphor-icons/react";
import { ErrorState } from "@/components/feedback/empty-state";
import { getMyProfile, saveMyProfile } from "./data-source";
import { useSession } from "./auth-context";
import type { ResearcherProfile } from "./redline-types";

interface ProfileValue {
  profile: ResearcherProfile | null;
  setProfile: (profile: ResearcherProfile) => void;
}

const ProfileContext = createContext<ProfileValue | null>(null);

export function useProfile(): ProfileValue {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("useProfile must be used inside ProfileGate");
  return value;
}

/** Routes that work without a profile: the onboarding page itself and invite links for security teams. */
const exempt = (path: string) => path === "/app/welcome" || path.startsWith("/app/invite/");

/** Loads the signed-in person's profile and sends first-time users to onboarding. */
export function ProfileGate({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const { account } = useSession();
  const [state, setState] = useState<{ loading: boolean; profile: ResearcherProfile | null; error?: Error }>({ loading: true, profile: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    getMyProfile()
      .then((profile) => live && setState({ loading: false, profile }))
      .catch((e: unknown) => live && setState({ loading: false, profile: null, error: e instanceof Error ? e : new Error(String(e)) }));
    return () => { live = false; };
  }, [nonce]);

  // A profile with no payout account yet gets the person's own NEAR account, so payouts work without any setup.
  // They can replace it in Settings.
  const autoPayout = useRef<string | null>(null);
  useEffect(() => {
    const p = state.profile;
    if (!p || p.payoutAccount || !account || autoPayout.current === account) return;
    autoPayout.current = account;
    const { joinedAt: _joinedAt, ...rest } = p as ResearcherProfile & { joinedAt?: string };
    saveMyProfile({ ...rest, payoutAccount: account } as Parameters<typeof saveMyProfile>[0])
      .then((saved) => setState({ loading: false, profile: saved }))
      .catch(() => { /* leave it empty; Settings still offers it */ });
  }, [state.profile, account]);

  const setProfile = useCallback((profile: ResearcherProfile) => setState({ loading: false, profile }), []);
  const value = useMemo(() => ({ profile: state.profile, setProfile }), [state.profile, setProfile]);

  if (state.loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading your profile">
        <Spinner size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (state.error) {
    return <div className="mx-auto max-w-md px-4 py-24"><ErrorState message={state.error.message} onRetry={() => setNonce((n) => n + 1)} /></div>;
  }
  if (!state.profile && !exempt(location.pathname)) {
    return <Navigate to="/app/welcome" replace state={{ from: location.pathname + location.search }} />;
  }
  return <ProfileContext.Provider value={value}>{children ?? <Outlet />}</ProfileContext.Provider>;
}
