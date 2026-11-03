import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Scroll handling for a client-routed site. After every navigation:
 *  - "/#section" scrolls to that section once it has rendered (retrying briefly, so it also
 *    works when the landing page mounts after a click from another route);
 *  - a push to a new path scrolls to the top;
 *  - back/forward is left alone so the browser restores its own position.
 */
export function ScrollManager() {
  const { pathname, hash, key } = useLocation();
  const type = useNavigationType();

  useEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      let tries = 0;
      let raf = 0;
      const seek = () => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ block: "start" });
        else if (tries++ < 30) raf = requestAnimationFrame(seek);
      };
      seek();
      return () => cancelAnimationFrame(raf);
    }
    if (type !== "POP") window.scrollTo({ top: 0, left: 0 });
  }, [pathname, hash, key, type]);

  return null;
}
