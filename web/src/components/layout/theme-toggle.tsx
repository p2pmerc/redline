import { Moon, Sun } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useTheme } from "@/lib/use-theme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <Tooltip content={`Switch to ${next} mode`}>
      <Button variant="ghost" size="icon" onClick={toggle} aria-label={`Switch to ${next} mode`}>
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </Button>
    </Tooltip>
  );
}
