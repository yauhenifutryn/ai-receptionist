// Lightweight in-memory rate limiter for the pre-pilot window.
//
// Trade-offs (intentional, for the 7-days-to-pilot timeline):
//   - Per-instance only. Vercel function instances may run in parallel, so
//     under load an attacker may get N * limit attempts where N is the live
//     instance count. Counterweight: PIN namespace is 1M (F2), so even an
//     8x instance multiplier still leaves brute force at >2 weeks of full
//     traffic per agent.
//   - Cleared on cold start. That bounds an attacker to roughly one cold-
//     start window of "fresh" attempts. Acceptable for the threat model.
//
// Swap path: replace the Map below with a Supabase table-backed counter
// (rate_limit_attempts(key text, attempted_at timestamptz)) and keep the
// same checkRateLimit / recordAttempt signature. Callers will not change.
//
// Used by:
//   - F2 PIN consumption: /api/conversations[/...] (?pin= path)
//   - F3 transcript: /api/test-transcript
//   - F5 auth: /api/auth/request-magic-link, /api/auth/verify-otp,
//     /api/auth/operator-code-redeem

interface Bucket {
  /** Epoch ms timestamps of attempts inside the window. */
  attempts: number[];
}

const buckets = new Map<string, Bucket>();
// Cap on distinct keys so a flood of unique keys (e.g. unique IPs) doesn't
// grow the Map unboundedly. When exceeded we drop the oldest 25% of keys.
const MAX_KEYS = 10_000;

export interface RateLimitOptions {
  /** Logical bucket name + identifier. Example: "pin:agent_xyz:1.2.3.4". */
  key: string;
  /** Allowed attempts within `windowSec`. */
  maxAttempts: number;
  /** Sliding window in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining attempts after this call (only valid when allowed). */
  remaining: number;
  /** Seconds until the window slides enough to allow the next attempt. */
  retryAfterSec: number;
}

/**
 * Check if a request is allowed, AND record this attempt (atomically — both
 * happen in one call so callers don't race on the read-then-write split).
 *
 * When `allowed === false`, the caller MUST short-circuit with a 429
 * response and a `Retry-After: <retryAfterSec>` header.
 */
export function checkRateLimit(opts: RateLimitOptions): RateLimitResult {
  if (buckets.size > MAX_KEYS) {
    pruneOldest();
  }
  const now = Date.now();
  const windowMs = opts.windowSec * 1000;
  const cutoff = now - windowMs;

  let bucket = buckets.get(opts.key);
  if (!bucket) {
    bucket = { attempts: [] };
    buckets.set(opts.key, bucket);
  }

  // Drop attempts outside the window.
  bucket.attempts = bucket.attempts.filter((t) => t >= cutoff);

  if (bucket.attempts.length >= opts.maxAttempts) {
    const oldest = bucket.attempts[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.attempts.push(now);
  return {
    allowed: true,
    remaining: opts.maxAttempts - bucket.attempts.length,
    retryAfterSec: 0,
  };
}

/**
 * Extract a best-effort caller IP from a Next.js Request. Falls back to a
 * fixed string so the limiter still works for callers without an upstream
 * proxy header.
 */
export function callerIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0];
    if (first) return first.trim();
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

function pruneOldest(): void {
  // Sort keys by their most-recent attempt time and drop the oldest 25%.
  const entries = Array.from(buckets.entries()).map(([k, b]) => {
    const last = b.attempts[b.attempts.length - 1] ?? 0;
    return [k, last] as const;
  });
  entries.sort((a, b) => a[1] - b[1]);
  const dropCount = Math.floor(entries.length * 0.25);
  for (let i = 0; i < dropCount; i += 1) {
    const entry = entries[i];
    if (entry) buckets.delete(entry[0]);
  }
}

/** For tests only. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}
