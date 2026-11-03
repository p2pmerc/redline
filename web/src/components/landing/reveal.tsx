import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Fades and lifts its children into view once, when scrolled to. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ type: "spring", duration: 0.5, bounce: 0, delay }}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="text-caption font-medium uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-[clamp(1.6rem,3.2vw,2.25rem)] font-semibold leading-[1.15] tracking-tight">{title}</h2>
      {description && <p className="mt-3 text-pretty text-title text-muted-foreground">{description}</p>}
    </Reveal>
  );
}
