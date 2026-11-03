import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RedlineWordmark } from "@/components/redline-logo";
import { Reveal } from "./reveal";

export function CtaSection() {
  const navigate = useNavigate();
  return (
    <section className="px-4 py-20 sm:px-6">
      <Reveal className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl bg-foreground px-6 py-14 text-center text-background shadow-surface-6 sm:px-12">
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-redline" />
        <h2 className="mx-auto max-w-xl text-balance text-[clamp(1.6rem,3.4vw,2.4rem)] font-semibold leading-tight tracking-tight">
          Found something? Seal it, then get paid for it.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-body opacity-70">
          Sign in to start a real sealed report on NEAR testnet.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button size="lg" onClick={() => navigate("/app")}>Open Redline</Button>
        </div>
      </Reveal>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <RedlineWordmark />
          <p className="mt-2 text-caption text-muted-foreground">Sealed disclosure and PR-merge bounties. NEAR testnet only.</p>
        </div>
        <nav className="flex items-center gap-4 text-caption text-muted-foreground" aria-label="Footer">
          <Link className="hover:text-foreground" to={{ pathname: "/", hash: "#how-it-works" }}>How it works</Link>
          <Link className="hover:text-foreground" to={{ pathname: "/", hash: "#security" }}>Security</Link>
        </nav>
      </div>
    </footer>
  );
}
