import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CaretDown, Coins, GithubLogo, GitMerge, LockKey, UserCheck, Vault, type Icon } from "@phosphor-icons/react";
import { stagePipeline } from "@/lib/report-stages";
import type { ReportStage } from "@/lib/redline-types";
import "./landing.css";

export const REDLINE_GITHUB_URL = "https://github.com/p2pmerc/redline";

/** The lifecycle shown in the hero, a subset of the seven-step pipeline. */
const flow: { id: ReportStage; icon: Icon }[] = [
  { id: "sealed", icon: LockKey },
  { id: "invited", icon: UserCheck },
  { id: "funded", icon: Vault },
  { id: "fix_merged", icon: GitMerge },
  { id: "paid", icon: Coins },
];

const stepInfo = (id: ReportStage) => stagePipeline.find((s) => s.id === id)!;

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Steps light up one after another, hold on the last, then start over. Static when motion is reduced. */
function useFlowSequence(length: number) {
  const [active, setActive] = useState(() => (prefersReducedMotion() ? length - 1 : 0));
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = setTimeout(
      () => setActive((a) => (a >= length - 1 ? 0 : a + 1)),
      active >= length - 1 ? 3200 : 1500,
    );
    return () => clearTimeout(timer);
  }, [active, length]);
  return active;
}

