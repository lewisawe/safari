// solver/solve.test.ts
//
// Unit tests for the deterministic solver (design §10.1 cases 1-8, 8a, 8b).

import { describe, it, expect } from "vitest";
import { solve } from "./solve.js";
import {
  type CandidateRouting,
  type SolveInput,
  SolverInvariantError,
} from "./types.js";

function input(candidates: CandidateRouting[]): SolveInput {
  return {
    origin: "SFO",
    destination: "NRT",
    cabin: "business",
    candidates,
  };
}

// Base candidate factory keeping all required fields present.
function cand(
  overrides: Partial<CandidateRouting> & Pick<CandidateRouting, "currencyCode" | "programCode">,
): CandidateRouting {
  return {
    id: `${overrides.currencyCode}->${overrides.programCode}`,
    chartEntryId: `ace.${overrides.programCode.toLowerCase()}`,
    ratio: 1.0,
    nominalPointsCost: 95000,
    taxesUsd: 0,
    ...overrides,
  };
}

// The shipped demo set (design §5.7) priced at the RESOLVED ANA value.
function demoCandidates(): CandidateRouting[] {
  return [
    cand({
      currencyCode: "AMEX_MR",
      programCode: "ANA",
      nominalPointsCost: 85000,
      taxesUsd: 180,
      contradiction: {
        id: "contra.ana.sfonrt.business",
        status: "resolved",
        resolvedPointsCost: 90000,
        resolvedSourceId: "src.ana.deval",
      },
    }),
    cand({ currencyCode: "AMEX_MR", programCode: "VS", nominalPointsCost: 95000, taxesUsd: 350 }),
    cand({ currencyCode: "CHASE_UR", programCode: "VS", nominalPointsCost: 95000, taxesUsd: 350 }),
    cand({ currencyCode: "CHASE_UR", programCode: "AC", nominalPointsCost: 105000, taxesUsd: 400 }),
  ];
}

