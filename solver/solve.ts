// solver/solve.ts
//
// The deterministic, pure solver (design §7.3). No I/O, no model, no
// randomness. Given the enumerated candidate routings and their resolved
// costs it returns the single cheapest valid routing plus a proof of every
// other valid routing priced higher — or a typed NOT_COMPUTED value.
//
// Error-handling contract (§7.3): the solver is pure and total for well-formed
// input. It throws SolverInvariantError ONLY on an internal invariant
// violation (resolved contradiction missing its number, non-integer/non-
// positive cost, ratio <= 0, or a minimality assertion failure). It never
// catches its own throws; callers wrap in try/catch and degrade to
// NOT_COMPUTED. NO_VALID_ROUTING and UNRESOLVED_CONTRADICTION from normal
// control flow are returned, not thrown.

import {
  type CandidateRouting,
  type PricedRouting,
  type SolveInput,
  type SolveResult,
  SolverInvariantError,
} from "./types.js";

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function solve(input: SolveInput): SolveResult {
  const { candidates } = input;

  // Step 1 — empty candidates => fail-closed NO_VALID_ROUTING.
  if (candidates.length === 0) {
    return {
      kind: "NOT_COMPUTED",
      reason: "NO_VALID_ROUTING",
      message:
        "No valid routing: your points currencies reach no award-chart entry " +
        "matching this origin, destination, and cabin.",
    };
  }

  // Step 2 — GLOBAL gate (fail-closed, before ANY pricing). Any unresolved
  // contradiction on any candidate blocks the whole price.
  const blocking = candidates.filter(
    (c) => c.contradiction?.status === "unresolved",
  );
  if (blocking.length > 0) {
    // Every element of `blocking` has a defined contradiction by the filter
    // above, so the .map is null-safe.
    const blockingContradictionIds = blocking.map((c) => c.contradiction!.id);
    const programs = unique(blocking.map((c) => c.programCode)).join(", ");
    return {
      kind: "NOT_COMPUTED",
      reason: "UNRESOLVED_CONTRADICTION",
      blockingContradictionIds,
      message:
        `Cannot price: unresolved award-chart contradiction on ${programs}. ` +
        `Resolve the contradiction to continue.`,
    };
  }

  // Step 3 — PRICE each candidate (gate already passed, so no candidate is
  // unresolved).
  const priced: PricedRouting[] = candidates.map((c) => price(c));

  // Step 4 — SELECT: sort ascending by costInUserCurrency, tie-break by
  // programCode asc then currencyCode asc for a total deterministic order.
  const sorted = [...priced].sort(compareRouting);
  const chosen = sorted[0];
  const proof = sorted.slice(1);

  // Step 5 — MINIMALITY: asserted, not blindly trusted. A failed assertion is
  // a solver bug and throws rather than returning a wrong proof.
  const minimalityHolds = proof.every(
    (p) => p.costInUserCurrency >= chosen.costInUserCurrency,
  );
  if (!minimalityHolds) {
    throw new SolverInvariantError(
      "minimality assertion failed: a proof routing is cheaper than chosen",
    );
  }

  // Step 6 — COMPUTED.
  return {
    kind: "COMPUTED",
    chosen,
    proof,
    minimalityHolds: true,
  };
}

function price(c: CandidateRouting): PricedRouting {
  const effectivePointsCost =
    c.contradiction?.status === "resolved"
      ? c.contradiction.resolvedPointsCost
      : c.nominalPointsCost;

  // DEFENSIVE GUARD (fail-closed): a "resolved" contradiction with a null or
  // undefined resolvedPointsCost is a data/mapping bug. Do NOT fall back to
  // nominal (that would leak an unresolved price). Throw instead; the route
  // catches it and renders NOT_COMPUTED(UNRESOLVED_CONTRADICTION). The `== null`
  // check (NIT-B) catches BOTH null and undefined. A resolved flag must carry a
  // number.
  if (c.contradiction?.status === "resolved" && effectivePointsCost == null) {
    throw new SolverInvariantError(
      "resolved contradiction missing resolvedPointsCost: " +
        c.contradiction.id,
    );
  }

  // After the guard, effectivePointsCost is a number: when resolved the guard
  // proved it non-null, otherwise it is nominalPointsCost.
  const cost = effectivePointsCost as number;

  if (!Number.isInteger(cost) || cost <= 0) {
    throw new SolverInvariantError(
      "effectivePointsCost must be a positive integer, got: " + String(cost),
    );
  }
  if (!(c.ratio > 0)) {
    throw new SolverInvariantError("ratio must be > 0, got: " + String(c.ratio));
  }

  return {
    id: c.id,
    currencyCode: c.currencyCode,
    programCode: c.programCode,
    chartEntryId: c.chartEntryId,
    effectivePointsCost: cost,
    costInUserCurrency: Math.ceil(cost / c.ratio),
    taxesUsd: c.taxesUsd,
    ratio: c.ratio,
  };
}

function compareRouting(a: PricedRouting, b: PricedRouting): number {
  if (a.costInUserCurrency !== b.costInUserCurrency) {
    return a.costInUserCurrency - b.costInUserCurrency;
  }
  if (a.programCode !== b.programCode) {
    return a.programCode < b.programCode ? -1 : 1;
  }
  if (a.currencyCode !== b.currencyCode) {
    return a.currencyCode < b.currencyCode ? -1 : 1;
  }
  return 0;
}
