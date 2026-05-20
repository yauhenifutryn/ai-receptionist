import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Auto-saves a structured record of every /api/prepare and /api/provision
 * run to <repo-root>/test-sessions/<timestamp>-<slug>/ so the user (and
 * future Claude sessions) can review:
 *
 *   - The exact URL the user pasted
 *   - URLs Firecrawl mapped + which got filtered out
 *   - The generated knowledge.md
 *   - The generated system prompt
 *   - The agentId returned by ElevenLabs
 *   - Any errors
 *
 * Local-only. The directory is gitignored. Vercel ephemeral fs means
 * this won't persist on the cloud — but for the local manual-test loop
 * the user is doing today, it's a full audit trail.
 */

const SESSIONS_DIR = "test-sessions";

function repoRoot(): string {
  // apps/web/lib/test-session-logger.ts -> apps/web -> apps -> <root>
  return path.resolve(process.cwd(), "..", "..");
}

function ts(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}Z`;
}

function slugify(input: string): string {
  return input
    .replace(/https?:\/\//, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase();
}

/**
 * Slug must be a single safe basename: only A-Za-z0-9 plus `-_.` and
 * the `__` separator used by openTestSession. No path separators,
 * no leading dots, length-bounded. Rejects "..", "../escape", absolute
 * paths, and anything else that could escape the sessions root.
 */
const SAFE_SLUG_RE = /^[A-Za-z0-9_.-]{1,200}$/;
function isSafeSlug(slug: string): boolean {
  if (typeof slug !== "string") return false;
  if (slug.length === 0 || slug.length > 200) return false;
  if (slug.startsWith(".")) return false;
  if (slug.includes("/") || slug.includes("\\") || slug.includes("..")) return false;
  return SAFE_SLUG_RE.test(slug);
}

export const __testing = { isSafeSlug };

export interface TestSessionHandle {
  /** Absolute path to the session directory. */
  dir: string;
  /** Public-facing slug (basename of dir). */
  slug: string;
  /** Append a structured event to events.jsonl. */
  event: (name: string, payload: unknown) => Promise<void>;
  /** Write a named artifact file (markdown, JSON, text). */
  write: (filename: string, content: string) => Promise<void>;
}

let cachedRoot: string | null = null;

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function resolveRoot(): Promise<string> {
  if (cachedRoot) return cachedRoot;
  const root = repoRoot();
  const dir = path.join(root, SESSIONS_DIR);
  await ensureDir(dir);
  cachedRoot = dir;
  return dir;
}

/**
 * Open a new session directory. Pass a hint string (URL, tenant name) to make
 * the directory easy to spot. The hint is sanitized.
 */
export async function openTestSession(hint: string): Promise<TestSessionHandle> {
  const root = await resolveRoot();
  const slug = `${ts()}__${slugify(hint) || "session"}`;
  const dir = path.join(root, slug);
  await ensureDir(dir);
  const eventsPath = path.join(dir, "events.jsonl");

  return {
    dir,
    slug,
    async event(name, payload) {
      const line = `${JSON.stringify({ t: new Date().toISOString(), name, payload })}\n`;
      await fs.appendFile(eventsPath, line, "utf-8");
    },
    async write(filename, content) {
      const full = path.join(dir, filename);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, "utf-8");
    },
  };
}

/**
 * Re-open an existing session by slug. Used by /api/provision to append to the
 * /api/prepare session for the same tenant when the user goes through both
 * steps in one browser.
 *
 * Hardened against path traversal: only safe-character basenames are
 * accepted, and the final resolved path must live under the sessions
 * root. Anything else returns null instead of opening an attacker-
 * controlled directory.
 */
export async function openExistingSession(slug: string): Promise<TestSessionHandle | null> {
  if (!isSafeSlug(slug)) return null;
  const root = await resolveRoot();
  const dir = path.resolve(root, slug);
  // Defense in depth: even if isSafeSlug somehow lets a traversal
  // through (e.g. unicode normalization), the resolved path must still
  // sit under root.
  if (dir !== root && !dir.startsWith(root + path.sep)) return null;
  try {
    await fs.access(dir);
  } catch {
    return null;
  }
  const eventsPath = path.join(dir, "events.jsonl");
  return {
    dir,
    slug,
    async event(name, payload) {
      const line = `${JSON.stringify({ t: new Date().toISOString(), name, payload })}\n`;
      await fs.appendFile(eventsPath, line, "utf-8");
    },
    async write(filename, content) {
      const full = path.join(dir, filename);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, "utf-8");
    },
  };
}

/** Tiny URL-safe formatter for paths shown in logs. */
export function sessionUrlForLog(handle: TestSessionHandle): string {
  return pathToFileURL(handle.dir).toString();
}
