import { LockKey, UserCheck, Handshake, GitMerge } from "@phosphor-icons/react";
import { Reveal } from "./reveal";
import "./landing.css";

const steps = [
  {
    icon: LockKey,
    title: "Seal the report",
    body: "Write in a rich editor with code blocks. The report is encrypted in your browser with a fresh key, and only a hash goes on chain.",
  },
  {
    icon: UserCheck,
    title: "Invite the right people",
    body: "Send an invite to an email, X handle, Telegram or GitHub account. An enclave checks who signs in and releases the key only to a match.",
  },
  {
    icon: Handshake,
    title: "Agree on a reward",
    body: "Negotiate in a sealed chat. Every message is hash-logged, and both sides sign the final amount with their NEAR wallets.",
  },
  {
    icon: GitMerge,
    title: "Paid on merge",
    body: "The team funds the escrow. When the linked pull request merges, the enclave confirms it on GitHub and the contract pays you.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="scroll-mt-4 px-3 pb-3 pt-3 sm:px-4 sm:pt-4">
      <div className="mx-auto rounded-[2rem] bg-surface-3 px-5 py-16 shadow-surface-2 sm:rounded-[2.75rem] sm:px-10 sm:py-24 lg:px-14">
        <Reveal className="mx-auto max-w-5xl text-center">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-4 text-balance text-[clamp(2.25rem,6.4vw,5rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
            Four steps from finding a bug to getting paid
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-title text-muted-foreground">
            No middleman holds the report, the key or the money.
          </p>
        </Reveal>
        <ol className="mx-auto mt-14 grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title}>
              <Reveal delay={i * 0.07} className="h-full">
                <article className="lp-num-card flex h-full flex-col rounded-3xl bg-background p-6 shadow-surface-1 hover:shadow-surface-5 sm:p-7">
                  <div className="flex items-start justify-between">
                    <span className="lp-num text-[3.5rem] font-semibold leading-none tracking-[-0.06em] text-foreground/90" aria-hidden>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex size-10 items-center justify-center rounded-full bg-redline/12 text-redline">
                      <step.icon size={20} />
                    </span>
                  </div>
                  <h3 className="mt-10 text-[1.35rem] font-semibold leading-tight tracking-tight">{step.title}</h3>
                  <p className="mt-2.5 text-body text-muted-foreground">{step.body}</p>
                </article>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
