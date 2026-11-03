import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";
const storageKey = "redline-theme";

function initialTheme(): Theme {
  const saved = localStorage.getItem(storageKey);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("transitioning");
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    const timer = setTimeout(() => root.classList.remove("transitioning"), 200);
    localStorage.setItem(storageKey, theme);
    return () => clearTimeout(timer);
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}
