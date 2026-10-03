// solver/types.ts
//
// Input/output contracts for the deterministic solver (design §7.1, §7.2).
// Pure types only — no I/O, no model, no randomness. These contracts are the
// stable surface every path (agent + model-free) reuses.

export type Cabin = "economy" | "premium" | "business" | "first";

// ----------------------------------------------------------------------------
// §7.1 Input contract
// ----------------------------------------------------------------------------

export interface CandidateRouting {
  id: string; // stable, e.g. `${currencyCode}->${programCode}`
  currencyCode: string; // AMEX_MR
  programCode: string; // ANA
  chartEntryId: string; // ace.ana
  ratio: number; // points-out per point-in (>0)
  nominalPointsCost: number; // chart number before resolution (e.g. 85000)
  taxesUsd: number;
  // Contradiction state for this routing's chart entry:
  contradiction?: {
    id: string;
    status: "unresolved" | "resolved";
    resolvedPointsCost?: number; // present iff resolved
    resolvedSourceId?: string;
  };
}

export interface SolveInput {
  origin: string;
  destination: string;
  cabin: Cabin;
  candidates: CandidateRouting[];
}

// ----------------------------------------------------------------------------
// §7.2 Output contract (typed, fail-closed)
// ----------------------------------------------------------------------------

export type SolveResult = SolveComputed | SolveNotComputed;

export interface SolveComputed {
  kind: "COMPUTED";
  chosen: PricedRouting; // the single cheapest valid routing
  proof: PricedRouting[]; // every OTHER valid routing, cost-ascending, each strictly >= chosen
  minimalityHolds: boolean; // true iff no valid routing is cheaper than `chosen`
}

export interface SolveNotComputed {
  kind: "NOT_COMPUTED";
  reason:
    | "UNRESOLVED_CONTRADICTION" // a candidate on the critical path is gated
    | "NO_VALID_ROUTING"; // user's currencies reach no matching chart entry
  blockingContradictionIds?: string[]; // populated for UNRESOLVED_CONTRADICTION
  message: string; // human-readable, shown verbatim in UI
}

export interface PricedRouting {
  id: string;
  currencyCode: string;
  programCode: string;
  chartEntryId: string;
  effectivePointsCost: number; // after resolution (90000)
  costInUserCurrency: number; // ceil(effectivePointsCost / ratio) — THE minimized quantity
  taxesUsd: number; // informational cash co-pay; NOT part of minimality (A5, N2)
  ratio: number;
}

// ----------------------------------------------------------------------------
// Typed invariant error
// ----------------------------------------------------------------------------

/**
 * Thrown ONLY on an internal invariant violation that indicates a bug or
 * malformed input (design §7.3 error contract, §7.4 unknown-authority). The
 * solver never catches its own throws; every route that calls into this code
 * wraps the call in try/catch and degrades to NOT_COMPUTED (never a price).
 */
export class SolverInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SolverInvariantError";
    // Preserve prototype chain under transpilation targets.
    Object.setPrototypeOf(this, SolverInvariantError.prototype);
  }
}
