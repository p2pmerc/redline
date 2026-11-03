import { Cpu, Key, Hash, ShieldWarning, Eye, Scales } from "@phosphor-icons/react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Reveal, SectionHeading } from "./reveal";

const guarantees = [
  { icon: Key, title: "Keys never leave your browser", body: "The report key is generated locally and sealed to the enclave's public key. Redline servers only ever store ciphertext." },
  { icon: Cpu, title: "Identity checked inside a TEE", body: "A verified Privy session is matched to the invite inside an Intel TDX enclave with remote attestation, so the match cannot be faked by an operator." },
  { icon: Hash, title: "A tamper-evident record", body: "Report hash, invites, message hashes and agreements are logged on the NEAR contract. Nobody can rewrite the history after the fact." },
  { icon: ShieldWarning, title: "Fail-closed payouts", body: "If GitHub cannot be reached or the answer is unclear, the contract neither pays nor refunds early. It waits and checks again." },
];

const faqs = [
  { value: "who-reads", q: "Who can read my report?", a: "You, and the people the enclave verified from your invite. Redline operators, the contract and the storage layer only see ciphertext and hashes." },
  { value: "no-reply", q: "What if the team never responds?", a: "After the disclosure date you can publish. The contract holds an on-chain log of every invite and notice, so readers can see the team was contacted and did not respond." },
  { value: "merge-check", q: "How is a merge verified?", a: "The enclave asks GitHub for the pull request in the exact repository named in the agreement, and confirms it merged into the default branch. It checks again before releasing funds." },
  { value: "testnet", q: "Is this real money?", a: "Not yet. Redline runs on NEAR testnet only, with test tokens and no mainnet contracts." },
  { value: "ethics", q: "Is publishing after a deadline ethical?", a: "Coordinated disclosure with a deadline is a long-standing norm. Redline records good-faith attempts, but it is not legal advice, and you remain responsible for following the law and any program rules that apply to you." },
];

export function SecuritySection() {
  return (
    <>
      <section id="security" className="scroll-mt-20 px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="Security model"
          title="Trust the math, not the platform"
          description="Redline is built so that its own operators cannot read your report or move your money."
        />
        <div className="mx-auto mt-12 grid max-w-6xl gap-3 md:grid-cols-2">
          {guarantees.map((g, i) => (
            <Reveal key={g.title} delay={i * 0.05}>
              <div className="flex h-full gap-4 rounded-2xl bg-surface-3 p-6 shadow-surface-2">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.06]">
                  <g.icon size={20} />
                </span>
                <div>
                  <h3 className="text-title font-semibold">{g.title}</h3>
                  <p className="mt-1.5 text-body text-muted-foreground">{g.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mx-auto mt-3 flex max-w-6xl items-start gap-3 rounded-2xl bg-surface-2 p-5 shadow-surface-1">
          <Eye size={20} className="mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-body text-muted-foreground">
            <strong className="font-medium text-foreground">Honest limits.</strong> A report you share with a person can be copied by that person. Redline protects the path to them and the payment, not what they do after reading.
          </p>
        </Reveal>
      </section>
      <section id="faq" className="scroll-mt-20 bg-surface-2 px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="Questions" title="Things people ask first" />
        <Reveal className="mx-auto mt-10 max-w-2xl">
          <div className="flex items-center gap-2 pb-3 text-caption text-muted-foreground">
            <Scales size={14} /> Coordinated disclosure, written down
          </div>
          <Accordion type="single" collapsible defaultValue="who-reads">
            {faqs.map((f) => (
              <AccordionItem key={f.value} value={f.value}>
                <AccordionTrigger>{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </section>
    </>
  );
}
