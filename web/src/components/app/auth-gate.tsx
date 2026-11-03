import { useState } from "react";
import { Outlet } from "react-router-dom";
import { SignIn, ShieldCheck, Spinner, Wallet } from "@phosphor-icons/react";
import { RedlineMark } from "@/components/redline-logo";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-context";

export function AuthGate() {
  const { ready, signedIn, signIn, connectWallet } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
        <Spinner size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (signedIn) return <Outlet />;

  async function wallet() {
    setBusy(true); setError(null);
    try { await connectWallet(); } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      // Closing the wallet picker is not an error worth showing.
      if (!/closed|cancel|reject|declin/i.test(msg)) setError(msg || "Could not connect the wallet. Try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-surface-3 p-8 text-center shadow-surface-4">
        <RedlineMark className="mx-auto size-10" />
        <h1 className="mt-5 text-[1.5rem] font-semibold tracking-tight">Sign in to Redline</h1>
        <p className="mt-2 text-body text-muted-foreground">
          Use email, X or GitHub, or connect a NEAR wallet. Either way you get a NEAR account that receives your payouts.
        </p>
        <div className="mt-6 space-y-2">
          <Button className="w-full" leadingIcon={SignIn} onClick={signIn}>Continue with email or social</Button>
          <Button className="w-full" variant="secondary" leadingIcon={Wallet} loading={busy} onClick={() => void wallet()}>Connect HOT wallet</Button>
        </div>
        {error && <p role="alert" className="mt-3 text-caption text-destructive">{error}</p>}
        <p className="mt-5 flex items-center justify-center gap-1.5 text-caption text-muted-foreground">
          <ShieldCheck size={14} /> Testnet only. No real funds.
        </p>
      </div>
    </div>
  );
}
