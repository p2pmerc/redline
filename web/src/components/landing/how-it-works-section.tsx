import { LockKey, UserCheck, Handshake, GitMerge } from "@phosphor-icons/react";
import { Reveal, SectionHeading } from "./reveal";

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
    <section id="how-it-works" className="scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeading
        eyebrow="How it works"
        title="Four steps from finding a bug to getting paid"
        description="No middleman holds the report, the key or the money."
      />
      <div className="mx-auto mt-12 grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <Reveal key={step.title} delay={i * 0.06}>
            <article className="group relative h-full card-hairline p-6 transition-shadow duration-200 hover:shadow-surface-4">
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.06] text-foreground transition-colors group-hover:bg-fluid-accent group-hover:text-white">
                  <step.icon size={20} />
                </span>
                <span className="text-caption font-medium tabular-nums text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="mt-5 text-title font-semibold">{step.title}</h3>
              <p className="mt-2 text-body text-muted-foreground">{step.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
