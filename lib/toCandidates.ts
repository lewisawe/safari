// lib/toCandidates.ts
//
// Pure mapping (design §7.5) that flattens the nested §6 traversal result into
// the flat CandidateRouting[] the solver consumes (§7.1). One transferPartner
// row fans out to zero-or-more candidates — one per matching chartEntry.
//
// Fail-closed rules this encodes (verbatim from §7.5):
//   • Absence is unresolved. `committedResolution == null` (GROQ's rendering of
//     the absent inline object, §4.6) maps to status:"unresolved". The stored
//     `status` string is NOT trusted here.
//   • Unresolved dominates. If an entry carries both an unresolved and a
//     resolved contradiction, the unresolved one is chosen so the gate still
//     fires (fail-closed). Selection is deterministic: first unresolved by
//     `_id` asc, else first resolved by `_id` asc.
//   • ratio > 0 invariant. A non-positive ratio is a seed bug; throw a typed
//     SolverInvariantError rather than letting the solver divide by zero.
//   • Stable candidate id = `${fromCurrency.code}->${entry.program.code}`.
//
// The resolved effectivePointsCost the solver prices with comes from
// committedResolution.chosenPointsCost (set below as resolvedPointsCost), NOT
// from nominalPointsCost — that is the "resolution is load-bearing on the
// price" thesis (§5.7).

import type { CandidateRouting } from "../solver/types";
import { SolverInvariantError } from "../solver/types";
import type {
  TraverseRow,
  ContradictionProjection,
} from "./fixtures/sfo-nrt-business.rows";

/**
 * Map the §6 traversal rows to the flat CandidateRouting[] the solver consumes.
 * Pure and deterministic. Throws SolverInvariantError on a non-positive ratio
 * (bad seed); the caller route degrades a caught throw to NOT_COMPUTED.
 */
export function toCandidates(rows: TraverseRow[]): CandidateRouting[] {
  const candidates: CandidateRouting[] = [];

  for (const row of rows) {
    for (const entry of row.chartEntries) {
      // ratio > 0 invariant (fail-closed): surface a data error, never a
      // divide-by-zero or a negative/∞ cost downstream.
      if (!(row.ratio > 0)) {
        throw new SolverInvariantError(
          `non-positive transfer ratio for ${row.transferPartnerId}: ${row.ratio}`,
        );
      }

      // Pick at most one relevant contradiction for this entry: the first
      // UNRESOLVED one by `_id` asc if any (unresolved dominates), else the
      // first resolved one by `_id` asc. Entries carry 0 or 1 in the shipped
      // data, but the mapping is defined for n>=0 deterministically (N7).
      const cs = [...entry.contradictions].sort((a, b) =>
        a._id < b._id ? -1 : a._id > b._id ? 1 : 0,
      );
      const unresolved = cs.find((c) => c.committedResolution == null);
      const resolved = cs.find((c) => c.committedResolution != null);
      const picked: ContradictionProjection | undefined =
        unresolved ?? resolved ?? undefined;

      let contradiction: CandidateRouting["contradiction"];
      if (picked === undefined) {
        contradiction = undefined;
      } else if (picked.committedResolution == null) {
        // ABSENT resolution => unresolved (do NOT trust the stored status).
        contradiction = { id: picked._id, status: "unresolved" };
      } else {
        contradiction = {
          id: picked._id,
          status: "resolved",
          resolvedPointsCost: picked.committedResolution.chosenPointsCost,
          resolvedSourceId: picked.committedResolution.chosenSource._id,
        };
      }

      candidates.push({
        id: `${row.fromCurrency.code}->${entry.program.code}`,
        currencyCode: row.fromCurrency.code,
        programCode: entry.program.code,
        chartEntryId: entry._id,
        ratio: row.ratio,
        nominalPointsCost: entry.pointsCost,
        taxesUsd: entry.taxesUsd,
        contradiction,
      });
    }
  }

  return candidates;
}
