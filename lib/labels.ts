// lib/labels.ts
//
// Single source of truth for the source `authority` enum and its precedence
// rank (design §4.1 / M1). The Sanity schema derives its options.list from the
// keys of this one object, so the enum and the solver's rank map can never
// drift. Also home to the synthetic-data label strings the UI reuses.

import { SolverInvariantError } from "../solver/types";

// AUTHORITY_RANK / Authority / AUTHORITY_OPTIONS now live in the dependency-free
// lib/authority.ts so the standalone Studio can import the same single source of
// truth without dragging in solver code (M1 preserved across the app/Studio
// package boundary). Re-exported here so existing app imports from lib/labels
// are unchanged.
export {
  AUTHORITY_RANK,
  AUTHORITY_OPTIONS,
  type Authority,
} from "./authority";

import { AUTHORITY_RANK, type Authority } from "./authority";

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
