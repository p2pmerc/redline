import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "redline:chunk-reload-at";
const RELOAD_GUARD_MS = 10_000;

const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/** True when an error comes from a missing hashed chunk (usually after a redeploy). */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return CHUNK_ERROR.test(message);
}

/** Reloads once to pick up the new build; returns false if we reloaded too recently. */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable: still reload once.
  }
  window.location.reload();
  return true;
}

export function installPreloadErrorReload() {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadForNewBuild();
  });
}

/** React.lazy that reloads the page when the chunk vanished after a deploy. */
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((error: unknown) => {
      if (isChunkLoadError(error) && reloadForNewBuild()) {
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }),
  );
}