describe("solve — §10.1", () => {
  // Case 1 — cheapest selection (90k/95k/95k/105k).
  it("1. selects the cheapest routing and orders the proof ascending", () => {
    const result = solve(input(demoCandidates()));
    expect(result.kind).toBe("COMPUTED");
    if (result.kind !== "COMPUTED") return;
    expect(result.chosen.programCode).toBe("ANA");
    expect(result.chosen.costInUserCurrency).toBe(90000);
    expect(result.proof.map((p) => p.costInUserCurrency)).toEqual([
      95000, 95000, 105000,
    ]);
  });

  // Case 2 — minimality / proof completeness.
  it("2. proof has n-1 entries all >= chosen, minimalityHolds true", () => {
    const candidates = demoCandidates();
    const result = solve(input(candidates));
    expect(result.kind).toBe("COMPUTED");
    if (result.kind !== "COMPUTED") return;
    expect(result.proof.length).toBe(candidates.length - 1);
    expect(result.minimalityHolds).toBe(true);
    for (const p of result.proof) {
      expect(p.costInUserCurrency).toBeGreaterThanOrEqual(
        result.chosen.costInUserCurrency,
      );
    }
  });

  // Case 3 — ratio affects cost.
  it("3. a worse ratio costs more and can flip the winner", () => {
    const good = cand({
      currencyCode: "AMEX_MR",
      programCode: "ANA",
      nominalPointsCost: 90000,
      ratio: 1.0,
    });
    const bad = cand({
      currencyCode: "CHASE_UR",
      programCode: "VS",
      nominalPointsCost: 90000,
      ratio: 0.8,
    });
    const result = solve(input([good, bad]));
    expect(result.kind).toBe("COMPUTED");
    if (result.kind !== "COMPUTED") return;
    // ceil(90000 / 1.0) = 90000 ; ceil(90000 / 0.8) = 112500
    expect(result.chosen.costInUserCurrency).toBe(90000);
    expect(result.chosen.programCode).toBe("ANA");
    expect(result.proof[0].costInUserCurrency).toBe(112500);
  });

  // Case 4 — fail-closed on an unresolved contradiction, no price in output.
  it("4. an unresolved contradiction returns NOT_COMPUTED with its id and no price", () => {
    const candidates = demoCandidates();
    candidates[0].contradiction = {
      id: "contra.ana.sfonrt.business",
      status: "unresolved",
    };
    const result = solve(input(candidates));
    expect(result.kind).toBe("NOT_COMPUTED");
    if (result.kind !== "NOT_COMPUTED") return;
    expect(result.reason).toBe("UNRESOLVED_CONTRADICTION");
    expect(result.blockingContradictionIds).toContain(
      "contra.ana.sfonrt.business",
    );
    expect(result.message).toMatch(/unresolved/i);
    // Fail-closed: no price anywhere on the result.
    expect(JSON.stringify(result)).not.toMatch(/costInUserCurrency/);
    expect("chosen" in result).toBe(false);
  });

  // Case 5 — resolved contradiction prices at the resolved value, not nominal.
  it("5. a resolved contradiction prices at resolved value, not nominal", () => {
    const only = cand({
      currencyCode: "AMEX_MR",
      programCode: "ANA",
      nominalPointsCost: 85000,
      contradiction: {
        id: "contra.ana.sfonrt.business",
        status: "resolved",
        resolvedPointsCost: 90000,
      },
    });
    const result = solve(input([only]));
    expect(result.kind).toBe("COMPUTED");
    if (result.kind !== "COMPUTED") return;
    expect(result.chosen.effectivePointsCost).toBe(90000);
    expect(result.chosen.costInUserCurrency).toBe(90000);
  });

  // Case 6 — no valid routing.
  it("6. empty candidates returns NOT_COMPUTED(NO_VALID_ROUTING)", () => {
    const result = solve(input([]));
    expect(result.kind).toBe("NOT_COMPUTED");
    if (result.kind !== "NOT_COMPUTED") return;
    expect(result.reason).toBe("NO_VALID_ROUTING");
  });

  // Case 7 — determinism / tie-break stable across repeated runs.
  it("7. ties break deterministically by programCode then currencyCode, stable across runs", () => {
    // Two routings at an identical cost (both VS 95k): AMEX_MR->VS and CHASE_UR->VS.
    const candidates: CandidateRouting[] = [
      cand({ currencyCode: "CHASE_UR", programCode: "VS", nominalPointsCost: 95000 }),
      cand({ currencyCode: "AMEX_MR", programCode: "VS", nominalPointsCost: 95000 }),
    ];
    const first = solve(input(candidates));
    const second = solve(input([...candidates].reverse()));
    expect(first).toEqual(second);
    if (first.kind !== "COMPUTED") throw new Error("expected COMPUTED");
    // programCode equal (both VS) -> tie-break on currencyCode asc -> AMEX_MR first.
    expect(first.chosen.currencyCode).toBe("AMEX_MR");
    expect(first.proof[0].currencyCode).toBe("CHASE_UR");
  });

  // Case 8 — mixed gate: any unresolved blocks the whole price (global gate).
  it("8. resolved + unresolved together still returns NOT_COMPUTED", () => {
    const candidates: CandidateRouting[] = [
      cand({
        currencyCode: "AMEX_MR",
        programCode: "ANA",
        nominalPointsCost: 85000,
        contradiction: {
          id: "contra.resolved",
          status: "resolved",
          resolvedPointsCost: 90000,
        },
      }),
      cand({
        currencyCode: "CHASE_UR",
        programCode: "AC",
        nominalPointsCost: 105000,
        contradiction: { id: "contra.unresolved", status: "unresolved" },
      }),
    ];
    const result = solve(input(candidates));
    expect(result.kind).toBe("NOT_COMPUTED");
    if (result.kind !== "NOT_COMPUTED") return;
    expect(result.reason).toBe("UNRESOLVED_CONTRADICTION");
    expect(result.blockingContradictionIds).toEqual(["contra.unresolved"]);
  });

  // Case 8a — defensive guard: resolved-without-number throws (no fallback).
  it("8a. a resolved contradiction missing resolvedPointsCost throws SolverInvariantError", () => {
    const only = cand({
      currencyCode: "AMEX_MR",
      programCode: "ANA",
      nominalPointsCost: 85000,
      contradiction: {
        id: "contra.ana.sfonrt.business",
        status: "resolved",
        // resolvedPointsCost intentionally undefined
      },
    });
    expect(() => solve(input([only]))).toThrow(SolverInvariantError);
    // And it must NOT silently fall back to the nominal 85000.
    try {
      solve(input([only]));
    } catch (e) {
      expect((e as Error).message).toMatch(/resolvedPointsCost/);
    }
  });

  // Case 8b — bad ratio (<= 0) throws, no divide-by-zero or negative cost.
  it("8b. a ratio <= 0 throws SolverInvariantError", () => {
    const only = cand({
      currencyCode: "AMEX_MR",
      programCode: "ANA",
      nominalPointsCost: 90000,
      ratio: 0,
    });
    expect(() => solve(input([only]))).toThrow(SolverInvariantError);
  });
});
