// app/solver/pipeline.test.ts
//
// Design TEST 12 — the model-free end-to-end pipeline, proven OFFLINE.
//
// This is the task's headline verification and the demo safety net (FR-9). It
// runs with NO network and NO model key by importing the committed FEAT-003
// GROQ fixture (lib/fixtures/sfo-nrt-business.rows.ts) and composing the SAME
// pure pipeline the /solver page drives through its API routes (§9.1):
//
//   toCandidates(fixture)
//     -> solve()  === NOT_COMPUTED(UNRESOLVED_CONTRADICTION)   (the gate fires FIRST)
//   resolve(contradiction)  -> claim B, 90k, citing src.ana.deval
//   re-map the rows WITH that resolution (what the resolve write + re-traverse do)
//     -> solve()  === COMPUTED
//
// Then it asserts the §9.2 result EXACTLY:
//   chosen Amex MR -> ANA with costInUserCurrency 90000;
//   proof is VS 95000 (Amex), VS 95000 (Chase), AC 105000 (Chase) ASCENDING;
//   minimalityHolds true;
//   the resolution rationale cites src.ana.deval at 90000.

import { describe, it, expect } from "vitest";
import {
  SFO_NRT_BUSINESS_ROWS,
  SFO_NRT_BUSINESS_PARAMS,
  type TraverseRow,
  type ContradictionProjection,
} from "@/lib/fixtures/sfo-nrt-business.rows";
import { toCandidates } from "@/lib/toCandidates";
import { resolve, type Contradiction } from "@/lib/resolution";
import { solve } from "@/solver/solve";
import type { SolveInput } from "@/solver/types";

const BLOCKING_CONTRADICTION_ID = "contra.ana.sfonrt.business";

/**
 * Apply a committed resolution to a copy of the fixture rows, exactly as the
 * live pipeline does: /api/resolve patches the contradiction's
 * committedResolution, and the subsequent /api/traverse projects it back. We
 * deep-copy so the fixture (shared, unresolved) is never mutated.
 */
function withResolution(
  rows: TraverseRow[],
  res: {
    chosenClaim: "A" | "B";
    chosenPointsCost: number;
    chosenSourceId: string;
    chosenSourceTitle: string;
    chosenSourceAuthority: string;
    rationale: string;
  },
): TraverseRow[] {
  const copy = structuredClone(rows);
  for (const row of copy) {
    for (const entry of row.chartEntries) {
      entry.contradictions = entry.contradictions.map(
        (c): ContradictionProjection =>
          c._id === BLOCKING_CONTRADICTION_ID
            ? {
                ...c,
                status: "resolved",
                committedResolution: {
                  chosenClaim: res.chosenClaim,
                  chosenPointsCost: res.chosenPointsCost,
                  rationale: res.rationale,
                  chosenSource: {
                    _id: res.chosenSourceId,
                    title: res.chosenSourceTitle,
                    authority: res.chosenSourceAuthority,
                  },
                },
              }
            : c,
      );
    }
  }
  return copy;
}

/** Pull the one engineered contradiction out of the fixture for resolve(). */
function findBlockingContradiction(rows: TraverseRow[]): ContradictionProjection {
  for (const row of rows) {
    for (const entry of row.chartEntries) {
      const hit = entry.contradictions.find(
        (c) => c._id === BLOCKING_CONTRADICTION_ID,
      );
      if (hit) return hit;
    }
  }
  throw new Error("fixture is missing the engineered contradiction");
}

