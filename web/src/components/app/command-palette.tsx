import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Files, FilePlus, Megaphone, GearSix, UserCircle, LockKey } from "@phosphor-icons/react";
import { CommandMenu, CommandMenuDialog, CommandMenuEmpty, CommandMenuInput, CommandMenuList, type CommandMenuItemData } from "@/components/ui/command-menu";
import { stageLabels } from "@/lib/report-stages";
import type { Report } from "@/lib/redline-types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reports: Report[];
  handle?: string;
}

/** Jump to a page or one of your own reports. Opens with Cmd/Ctrl+K. */
export function CommandPalette({ open, onOpenChange, reports, handle }: Props) {
  const navigate = useNavigate();
  const items = useMemo<CommandMenuItemData[]>(() => {
    const go = (to: string) => () => navigate(to);
    const pages: CommandMenuItemData[] = [
      { value: "page-reports", label: "Reports", icon: Files, group: "Go to", onSelect: go("/app") },
      { value: "page-new", label: "New report", icon: FilePlus, group: "Go to", onSelect: go("/app/reports/new") },
      { value: "page-disclosures", label: "Public disclosures", icon: Megaphone, group: "Go to", onSelect: go("/disclosures") },
      { value: "page-settings", label: "Settings", icon: GearSix, group: "Go to", onSelect: go("/app/settings") },
      ...(handle ? [{ value: "page-profile", label: "My public profile", icon: UserCircle, group: "Go to", onSelect: go(`/researchers/${handle}`) }] : []),
    ];
    const mine: CommandMenuItemData[] = reports.map((r) => ({
      value: `report-${r.id}`, label: r.title, description: stageLabels[r.stage], icon: LockKey, group: "Your reports",
      keywords: [r.id, r.repo ?? r.target], onSelect: go(`/app/reports/${r.id}`),
    }));
    return [...pages, ...mine];
  }, [navigate, reports, handle]);

  return (
    <CommandMenuDialog open={open} onOpenChange={onOpenChange} title="Search" description="Jump to a page or one of your reports.">
      <CommandMenu items={items}>
        <CommandMenuInput placeholder="Search pages and reports…" />
        <CommandMenuList>
          <CommandMenuEmpty>No matches.</CommandMenuEmpty>
        </CommandMenuList>
      </CommandMenu>
    </CommandMenuDialog>
  );
}
