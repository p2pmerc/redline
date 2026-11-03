import { useEffect, useState } from "react";
import { User } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const sizes = { sm: 24, md: 32, lg: 44, xl: 64 } as const;

/** RoboHash set. set1 is the classic robot set, which fits a security product. */
const ROBOHASH_SET = "set1";

/** Image address for a seed. The seed is a hash of an account id, never an email or a name. */
export const robohashUrl = (seed: string, px: number) =>
  `https://robohash.org/${encodeURIComponent(seed)}?set=${ROBOHASH_SET}&size=${px * 2}x${px * 2}`;

/** Cheap stable hash for built-in sample people, who have no account id. Not used for real users. */
export const sampleSeed = (name: string): string => {
  let h = 5381;
  for (const ch of name) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return `sample-${h.toString(16).padStart(8, "0")}`;
};

interface ProfileAvatarProps {
  seed?: string;
  /** Used for the accessible label and the fallback letter. */
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}

/** Robot avatar with a shimmer while it loads and a neutral fallback if the image service is down or offline. */
export function ProfileAvatar({ seed, name, size = "md", className }: ProfileAvatarProps) {
  const px = sizes[size];
  const [state, setState] = useState<"loading" | "ready" | "failed">(seed ? "loading" : "failed");
  useEffect(() => setState(seed ? "loading" : "failed"), [seed]);
  const letter = name.trim().charAt(0).toUpperCase();

  return (
    <span
      role="img"
      aria-label={`${name} avatar`}
      style={{ width: px, height: px }}
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-foreground/[0.06] text-muted-foreground", className)}
    >
      {state === "loading" && <span className="absolute inset-0 animate-pulse bg-foreground/[0.08]" aria-hidden />}
      {state === "failed" &&
        (letter ? <span className="text-[length:var(--avatar-letter,12px)] font-medium" style={{ fontSize: Math.max(10, px * 0.42) }}>{letter}</span> : <User size={px * 0.5} />)}
      {seed && state !== "failed" && (
        <img
          src={robohashUrl(seed, px)}
          alt=""
          width={px}
          height={px}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
          className={cn("relative size-full object-cover transition-opacity duration-200", state === "ready" ? "opacity-100" : "opacity-0")}
        />
      )}
    </span>
  );
}
