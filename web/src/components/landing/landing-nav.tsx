import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, List, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { RedlineWordmark } from "@/components/redline-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/** Router links with a hash, never bare anchors: <ScrollManager /> performs the scroll. */
const sectionLinks = [
  { to: { pathname: "/", hash: "#how-it-works" }, label: "How it works" },
  { to: { pathname: "/", hash: "#pipeline" }, label: "Pipeline" },
  { to: { pathname: "/", hash: "#security" }, label: "Security" },
  { to: { pathname: "/", hash: "#faq" }, label: "FAQ" },
];
const pageLinks = [
  { to: "/disclosures", label: "Disclosures" },
  { to: "/leaderboard", label: "Leaderboard" },
];

const linkClass = "rounded-full px-3 py-1.5 text-subtitle text-muted-foreground transition-colors hover:bg-hover hover:text-foreground";

/** Floating pill navigation for the landing page. */
export function LandingNav() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <header className="pointer-events-none fixed inset-x-0 top-3 z-50 px-3 sm:top-4 sm:px-4">
      <div className="pointer-events-auto mx-auto max-w-5xl">
        <div className="flex h-14 items-center justify-between gap-2 rounded-full bg-background/85 py-2 pl-5 pr-2 shadow-surface-5 backdrop-blur-xl">
          <Link to="/" aria-label="Redline home" className="rounded-md">
            <RedlineWordmark />
          </Link>
          <nav className="hidden items-center md:flex" aria-label="Primary">
            {sectionLinks.map((l) => (
              <Link key={l.label} to={l.to} className={linkClass}>{l.label}</Link>
            ))}
            {pageLinks.map((l) => (
              <Link key={l.to} to={l.to} className={`${linkClass} hidden lg:block`}>{l.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => navigate("/app")}
              className="lp-cta group hidden items-center gap-2 rounded-full bg-foreground py-1.5 pl-4 pr-1.5 text-subtitle font-medium text-background hover:opacity-90 sm:inline-flex"
            >
              Launch app
              <span className="flex size-7 items-center justify-center rounded-full bg-redline text-white">
                <ArrowRight size={14} weight="bold" className="lp-cta-arrow" />
              </span>
            </button>
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-full text-foreground hover:bg-hover md:hidden"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              {open ? <X size={18} /> : <List size={18} />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {open && (
            <motion.nav
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="mt-2 flex flex-col rounded-3xl bg-background/95 p-3 shadow-surface-6 backdrop-blur-xl md:hidden"
              aria-label="Mobile"
            >
              {[...sectionLinks, ...pageLinks].map((l) => (
                <Link key={l.label} to={l.to} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-subtitle hover:bg-hover">
                  {l.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => navigate("/app")}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-subtitle font-medium text-background"
              >
                Launch app
                <ArrowRight size={14} weight="bold" />
              </button>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
