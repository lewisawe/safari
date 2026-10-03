// lib/authority.ts
//
// Dependency-free single source of truth for the source `authority` enum and
// its precedence rank (design §4.1 / M1). This file imports NOTHING from the
// app (no solver, no React) so BOTH the Next.js app (via lib/labels.ts) and the
// standalone Sanity Studio (studio-safari/schemaTypes/source.ts, by relative
// path) can import it. The schema enum and the solver rank map are derived from
// this one object, so they can never drift.
//
// Do not add app-only imports here — that is the whole point of the split.

export const AUTHORITY_RANK = {
  "devaluation-notice": 3,
  "transfer-partner": 2,
  "official-program": 1,
  aggregator: 0,
} as const;

export type Authority = keyof typeof AUTHORITY_RANK;

// Schema options.list is derived from the keys, so the two can never diverge.
export const AUTHORITY_OPTIONS = Object.keys(AUTHORITY_RANK) as Authority[];