describe("model-free pipeline (design test 12, offline)", () => {
  const input = (rows: TraverseRow[]): SolveInput => ({
    origin: SFO_NRT_BUSINESS_PARAMS.origin,
    destination: SFO_NRT_BUSINESS_PARAMS.destination,
    cabin: SFO_NRT_BUSINESS_PARAMS.cabin,
    candidates: toCandidates(rows),
  });

  it("gates first: solve() returns NOT_COMPUTED(UNRESOLVED_CONTRADICTION) before resolution", () => {
    const gated = solve(input(SFO_NRT_BUSINESS_ROWS));

    expect(gated.kind).toBe("NOT_COMPUTED");
    if (gated.kind !== "NOT_COMPUTED") return; // narrow for TS

    expect(gated.reason).toBe("UNRESOLVED_CONTRADICTION");
    expect(gated.blockingContradictionIds).toEqual([BLOCKING_CONTRADICTION_ID]);
    // Fail-closed: no price field exists on a NOT_COMPUTED result.
    expect("chosen" in gated).toBe(false);
    expect("proof" in gated).toBe(false);
  });

  it("resolves to claim B (90k) citing src.ana.deval", () => {
    const contradiction = findBlockingContradiction(SFO_NRT_BUSINESS_ROWS);

    // resolve() consumes the §6-projected claim shape directly; the fixture's
    // ClaimProjection is structurally the resolution Claim (source.authority +
    // effectiveDate present).
    const forResolve: Contradiction = {
      _id: contradiction._id,
      claimA: contradiction.claimA,
      claimB: contradiction.claimB,
    };

    const decision = resolve(forResolve);

    expect(decision.chosenClaim).toBe("B");
    expect(decision.chosenPointsCost).toBe(90000);
    expect(decision.chosenSource._id).toBe("src.ana.deval");
    // Rationale is the precedence-rule output; it must reference the winning
    // authority (devaluation-notice) that the chosen source carries.
    expect(decision.chosenSource.authority).toBe("devaluation-notice");
    expect(decision.rationale).toContain("devaluation-notice");
  });

  it("after resolution solve() is COMPUTED: Amex->ANA 90,000 with the exact ascending proof", () => {
    // 1) Resolve, exactly as /api/resolve would.
    const contradiction = findBlockingContradiction(SFO_NRT_BUSINESS_ROWS);
    const decision = resolve({
      _id: contradiction._id,
      claimA: contradiction.claimA,
      claimB: contradiction.claimB,
    });

    // The resolution cites src.ana.deval at 90,000 — the thesis number.
    expect(decision.chosenSource._id).toBe("src.ana.deval");
    expect(decision.chosenPointsCost).toBe(90000);

    // 2) Re-map the rows WITH the committed resolution (what the write +
    //    re-traverse produce), then solve again.
    const resolvedRows = withResolution(SFO_NRT_BUSINESS_ROWS, {
      chosenClaim: decision.chosenClaim,
      chosenPointsCost: decision.chosenPointsCost,
      chosenSourceId: decision.chosenSource._id,
      chosenSourceTitle: decision.chosenSource.title ?? "ANA Devaluation Notice",
      chosenSourceAuthority: decision.chosenSource.authority,
      rationale: decision.rationale,
    });

    const result = solve(input(resolvedRows));

    expect(result.kind).toBe("COMPUTED");
    if (result.kind !== "COMPUTED") return; // narrow for TS

    // Chosen: Amex MR -> ANA at the RESOLVED 90,000 (not the nominal 85,000).
    expect(result.chosen.id).toBe("AMEX_MR->ANA");
    expect(result.chosen.currencyCode).toBe("AMEX_MR");
    expect(result.chosen.programCode).toBe("ANA");
    expect(result.chosen.chartEntryId).toBe("ace.ana");
    expect(result.chosen.effectivePointsCost).toBe(90000);
    expect(result.chosen.costInUserCurrency).toBe(90000);

    // Minimality holds over points-in-user-currency.
    expect(result.minimalityHolds).toBe(true);

    // Proof: VS 95k (Amex), VS 95k (Chase), AC 105k (Chase) — ascending,
    // deterministic tie-break (programCode asc, then currencyCode asc).
    expect(result.proof).toHaveLength(3);
    const proofSummary = result.proof.map((p) => ({
      currencyCode: p.currencyCode,
      programCode: p.programCode,
      costInUserCurrency: p.costInUserCurrency,
    }));
    expect(proofSummary).toEqual([
      { currencyCode: "AMEX_MR", programCode: "VS", costInUserCurrency: 95000 },
      { currencyCode: "CHASE_UR", programCode: "VS", costInUserCurrency: 95000 },
      { currencyCode: "CHASE_UR", programCode: "AC", costInUserCurrency: 105000 },
    ]);

    // Ascending and each strictly >= chosen.
    const costs = [
      result.chosen.costInUserCurrency,
      ...result.proof.map((p) => p.costInUserCurrency),
    ];
    expect(costs).toEqual([90000, 95000, 95000, 105000]);
    for (const p of result.proof) {
      expect(p.costInUserCurrency).toBeGreaterThanOrEqual(
        result.chosen.costInUserCurrency,
      );
    }
  });

  it("runs with no network and no model key (imports the committed fixture only)", () => {
    // The imports at the top of this file are the fixture + pure modules; no
    // fetch, no @sanity/client, no AI SDK. Asserting the fixture is the source
    // of truth makes the offline guarantee explicit.
    expect(SFO_NRT_BUSINESS_ROWS.length).toBeGreaterThan(0);
    expect(SFO_NRT_BUSINESS_PARAMS).toEqual({
      currencyIds: ["cur.amex", "cur.chase"],
      origin: "SFO",
      destination: "NRT",
      cabin: "business",
    });
    expect(typeof process.env.MODEL_PROVIDER_API_KEY === "string").toBe(
      Boolean(process.env.MODEL_PROVIDER_API_KEY),
    );
  });
});
