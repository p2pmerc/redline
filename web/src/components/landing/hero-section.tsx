import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { BookOpenText, LockKey, ShieldCheck, GitMerge, Coins } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function SealedReportPreview() {
  const rows = [
    { icon: LockKey, label: "Sealed in your browser", value: "AES-256-GCM", tone: "text-foreground" },
    { icon: ShieldCheck, label: "Identity verified in enclave", value: "Intel TDX", tone: "text-foreground" },
    { icon: GitMerge, label: "Fix merged", value: "halcyon/vaults#418", tone: "text-success" },
    { icon: Coins, label: "Escrow released", value: "1,200 NEAR", tone: "text-success" },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.7, bounce: 0, delay: 0.25 }}
      className="relative mx-auto mt-14 w-full max-w-3xl"
    >
      <div aria-hidden className="absolute inset-x-8 -top-4 h-full rounded-3xl bg-surface-2 shadow-surface-2" />
      <div aria-hidden className="absolute inset-x-4 -top-2 h-full rounded-3xl bg-surface-3 shadow-surface-2" />
      <div className="relative rounded-3xl bg-surface-4 p-5 text-left shadow-surface-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="red">Critical</Badge>
          <Badge color="gray">rl-7f3a91</Badge>
          <span className="ml-auto text-caption text-muted-foreground">Halcyon Vaults · NEAR testnet</span>
        </div>
        <h3 className="mt-4 text-[1.35rem] font-semibold leading-tight tracking-tight">Re-entrant withdraw drains the vault pool</h3>
        <div className="mt-4 space-y-2 rounded-xl bg-surface-2 p-4 font-mono text-[12px] leading-5 text-muted-foreground shadow-surface-1">
          <p><span className="text-foreground">Ciphertext</span> 9c1e·b04a·7d22·e5f8·31ac…</p>
          <p><span className="text-foreground">On-chain hash</span> 4a7f·0be3·c912·66d1·88ee…</p>
          <p className="relative"><span className="text-foreground">Report body</span> <span className="select-none blur-[5px]">The balance is reduced after the call</span></p>
          <span aria-hidden className="block h-[3px] w-1/2 rounded-full bg-redline" />
        </div>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {rows.map((row, i) => (
            <motion.li
              key={row.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.12, type: "spring", duration: 0.45, bounce: 0 }}
              className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5 shadow-surface-1"
            >
              <row.icon size={18} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-caption text-muted-foreground">{row.label}</p>
                <p className={`truncate text-subtitle font-medium ${row.tone}`}>{row.value}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

export function HeroSection() {
  const navigate = useNavigate();
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklab,var(--fluid-accent)_14%,transparent),transparent)]" />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", duration: 0.5, bounce: 0 }}>
        <Badge color="accent" className="mx-auto">Live on NEAR testnet</Badge>
        <h1 className="mx-auto mt-5 max-w-3xl text-balance text-[clamp(2.25rem,6vw,4rem)] font-semibold leading-[1.04] tracking-[-0.03em]">
          Disclose in private.<br />
          <span className="relative inline-block">
            Get paid when the fix merges.
            <motion.span
              aria-hidden
              className="absolute -bottom-1 left-0 h-[4px] rounded-full bg-redline"
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-pretty text-[1.05rem] leading-7 text-muted-foreground">
          Redline seals your vulnerability report so only the verified team can read it, locks the bounty in a NEAR escrow, and releases it when the pull request merges. If nobody answers, you can still publish on your own deadline.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button size="lg" onClick={() => navigate("/app/reports/new")}>Start a sealed report</Button>
          <Button size="lg" variant="secondary" leadingIcon={BookOpenText} onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
            See how it works
          </Button>
        </div>
      </motion.div>
      <SealedReportPreview />
    </section>
  );
}
