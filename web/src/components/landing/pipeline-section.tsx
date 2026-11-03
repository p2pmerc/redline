import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { stagePipeline } from "@/lib/report-stages";
import { StageStepper, stageIcons } from "@/components/report/stage-stepper";
import type { ReportStage } from "@/lib/redline-types";
import { Reveal, SectionHeading } from "./reveal";

const stageDetail: Record<string, { who: string; chain: string; body: string }> = {
  sealed: { who: "Researcher", chain: "register_report", body: "The browser encrypts the report, seals the key to the enclave and registers the content hash on the contract." },
  invited: { who: "Enclave", chain: "redeem_invite", body: "The invited person signs in with Privy. The enclave matches the verified account to the invite and releases the report key to them." },
  negotiating: { who: "Both sides", chain: "post_message", body: "Messages are encrypted for the two parties. Only their hashes are logged on chain, so the thread cannot be rewritten later." },
  agreed: { who: "Both sides", chain: "record_agreement", body: "Both parties sign the reward terms with NEP-413 wallet signatures. The enclave verifies them before the contract accepts the agreement." },
  funded: { who: "Team", chain: "fund_escrow", body: "The team attaches the agreed NEAR to the contract. The funds cannot move except through a verified merge or an expiry refund." },
  fix_merged: { who: "Enclave", chain: "check_merge", body: "The enclave asks GitHub whether the linked pull request merged into the default branch of the named repository, and checks it a second time before paying." },
  paid: { who: "Contract", chain: "claim_payout", body: "On a confirmed merge the contract transfers the escrow to the researcher. If the check cannot be completed, nothing moves." },
};

export function PipelineSection() {
  const [selected, setSelected] = useState<ReportStage>("sealed");
  const detail = stageDetail[selected];
  const Icon = stageIcons[selected];
  return (
    <section id="pipeline" className="scroll-mt-20 bg-surface-2 px-4 py-20 sm:px-6">
      <SectionHeading eyebrow="Status pipeline" title="Every report follows the same seven steps" description="Select a step to see who acts and what is recorded on chain." />
      <Reveal className="mx-auto mt-12 max-w-6xl">
        <StageStepper current="funded" selected={selected} onSelect={setSelected} />
        <div className="mt-6 min-h-[132px] rounded-2xl bg-surface-4 p-6 shadow-surface-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selected}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col gap-4 sm:flex-row sm:items-start"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-fluid-accent/15 text-fluid-accent">
                <Icon size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-title font-semibold">{stagePipeline.find((s) => s.id === selected)?.label}</h3>
                  <span className="text-caption text-muted-foreground">Acts: {detail.who}</span>
                  <code className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[11px]">{detail.chain}</code>
                </div>
                <p className="mt-2 max-w-2xl text-body text-muted-foreground">{detail.body}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        <p className="mt-4 text-center text-caption text-muted-foreground">
          Two exits exist: the researcher can <strong className="font-medium text-foreground">publish</strong> after the disclosure date, and an unmerged escrow <strong className="font-medium text-foreground">refunds</strong> to the team at expiry.
        </p>
      </Reveal>
    </section>
  );
}
