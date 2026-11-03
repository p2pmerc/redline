import { useNavigate } from "react-router-dom";
import { ArrowRight, GithubLogo } from "@phosphor-icons/react";
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
          Open the app with sample data in one click, or sign in to start a real sealed report on testnet.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button size="lg" variant="secondary" trailingIcon={ArrowRight} onClick={() => navigate("/app")}>Open Redline</Button>
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
          <a className="hover:text-foreground" href="#how-it-works">How it works</a>
          <a className="hover:text-foreground" href="#security">Security</a>
          <a className="inline-flex items-center gap-1 hover:text-foreground" href="https://github.com/zer0plugyut-afk/redline" target="_blank" rel="noreferrer">
            <GithubLogo size={14} /> Source
          </a>
        </nav>
      </div>
    </footer>
  );
}
