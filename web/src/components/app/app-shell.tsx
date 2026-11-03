import { AccountChip } from "@/components/ui/account-chip";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Files, FilePlus, Megaphone, SignOut, List, X, GearSix, MagnifyingGlass, type Icon } from "@phosphor-icons/react";
import { RedlineWordmark } from "@/components/redline-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { useProfile } from "@/lib/profile-context";
import { useSession } from "@/lib/auth-context";
import { CommandPalette } from "@/components/app/command-palette";
import { useIsMac } from "@/components/ui/command-menu";
import { listReports } from "@/lib/data-source";
import { useAsync } from "@/lib/use-async";
import { cn } from "@/lib/utils";

type NavEntry = { to: string; label: string; icon: Icon; end?: boolean };
const navGroups: { label: string; items: NavEntry[] }[] = [
  { label: "Workspace", items: [
    { to: "/app", label: "Reports", icon: Files, end: true },
    { to: "/app/reports/new", label: "New report", icon: FilePlus },
  ] },
  { label: "Public", items: [{ to: "/disclosures", label: "Public disclosures", icon: Megaphone }] },
  { label: "Account", items: [{ to: "/app/settings", label: "Settings", icon: GearSix }] },
];

function SearchField({ onOpen }: { onOpen: () => void }) {
  const mac = useIsMac();
  return (
    <button type="button" onClick={onOpen} aria-label="Search" aria-keyshortcuts="Meta+K Control+K"
      className="search-field flex w-full items-center gap-2 px-3 py-2 text-left text-subtitle text-muted-foreground transition-shadow hover:text-foreground">
      <MagnifyingGlass size={16} />
      <span className="flex-1 truncate">Search anything…</span>
      <kbd className="kbd-chip font-sans">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}

function NavItems({ onNavigate, openCount }: { onNavigate?: () => void; openCount?: number }) {
  return (
    <nav aria-label="App" className="space-y-5">
      {navGroups.map((group, gi) => (
        <div key={group.label} className={cn("space-y-1", gi > 0 && "border-t border-border pt-4")}>
          <p className="section-label px-3 pb-1">{group.label}</p>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-full px-3 py-2 text-subtitle transition-colors",
                  isActive ? "nav-active font-medium" : "text-muted-foreground hover:bg-hover hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={18} weight={isActive ? "fill" : "regular"} />
                  <span className="flex-1">{item.label}</span>
                  {item.to === "/app" && !!openCount && <span className="count-badge" aria-label={`${openCount} open`}>{openCount > 9 ? "9+" : openCount}</span>}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function UserBlock() {
  const { displayName, signOut, account } = useSession();
  const { profile } = useProfile();
  const [pending, setPending] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
        <ProfileAvatar size="lg" name={profile?.displayName ?? displayName} seed={profile?.avatarSeed} />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <p className="w-full truncate text-subtitle font-medium leading-tight">{profile?.displayName ?? displayName}</p>
          {profile && <Link to={`/researchers/${profile.handle}`} className="w-full truncate text-caption text-muted-foreground hover:text-foreground">@{profile.handle}</Link>}
          {account && <AccountChip account={account} className="w-full" />}
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
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const { profile } = useProfile();
  const { data: reports } = useAsync(listReports, []);
  const openCount = (reports ?? []).filter((r) => !["paid", "published", "refunded"].includes(r.stage)).length;
  return (
    <div className="page-glow min-h-dvh bg-background">
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} reports={reports ?? []} handle={profile?.handle} />
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col justify-between border-r border-border sidebar-texture p-4 lg:flex">
        <div className="space-y-5">
          <Link to="/" aria-label="Redline home" className="block px-2 pt-1 pb-1"><RedlineWordmark /></Link>
          <SearchField onOpen={() => setSearchOpen(true)} />
          <NavItems openCount={openCount} />
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
            <SearchField onOpen={() => { setOpen(false); setSearchOpen(true); }} />
            <NavItems onNavigate={() => setOpen(false)} openCount={openCount} />
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
