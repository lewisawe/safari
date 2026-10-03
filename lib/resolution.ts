// lib/resolution.ts
//
// Pure precedence rule used by both the agent and the model-free path to
// resolve a `contradiction` to a chosen claim (design §7.4). This module is
// decision logic ONLY — all Sanity read/write lives in the resolve route
// (FEAT-004), never here. It throws SolverInvariantError on an unknown
// authority (via authorityRank) so the gate stays fail-closed.

import { authorityRank } from "./labels";

// ----------------------------------------------------------------------------
// Input shapes (projected GROQ claim shape, design §6)
// ----------------------------------------------------------------------------

export interface ClaimSource {
  _id: string;
  title?: string;
  authority: string;
  publishedDate?: string;
}

export interface Claim {
  pointsCost: number;
  effectiveDate: string; // ISO datetime
  label?: string;
  source: ClaimSource;
}

export interface Contradiction {
  _id: string;
  claimA: Claim;
  claimB: Claim;
}

/**
 * A prior committed decision for this contradiction. When one exists it
 * short-circuits precedence (carry-forward, §7.4 step 1). This module performs
 * no Sanity read; the caller passes any prior decision in.
 */
export interface PriorUserDecision {
  chosenClaim: "A" | "B";
  chosenPointsCost: number;
  chosenSource: ClaimSource;
  rationale: string;
}

export interface ResolveOutput {
  chosenClaim: "A" | "B";
  chosenPointsCost: number;
  chosenSource: ClaimSource;
  rationale: string;
}

/**
 * The derived, fixed `_id` for the carry-forward `userDecision` document.
 * One decision per contradiction; writes use createOrReplace on this `_id` so
 * re-resolution is idempotent (§4.7, §7.4). Exported so the resolve route and
 * the tests share one definition and can never key differently.
 */
export function userDecisionId(contradictionId: string): string {
  return `userDecision.${contradictionId}`;
}

function effectiveDateMs(claim: Claim): number {
  return new Date(claim.effectiveDate).getTime();
}

/**
 * Resolve a contradiction to its authoritative claim.
 *
 * Precedence (§7.4): rank each claim by (authorityRank(source.authority),
 * effectiveDate ms) and take the argmax. Tie-break (equal rank AND equal date)
 * is claim "A" — documented and deterministic. A passed-in `prior` decision
 * short-circuits with no computation.
 *
 * Pure: no I/O. Throws SolverInvariantError (via authorityRank) on an unknown
 * authority; the caller degrades to NOT_COMPUTED.
 */
export function resolve(
  contradiction: Contradiction,
  prior?: PriorUserDecision,
): ResolveOutput {
  // Step 1 — honor a prior userDecision if one was passed in (no write here).
  if (prior) {
    return {
      chosenClaim: prior.chosenClaim,
      chosenPointsCost: prior.chosenPointsCost,
      chosenSource: prior.chosenSource,
      rationale: prior.rationale,
    };
  }

  // Step 2 — precedence over the two claims.
  const { claimA, claimB } = contradiction;
  const rankA = authorityRank(claimA.source.authority);
  const rankB = authorityRank(claimB.source.authority);
  const dateA = effectiveDateMs(claimA);
  const dateB = effectiveDateMs(claimB);

  // argmax over (authorityRank, effectiveDateMs); ties -> "A".
  let winnerKey: "A" | "B";
  if (rankB > rankA) {
    winnerKey = "B";
  } else if (rankB < rankA) {
    winnerKey = "A";
  } else if (dateB > dateA) {
    winnerKey = "B";
  } else {
    // dateB < dateA, OR fully equal -> documented tie-break to "A".
    winnerKey = "A";
  }

  const winner = winnerKey === "A" ? claimA : claimB;
  return {
    chosenClaim: winnerKey,
    chosenPointsCost: winner.pointsCost,
    chosenSource: winner.source,
    rationale: `${winner.source.authority} with effectiveDate ${winner.effectiveDate} supersedes the other claim`,
  };
}
