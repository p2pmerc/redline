import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface ResearcherProfile {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  skills: string[];
  links: { github?: string; x?: string; website?: string };
  /** RoboHash seed. Random, public, and unrelated to the account id. */
  avatarSeed: string;
  /** Testnet account that receives bounties. Private to the owner and the parties of their reports. */
  payoutAccount?: string;
  createdAt: string;
  updatedAt: string;
}

interface ProfileFile { version: 1; profiles: ResearcherProfile[] }

/** Same write-then-rename storage as the report store. Pass `null` for memory only. */
export class ProfileStore {
  private byUser = new Map<string, ResearcherProfile>();

  constructor(private readonly file: string | null) {
    if (file && existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as ProfileFile;
      for (const p of parsed.profiles) this.byUser.set(p.userId, p);
    }
  }

  get(userId: string): ResearcherProfile | undefined { return this.byUser.get(userId); }

  byHandle(handle: string): ResearcherProfile | undefined {
    const wanted = handle.toLowerCase();
    for (const p of this.byUser.values()) if (p.handle === wanted) return p;
    return undefined;
  }

  all(): ResearcherProfile[] { return [...this.byUser.values()]; }

  save(profile: ResearcherProfile): void {
    this.byUser.set(profile.userId, profile);
    if (!this.file) return;
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    const body: ProfileFile = { version: 1, profiles: this.all() };
    writeFileSync(tmp, JSON.stringify(body));
    renameSync(tmp, this.file);
  }
}
