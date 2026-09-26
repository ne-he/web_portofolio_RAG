// In-memory, per-instance rate limiter for the public chat endpoint.
//
// WHY in-memory: zero dependency, zero setup: ships today. It lives inside the
// serverless function instance, so it reliably catches a single client hammering
// the endpoint and runaway client-side loops (the realistic cost risks for a
// portfolio site). It does NOT share state across instances/regions and resets
// on a cold start, so it is not a defense against a distributed attacker.
//
// UPGRADE PATH: when traffic justifies it, replace the body of `hit()` with a
// shared store (e.g. Upstash Redis via `@upstash/ratelimit`). Keep this module's
// signature and the route stays unchanged: just add the UPSTASH_* env vars.

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_SEC ?? 60) * 1000;
const MAX_HITS = Number(process.env.RATE_LIMIT_MAX ?? 15);
const MAX_TRACKED_KEYS = 5000; // bound memory growth on a long-lived instance

/** Request timestamps (ms) per key, within the current window. */
const log = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds to wait before retrying (0 when allowed). */
  retryAfterSec: number;
}

/**
 * Best-effort client IP. Vercel (and most proxies) set `x-forwarded-for`; the
 * first entry is the originating client. Falls back to `x-real-ip`.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  return real || "unknown";
}

/**
 * Sliding-window-log limiter. Call once per request with a stable key (e.g. IP).
 * Returns whether the request is allowed plus header-friendly metadata.
 */
export function hit(key: string): RateLimitResult {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Opportunistic memory bound: if the table grows huge (bursty traffic / many
  // distinct IPs), drop everything. Worst case some clients get a fresh window,
  // cheap and safe for a single-instance in-memory limiter.
  if (log.size > MAX_TRACKED_KEYS) log.clear();

  const recent = (log.get(key) ?? []).filter((t) => t > windowStart);

  if (recent.length >= MAX_HITS) {
    const oldest = recent[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    log.set(key, recent);
    return { ok: false, limit: MAX_HITS, remaining: 0, retryAfterSec };
  }

  recent.push(now);
  log.set(key, recent);
  return {
    ok: true,
    limit: MAX_HITS,
    remaining: Math.max(0, MAX_HITS - recent.length),
    retryAfterSec: 0,
  };
}