function FlowCard() {
  const active = useFlowSequence(flow.length);
  const current = flow[active];
  const currentInfo = stepInfo(current.id);
  return (
    <div className="relative mx-auto w-full max-w-md pb-14 lg:ml-auto lg:mr-0">
      <div
        className="lp-flow-card rounded-[2rem] bg-[#16130e] p-6 text-[#F8F5EC] shadow-[0_30px_60px_-24px_rgb(31_26_20/0.7)] sm:p-8"
        role="group"
        aria-label="A report's lifecycle: sealed, invited, funded, fix merged, paid"
      >
        <div className="flex items-center justify-between text-caption text-[#F8F5EC]/60">
          <span className="font-medium uppercase tracking-[0.14em]">Report lifecycle</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-[#F8F5EC]/80">NEAR testnet</span>
        </div>
        <ol className="mt-7">
          {flow.map((step, i) => {
            const info = stepInfo(step.id);
            const lit = i <= active;
            const last = i === flow.length - 1;
            return (
              <li key={step.id} className={`relative flex gap-4 ${last ? "" : "pb-7"}`}>
                {!last && (
                  <span aria-hidden className="absolute bottom-0 left-[19px] top-10 w-0.5 overflow-hidden rounded-full bg-white/10">
                    <span className="lp-rail-fill block h-full w-full bg-redline" style={{ transform: `scaleY(${i < active ? 1 : 0})` }} />
                  </span>
                )}
                <span
                  data-on={lit}
                  className={`lp-node relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border ${
                    lit ? "border-redline bg-redline text-[#1F1A14] shadow-[0_0_24px_-2px_rgb(242_92_5/0.6)]" : "border-white/15 bg-[#16130e] text-white/40"
                  }`}
                >
                  <step.icon size={18} weight={lit ? "fill" : "regular"} />
                </span>
                <div data-on={lit} className="lp-step-text min-w-0 pt-0.5">
                  <p className="text-title font-semibold leading-5">{info.label}</p>
                  <p className="mt-0.5 text-caption text-[#F8F5EC]/60">{info.summary}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div
        aria-hidden
        className="lp-status absolute -bottom-0 left-2 w-64 rounded-2xl bg-white p-4 text-[#1F1A14] shadow-[0_24px_40px_-16px_rgb(31_26_20/0.55)] sm:-left-6"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-subtitle font-semibold">
            <span className={`size-2 rounded-full ${current.id === "paid" ? "bg-success" : "bg-redline"}`} />
            {currentInfo.label}
          </span>
          <span className="text-[11px] text-[#7B7367]">Example report</span>
        </div>
        <p className="mt-1.5 text-caption text-[#5f574b]">{currentInfo.summary}</p>
        {current.id === "sealed" && (
          <p className="mt-2 rounded-lg bg-[#F4F0E4] px-2 py-1 font-mono text-[11px] text-[#5f574b]">hash 4a7f·0be3·c912…</p>
        )}
      </div>
    </div>
  );
}

function scrollToHow() {
  const el = document.getElementById("how-it-works");
  if (el) el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

const line = (i: number): CSSProperties => ({ ["--i" as string]: i });
const delay = (ms: number): CSSProperties => ({ ["--d" as string]: `${ms}ms` });

export function HeroSection() {
  return (
    <section className="px-3 pt-20 sm:px-4 sm:pt-24" aria-label="Introduction">
      <div className="relative overflow-hidden rounded-[2rem] bg-redline text-[#1F1A14] sm:rounded-[2.75rem]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_70%_at_8%_0%,rgb(255_255_255/0.28),transparent),radial-gradient(50%_60%_at_100%_100%,rgb(120_30_0/0.28),transparent)]"
        />
        <div className="relative grid items-center gap-12 px-6 pb-28 pt-12 sm:px-10 sm:pt-16 lg:grid-cols-[1.2fr_0.8fr] lg:gap-8 lg:px-14 lg:pb-32 lg:pt-20">
          <div>
            <span className="lp-rise inline-flex items-center gap-2 rounded-full bg-[#1F1A14]/10 px-3.5 py-1.5 text-subtitle font-medium" style={delay(0)}>
              <span aria-hidden className="lp-live-dot size-2 rounded-full bg-[#1F1A14]" />
              Live on NEAR testnet
            </span>
            <h1 className="mt-6 text-[clamp(2.75rem,10.5vw,4.5rem)] font-semibold leading-[0.94] tracking-[-0.055em] sm:text-[clamp(3.25rem,9vw,5.5rem)] lg:text-[clamp(3.25rem,6.2vw,6.5rem)]">
              <span className="lp-line"><span style={line(0)}>Disclose</span></span>
              <span className="lp-line"><span style={line(1)}>in private.</span></span>
              <span className="lp-line"><span style={line(2)}>Get paid when</span></span>
              <span className="lp-line"><span style={line(3)}>the fix merges.</span></span>
            </h1>
            <p className="lp-rise mt-7 max-w-xl text-pretty text-[1.05rem] leading-7 text-[#1F1A14]/80" style={delay(420)}>
              Redline seals your vulnerability report so only the verified team can read it, locks the bounty in a NEAR escrow, and releases it when the pull request merges.
            </p>
            <div className="lp-rise mt-8 flex flex-col gap-3 sm:flex-row sm:items-center" style={delay(520)}>
              <Link
                to="/app/reports/new"
                className="lp-cta group inline-flex items-center justify-between gap-3 rounded-full bg-[#1F1A14] py-2 pl-6 pr-2 text-[0.95rem] font-medium text-[#F8F5EC] hover:bg-black sm:justify-start"
              >
                Start a sealed report
                <span className="flex size-9 items-center justify-center rounded-full bg-redline text-[#1F1A14]">
                  <ArrowRight size={16} weight="bold" className="lp-cta-arrow" />
                </span>
              </Link>
              <a
                href={REDLINE_GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="lp-cta inline-flex items-center justify-center gap-2 rounded-full border-2 border-[#1F1A14]/80 px-6 py-[0.6rem] text-[0.95rem] font-medium hover:bg-[#1F1A14]/10"
              >
                <GithubLogo size={18} weight="fill" aria-hidden />
                View on GitHub
              </a>
            </div>
          </div>
          <FlowCard />
        </div>

        <a
          href="#how-it-works"
          onClick={(e) => { e.preventDefault(); scrollToHow(); }}
          className="lp-notch absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-t-3xl px-7 pb-3.5 pt-3.5 text-subtitle font-medium text-foreground"
        >
          See how it works
          <CaretDown size={14} weight="bold" className="lp-notch-arrow" aria-hidden />
        </a>
      </div>
    </section>
  );
}
