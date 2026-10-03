// lib/labels.ts
//
// Single source of truth for the source `authority` enum and its precedence
// rank (design §4.1 / M1). The Sanity schema derives its options.list from the
// keys of this one object, so the enum and the solver's rank map can never
// drift. Also home to the synthetic-data label strings the UI reuses.

import { SolverInvariantError } from "../solver/types";

export const AUTHORITY_RANK = {
  "devaluation-notice": 3,
  "transfer-partner": 2,
  "official-program": 1,
  aggregator: 0,
} as const;

export type Authority = keyof typeof AUTHORITY_RANK;

// Schema options.list is derived from the keys, so the two can never diverge.
export const AUTHORITY_OPTIONS = Object.keys(AUTHORITY_RANK) as Authority[];

/**
 * Precedence rank for a source authority.
 *
 * Fail-closed (M1): an authority absent from AUTHORITY_RANK (a future or
 * typo'd seed value) THROWS rather than defaulting to a numeric rank. A silent
 * default would let a malformed source mis-resolve the one decision the thesis
 * rests on. The resolve route catches this throw and degrades to
 * NOT_COMPUTED(UNRESOLVED_CONTRADICTION) — the gate stays shut, no number leaks.
 */
export function authorityRank(a: string): number {
  if (!Object.prototype.hasOwnProperty.call(AUTHORITY_RANK, a)) {
    throw new SolverInvariantError("unknown source.authority: " + a);
  }
  return AUTHORITY_RANK[a as Authority];
}

// ----------------------------------------------------------------------------
// Synthetic-data labels used across the UI (FR-11) and the writeup.
// ----------------------------------------------------------------------------

export const SYNTHETIC_BANNER_LABEL =
  "Synthetic dataset — not real award pricing";

export const SYNTHETIC_FIELD_LABEL = "Synthetic";
