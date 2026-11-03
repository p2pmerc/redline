import { useState } from "react";
import { ArrowsClockwise, At, Code, GithubLogo, Globe, IdentificationBadge, XLogo, WarningCircle, FloppyDisk, Wallet } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { saveMyProfile } from "@/lib/data-source";
import type { ResearcherProfile } from "@/lib/redline-types";

const HANDLE = /^[a-z0-9][a-z0-9_-]{2,29}$/;
const httpsUrl = (v: string) => { try { return new URL(v).protocol === "https:"; } catch { return false; } };
const host = (v: string, hosts: string[]) => { try { const h = new URL(v).hostname; return hosts.some((x) => h === x || h.endsWith(`.${x}`)); } catch { return false; } };

export const randomSeed = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

const suggestHandle = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);

interface Props {
  initial: ResearcherProfile | null;
  /** Name from the sign-in, used as a starting point on first use. */
  suggestedName?: string;
  submitLabel: string;
  onSaved: (profile: ResearcherProfile) => void;
}

/** Create or edit a researcher profile. Used by onboarding and Settings. */
export function ProfileForm({ initial, suggestedName, submitLabel, onSaved }: Props) {
  const startName = initial?.displayName ?? (suggestedName && !suggestedName.includes("@") ? suggestedName : "");
  const [displayName, setDisplayName] = useState(startName);
  const [handle, setHandle] = useState(initial?.handle ?? suggestHandle(startName));
  const [handleTouched, setHandleTouched] = useState(!!initial);
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [skills, setSkills] = useState((initial?.skills ?? []).join(", "));
  const [github, setGithub] = useState(initial?.links.github ?? "");
  const [x, setX] = useState(initial?.links.x ?? "");
  const [website, setWebsite] = useState(initial?.links.website ?? "");
  const [payout, setPayout] = useState(initial?.payoutAccount ?? "");
  const [seed, setSeed] = useState(initial?.avatarSeed ?? randomSeed());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skillList = skills.split(",").map((s) => s.trim()).filter(Boolean);
  const problems = {
    displayName: displayName.trim().length >= 2 ? undefined : "Add a name of at least 2 characters.",
    handle: HANDLE.test(handle) ? undefined : "3 to 30 characters: a-z, 0-9, dash or underscore.",
    skills: skillList.length <= 10 && skillList.every((s) => s.length <= 30) ? undefined : "Up to 10 skills, each under 30 characters.",
    github: !github || (httpsUrl(github) && host(github, ["github.com"])) ? undefined : "Use a full https://github.com/… link.",
    x: !x || (httpsUrl(x) && host(x, ["x.com", "twitter.com"])) ? undefined : "Use a full https://x.com/… link.",
    payout: !payout || /^([a-z\d]+[-_])*[a-z\d]+(\.([a-z\d]+[-_])*[a-z\d]+)*\.testnet$/.test(payout.trim().toLowerCase()) || /^[0-9a-f]{64}$/.test(payout.trim().toLowerCase()) ? undefined : "Use a NEAR testnet account like yourname.testnet.",
    website: !website || httpsUrl(website) ? undefined : "Use a full https link.",
  };
  const valid = Object.values(problems).every((p) => !p) && bio.length <= 400;

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveMyProfile({
        handle, displayName: displayName.trim(), bio: bio.trim(), skills: skillList, avatarSeed: seed, payoutAccount: payout.trim().toLowerCase() || undefined,
        links: { github: github.trim() || undefined, x: x.trim() || undefined, website: website.trim() || undefined },
      });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); if (valid && !saving) void submit(); }}>
      <div className="flex items-center gap-4 card-hairline p-4">
        <ProfileAvatar size="xl" name={displayName || "You"} seed={seed} />
        <div className="min-w-0 flex-1">
          <p className="text-subtitle font-medium">Your avatar</p>
          <p className="text-caption text-muted-foreground">A RoboHash robot. It is the same everywhere you appear.</p>
        </div>
        <Button type="button" variant="secondary" size="compact" leadingIcon={ArrowsClockwise} onClick={() => setSeed(randomSeed())}>Shuffle</Button>
      </div>

      <InputGroup>
        <InputField index={0} label="Display name" icon={IdentificationBadge} placeholder="Ada Lovelace" value={displayName}
          onChange={(v) => { setDisplayName(v); if (!handleTouched) setHandle(suggestHandle(v)); }} error={displayName ? problems.displayName : undefined} disabled={saving} />
        <InputField index={1} label="Handle" icon={At} placeholder="ada" value={handle}
          onChange={(v) => { setHandleTouched(true); setHandle(v.toLowerCase()); }} error={handle ? problems.handle : undefined} disabled={saving} />
      </InputGroup>

      <div className="space-y-1.5">
        <label htmlFor="profile-bio" className="text-caption font-medium text-muted-foreground">Bio</label>
        <textarea id="profile-bio" rows={4} maxLength={400} value={bio} onChange={(e) => setBio(e.target.value)} disabled={saving}
          placeholder="What you hunt for, and how you like to work with security teams."
          className="w-full resize-y rounded-2xl bg-surface-3 p-3 text-body shadow-surface-2 outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring)]" />
        <p className="text-right text-caption text-muted-foreground tabular-nums">{bio.length}/400</p>
      </div>

      <InputGroup>
        <InputField index={2} label="Skills, comma separated" icon={Code} placeholder="smart contracts, rust, web3 auth" value={skills} onChange={setSkills} error={problems.skills} disabled={saving} />
      </InputGroup>
      {skillList.length > 0 && (
        <div className="-mt-3 flex flex-wrap gap-1.5" aria-label="Skills preview">
          {skillList.slice(0, 10).map((s) => <span key={s} className="rounded-full bg-[color-mix(in_srgb,var(--fluid-accent)_14%,var(--background))] px-2.5 py-0.5 text-caption">{s}</span>)}
        </div>
      )}

      <InputGroup>
        <InputField index={3} label="GitHub" icon={GithubLogo} placeholder="https://github.com/you" value={github} onChange={setGithub} error={problems.github} disabled={saving} />
        <InputField index={4} label="X" icon={XLogo} placeholder="https://x.com/you" value={x} onChange={setX} error={problems.x} disabled={saving} />
        <InputField index={5} label="Website" icon={Globe} placeholder="https://example.com" value={website} onChange={setWebsite} error={problems.website} disabled={saving} />
      </InputGroup>

      <div className="space-y-2">
        <InputGroup>
          <InputField index={6} label="Payout NEAR account" icon={Wallet} placeholder="yourname.testnet" value={payout} onChange={setPayout} error={payout ? problems.payout : undefined} disabled={saving} />
        </InputGroup>
        <p className="text-caption text-muted-foreground">Bounties are paid straight to this wallet, and it is checked against NEAR testnet when you save. It is bound on chain to each report before the team can fund it, and only you and the team on your reports can see it.</p>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive-light p-3 text-body text-destructive"><WarningCircle size={16} className="mt-0.5 shrink-0" /> {error}</p>
      )}
      <Button type="submit" leadingIcon={FloppyDisk} loading={saving} disabled={!valid}>{submitLabel}</Button>
    </form>
  );
}
