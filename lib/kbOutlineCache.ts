// lib/kbOutlineCache.ts
//
// Server-only, in-memory cache for the Knowledge Base outline (`initial_context`)
// used by the agent system prompt (app/api/chat/route.ts). Without it every
// agent turn blocks on a Context MCP round-trip before streaming starts.
//
// - Keyed by KB id + endpoint URL (the token is never part of the key or logs).
// - TTL (default 5 minutes), measured with Date.now() so tests can use fake timers.
// - Single-flight: concurrent first callers share one in-flight promise.
// - Failures are NOT cached: the in-flight entry is dropped and the error is
//   rethrown, so the caller falls back to the prompt without the outline and
//   the next call retries.
//
// Relative imports only.

import { contextKbOutline, type ContextConfig } from "./context";

export const KB_OUTLINE_TTL_MS = 5 * 60 * 1000;

type Outline = { text: string; kbId: string | null };

interface Entry {
  value?: Outline;
  expiresAt: number;
  inflight?: Promise<Outline>;
}

const cache = new Map<string, Entry>();

function cacheKey(cfg: ContextConfig): string {
  return `${cfg.kbId ?? ""}|${cfg.url}`;
}

export async function getKbOutlineCached(
  cfg: ContextConfig,
  opts: { timeoutMs?: number; ttlMs?: number } = {},
): Promise<Outline> {
  const ttl = opts.ttlMs ?? KB_OUTLINE_TTL_MS;
  const key = cacheKey(cfg);
  const hit = cache.get(key);
  if (hit?.value && hit.expiresAt > Date.now()) return hit.value;
  if (hit?.inflight) return hit.inflight;

  const inflight: Promise<Outline> = contextKbOutline({ cfg, timeoutMs: opts.timeoutMs }).then(
    (value) => {
      cache.set(key, { value, expiresAt: Date.now() + ttl });
      return value;
    },
    (err: unknown) => {
      if (cache.get(key)?.inflight === inflight) cache.delete(key);
      throw err;
    },
  );
  cache.set(key, { inflight, expiresAt: 0 });
  return inflight;
}

/** Test helper: drop every cached outline. */
export function resetKbOutlineCache(): void {
  cache.clear();
}
