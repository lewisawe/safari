// lib/rateLimit.ts
//
// Best-effort, in-memory, per-instance fixed-window rate limiter. On Vercel
// every serverless instance keeps its own Map, so this is a per-visitor speed
// bump, not a global guarantee (the global spend ceiling is the Sanity-backed
// daily cap in lib/agentBudget.ts). The Map is bounded: expired windows are
// swept when it fills up, and if it is still full the oldest key is evicted, so
// a flood of distinct IPs cannot grow memory without limit.

export interface RateLimitDecision {
  allowed: boolean;
  /** Requests left in the current window after this one (0 when denied). */
  remaining: number;
  /** Epoch ms when the current window for this key ends. */
  resetAt: number;
}

export interface RateLimiter {
  /** Count one request for `key` and say whether it is allowed. */
  check(key: string, now?: number): RateLimitDecision;
  /** True if `key` is currently over its limit. Does NOT count a request. */
  isLimited(key: string, now?: number): boolean;
  /** Number of tracked keys (for tests / diagnostics). */
  size(): number;
}

export interface RateLimiterOptions {
  /** Max allowed requests per key per window. 0 denies everything. */
  limit: number;
  windowMs: number;
  /** Upper bound on tracked keys. Default 5000. */
  maxKeys?: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { limit, windowMs } = opts;
  const maxKeys = Math.max(1, opts.maxKeys ?? 5000);
  const windows = new Map<string, Window>();

  function sweep(now: number): void {
    for (const [k, w] of windows) {
      if (w.resetAt <= now) windows.delete(k);
    }
  }

  function live(key: string, now: number): Window | undefined {
    const w = windows.get(key);
    if (w && w.resetAt <= now) {
      windows.delete(key);
      return undefined;
    }
    return w;
  }

  return {
    check(key, now = Date.now()) {
      let w = live(key, now);
      if (!w) {
        if (windows.size >= maxKeys) sweep(now);
        while (windows.size >= maxKeys) {
          // Map iteration order is insertion order: drop the oldest window.
          const oldest = windows.keys().next().value;
          if (oldest === undefined) break;
          windows.delete(oldest);
        }
        w = { count: 0, resetAt: now + windowMs };
        windows.set(key, w);
      }
      if (w.count >= limit) {
        return { allowed: false, remaining: 0, resetAt: w.resetAt };
      }
      w.count += 1;
      return { allowed: true, remaining: Math.max(0, limit - w.count), resetAt: w.resetAt };
    },
    isLimited(key, now = Date.now()) {
      if (limit <= 0) return true;
      const w = live(key, now);
      return w !== undefined && w.count >= limit;
    },
    size() {
      return windows.size;
    },
  };
}

/**
 * Best-effort client IP: first hop of x-forwarded-for, else x-real-ip, else
 * "unknown" (all unknown callers then share one bucket, which errs toward
 * limiting rather than toward unlimited calls).
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  if (first) return first;
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

/** Parse a non-negative integer env var, falling back to `fallback`. */
export function intFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value.trim());
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}
