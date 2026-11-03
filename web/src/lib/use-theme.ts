import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";
/** New key: older builds saved the OS preference automatically, which must not count as a choice. */
const storageKey = "redline-theme-choice";

/** Light unless the visitor picked dark with the toggle. The OS colour scheme is ignored. */
export function initialTheme(storage: Pick<Storage, "getItem"> = localStorage): Theme {
  try {
    return storage.getItem(storageKey) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => initialTheme());

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("transitioning");
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    const timer = setTimeout(() => root.classList.remove("transitioning"), 200);
    return () => clearTimeout(timer);
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => {
    const next = t === "dark" ? "light" : "dark";
    try { localStorage.setItem(storageKey, next); } catch { /* storage blocked: the choice lasts for this visit */ }
    return next;
  }), []);
  return { theme, toggle };
}
