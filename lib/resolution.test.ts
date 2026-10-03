// lib/resolution.test.ts
//
// Unit tests for the pure resolution rule (design §10.2 cases 9, 10, 10a, 10b).

import { describe, it, expect } from "vitest";
import {
  resolve,
  userDecisionId,
  type Contradiction,
  type PriorUserDecision,
} from "./resolution.js";

// The shipped engineered contradiction (design §5.6): 85k printed chart
// (official-program, 2025-01-15) vs 90k devaluation (devaluation-notice,
// 2026-09-25).
function shippedContradiction(): Contradiction {
  return {
    _id: "contra.ana.sfonrt.business",
    claimA: {
      pointsCost: 85000,
      effectiveDate: "2025-01-15T00:00:00.000Z",
      label: "Printed award chart",
      source: {
        _id: "src.ana.chart",
        title: "ANA Award Chart (Partner, Business)",
        authority: "official-program",
        publishedDate: "2025-01-15T00:00:00.000Z",
      },
    },
    claimB: {
      pointsCost: 90000,
      effectiveDate: "2026-09-25T00:00:00.000Z",
      label: "Devaluation notice (effective last week)",
      source: {
        _id: "src.ana.deval",
        title: "ANA Devaluation Notice",
        authority: "devaluation-notice",
        publishedDate: "2026-09-25T00:00:00.000Z",
      },
    },
  };
}

describe("resolve — §10.2", () => {
  // Case 9 — precedence picks 90k (devaluation-notice later date beats
  // official-program earlier date).
  it("9. precedence picks claim B at 90k and cites the devaluation source", () => {
    const out = resolve(shippedContradiction());
    expect(out.chosenClaim).toBe("B");
    expect(out.chosenPointsCost).toBe(90000);
    expect(out.chosenSource._id).toBe("src.ana.deval");
    expect(out.rationale).toMatch(/devaluation-notice/);
  });

  // Case 10 — carry-forward: a pre-existing userDecision short-circuits
  // precedence and returns the stored value, writing nothing. This module is
  // pure (no write capability at all), so "writes nothing" is enforced by the
  // module boundary; we assert the stored value is returned verbatim and that
  // precedence was NOT applied (stored value differs from what precedence
  // would pick).
  it("10. a prior userDecision short-circuits precedence and returns the stored value", () => {
    const prior: PriorUserDecision = {
      chosenClaim: "A",
      chosenPointsCost: 85000, // deliberately the LOSER under precedence
      chosenSource: {
        _id: "src.ana.chart",
        authority: "official-program",
      },
      rationale: "prior human decision carried forward",
    };
    const out = resolve(shippedContradiction(), prior);
    expect(out.chosenClaim).toBe("A");
    expect(out.chosenPointsCost).toBe(85000);
    expect(out.chosenSource._id).toBe("src.ana.chart");
    expect(out.rationale).toBe("prior human decision carried forward");
  });

  // Case 10a — tie-break determinism: equal authority + equal date -> "A".
  it("10a. equal authorityRank and equal effectiveDate tie-break to claim A", () => {
    const c: Contradiction = {
      _id: "contra.tie",
      claimA: {
        pointsCost: 70000,
        effectiveDate: "2025-05-01T00:00:00.000Z",
        source: { _id: "src.a", authority: "official-program" },
      },
      claimB: {
        pointsCost: 72000,
        effectiveDate: "2025-05-01T00:00:00.000Z",
        source: { _id: "src.b", authority: "official-program" },
      },
    };
    const out = resolve(c);
    expect(out.chosenClaim).toBe("A");
    expect(out.chosenPointsCost).toBe(70000);
  });

  // Case 10b — derived _id equals `userDecision.${contradiction._id}`, proving
  // the idempotent-write keying is shared and stable.
  it("10b. userDecisionId derives the fixed idempotent-write _id", () => {
    const c = shippedContradiction();
    expect(userDecisionId(c._id)).toBe(
      "userDecision.contra.ana.sfonrt.business",
    );
    expect(userDecisionId(c._id)).toBe(`userDecision.${c._id}`);
  });
});
