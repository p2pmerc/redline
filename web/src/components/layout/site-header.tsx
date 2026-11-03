import { Link, useNavigate } from "react-router-dom";
import { List, X } from "@phosphor-icons/react";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { RedlineWordmark } from "@/components/redline-logo";
import { ThemeToggle } from "./theme-toggle";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#pipeline", label: "Pipeline" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
];

/** Public pages that exist on every route, unlike the landing-page anchors above. */
const pages = [
  { to: "/disclosures", label: "Disclosures" },
  { to: "/leaderboard", label: "Leaderboard" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" aria-label="Redline home" className="rounded-md">
          <RedlineWordmark />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="rounded-lg px-3 py-1.5 text-subtitle text-muted-foreground transition-colors hover:bg-hover hover:text-foreground">
              {l.label}
            </a>
          ))}
          {pages.map((l) => (
            <Link key={l.to} to={l.to} className="rounded-lg px-3 py-1.5 text-subtitle text-muted-foreground transition-colors hover:bg-hover hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button className="hidden sm:inline-flex" onClick={() => navigate("/app")}>
            Launch app
          </Button>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
            {open ? <X size={18} /> : <List size={18} />}
          </Button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/60 md:hidden"
            aria-label="Mobile"
          >
            <div className="flex flex-col p-3">
              {links.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-subtitle hover:bg-hover">
                  {l.label}
                </a>
              ))}
              {pages.map((l) => (
                <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-subtitle hover:bg-hover">
                  {l.label}
                </Link>
              ))}
              <Button className="mt-2" onClick={() => navigate("/app")}>Launch app</Button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
