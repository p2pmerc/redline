import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Files, FilePlus, Megaphone, SignOut, List, X, UserCircle, Flask, type Icon } from "@phosphor-icons/react";
import { RedlineWordmark } from "@/components/redline-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const nav: { to: string; label: string; icon: Icon; end?: boolean }[] = [
  { to: "/app", label: "Reports", icon: Files, end: true },
  { to: "/app/reports/new", label: "New report", icon: FilePlus },
  { to: "/disclosures", label: "Public disclosures", icon: Megaphone },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="App" className="space-y-0.5">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-subtitle transition-colors",
              isActive ? "bg-active font-medium text-foreground" : "text-muted-foreground hover:bg-hover hover:text-foreground",
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon size={18} weight={isActive ? "fill" : "regular"} />
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function UserBlock() {
  const { displayName, demo, signOut } = useSession();
  const [pending, setPending] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
        <UserCircle size={28} weight="duotone" className="shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <p className="w-full truncate text-subtitle font-medium leading-tight">{displayName}</p>
          {demo && <Badge color="amber"><Flask size={11} /> Sample data</Badge>}
        </div>
      </div>
      <Button variant="ghost" className="w-full justify-start" leadingIcon={SignOut} loading={pending}
        onClick={async () => { setPending(true); await signOut(); setPending(false); }}>
        Sign out
      </Button>
    </div>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col justify-between border-r border-border/60 bg-surface-1 p-4 lg:flex">
        <div className="space-y-8">
          <Link to="/" aria-label="Redline home" className="block px-2 pt-1"><RedlineWordmark /></Link>
          <NavItems />
        </div>
        <UserBlock />
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl lg:pl-64">
        <Link to="/" className="lg:hidden" aria-label="Redline home"><RedlineWordmark /></Link>
        <span className="hidden text-subtitle text-muted-foreground lg:block">NEAR testnet</span>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <X size={18} /> : <List size={18} />}
          </Button>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-x-0 top-14 z-30 space-y-4 border-b border-border/60 bg-background p-4 shadow-surface-4 lg:hidden"
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
          >
            <NavItems onNavigate={() => setOpen(false)} />
            <UserBlock />
          </motion.div>
        )}
      </AnimatePresence>

      <main className="px-4 py-8 sm:px-6 lg:pl-64">
        <div className="mx-auto max-w-5xl lg:px-6">
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", duration: 0.4, bounce: 0 }}>
            <Outlet />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
