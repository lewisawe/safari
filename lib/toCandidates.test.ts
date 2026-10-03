// lib/toCandidates.test.ts
//
// Design test plan §10.3 cases 11, 11a, 11b for the pure §7.5 mapping.
//   11  — maps a GROQ row (with nested contradiction) into a correct
//         CandidateRouting incl. contradiction state (fed the FEAT-003 fixture).
//   11a — absence-is-unresolved: committedResolution == null maps to
//         status:"unresolved" even if the stored `status` string said
//         "resolved" (§7.5 does not trust `status`).
//   11b — unresolved-dominates: an entry with BOTH a resolved and an unresolved
//         contradiction maps to status:"unresolved" (fail-closed).

import { describe, it, expect } from "vitest";
import { toCandidates } from "./toCandidates";
import { SolverInvariantError } from "../solver/types";
import {
  SFO_NRT_BUSINESS_ROWS,
  type TraverseRow,
  type ContradictionProjection,
} from "./fixtures/sfo-nrt-business.rows";

describe("toCandidates (§7.5 mapping)", () => {
  // --- Case 11: fixture row with nested contradiction maps correctly --------
  it("maps the fixture rows into correct CandidateRoutings incl. contradiction state", () => {
    const candidates = toCandidates(SFO_NRT_BUSINESS_ROWS);

    // Four transfer-partner rows, each with exactly one matching chart entry.
    expect(candidates.length).toBe(4);

    const anaFromAmex = candidates.find((c) => c.id === "AMEX_MR->ANA");
    expect(anaFromAmex).toBeDefined();
    expect(anaFromAmex).toMatchObject({
      id: "AMEX_MR->ANA",
      currencyCode: "AMEX_MR",
      programCode: "ANA",
      chartEntryId: "ace.ana",
      ratio: 1.0,
      nominalPointsCost: 85000,
      taxesUsd: 180,
    });
    // The embedded contradiction is unresolved (committedResolution === null
    // in the fixture) — the gate.
    expect(anaFromAmex!.contradiction).toEqual({
      id: "contra.ana.sfonrt.business",
      status: "unresolved",
    });

    // The three non-gated routings carry no contradiction.
    const others = candidates.filter((c) => c.id !== "AMEX_MR->ANA");
    expect(others.map((c) => c.id).sort()).toEqual([
      "AMEX_MR->VS",
      "CHASE_UR->AC",
      "CHASE_UR->VS",
    ]);
    for (const c of others) {
      expect(c.contradiction).toBeUndefined();
    }
  });

  // --- Case 11a: committedResolution == null wins over a stale status "resolved"
  it("maps committedResolution==null to unresolved even if the stored status says resolved", () => {
    const contradiction: ContradictionProjection = {
      _id: "contra.x",
      title: "stale status test",
      // The stored string LIES — it must be ignored. Absence of
      // committedResolution is the only trusted signal.
      status: "resolved",
      explanation: "status string drifted from the absent resolution object",
      claimA: {
        pointsCost: 85000,
        effectiveDate: "2025-01-15T00:00:00.000Z",
        label: "chart",
        source: {
          _id: "src.a",
          title: "A",
          authority: "official-program",
          publishedDate: "2025-01-15T00:00:00.000Z",
        },
      },
      claimB: {
        pointsCost: 90000,
        effectiveDate: "2026-09-25T00:00:00.000Z",
        label: "deval",
        source: {
          _id: "src.b",
          title: "B",
          authority: "devaluation-notice",
          publishedDate: "2026-09-25T00:00:00.000Z",
        },
      },
      committedResolution: null,
    };

    const row: TraverseRow = {
      transferPartnerId: "tp.test",
      ratio: 1.0,
      transferTimeHours: 0,
      fromCurrency: { _id: "cur.x", code: "CUR_X", name: "Currency X" },
      toProgram: { _id: "prog.x", code: "PX", name: "Program X" },
      sourceRef: { _id: "src.t", title: "T", authority: "transfer-partner" },
      chartEntries: [
        {
          _id: "ace.x",
          pointsCost: 85000,
          taxesUsd: 100,
          effectiveDate: "2025-01-15T00:00:00.000Z",
          program: { _id: "prog.x", code: "PX", name: "Program X" },
          source: {
            _id: "src.a",
            title: "A",
            authority: "official-program",
            publishedDate: "2025-01-15T00:00:00.000Z",
          },
          contradictions: [contradiction],
        },
      ],
    };

    const [candidate] = toCandidates([row]);
    expect(candidate.contradiction).toEqual({
      id: "contra.x",
      status: "unresolved",
    });
    // Fail-closed: never carries a resolved price when the resolution is absent.
    expect(candidate.contradiction?.resolvedPointsCost).toBeUndefined();
  });

  // --- Case 11b: unresolved dominates when both kinds are present -----------
  it("maps an entry carrying BOTH a resolved and an unresolved contradiction to unresolved (fail-closed)", () => {
    const resolvedContradiction: ContradictionProjection = {
      _id: "contra.a.resolved",
      title: "resolved one",
      status: "resolved",
      explanation: "already resolved",
      claimA: {
        pointsCost: 85000,
        effectiveDate: "2025-01-15T00:00:00.000Z",
        label: "chart",
        source: {
          _id: "src.a",
          title: "A",
          authority: "official-program",
          publishedDate: "2025-01-15T00:00:00.000Z",
        },
      },
      claimB: {
        pointsCost: 90000,
        effectiveDate: "2026-09-25T00:00:00.000Z",
        label: "deval",
        source: {
          _id: "src.b",
          title: "B",
          authority: "devaluation-notice",
          publishedDate: "2026-09-25T00:00:00.000Z",
        },
      },
      committedResolution: {
        chosenClaim: "B",
        chosenPointsCost: 90000,
        rationale: "deval supersedes",
        chosenSource: { _id: "src.b", title: "B", authority: "devaluation-notice" },
      },
    };

    const unresolvedContradiction: ContradictionProjection = {
      ...resolvedContradiction,
      _id: "contra.b.unresolved",
      title: "unresolved one",
      committedResolution: null,
    };

    const row: TraverseRow = {
      transferPartnerId: "tp.test",
      ratio: 1.0,
      transferTimeHours: 0,
      fromCurrency: { _id: "cur.x", code: "CUR_X", name: "Currency X" },
      toProgram: { _id: "prog.x", code: "PX", name: "Program X" },
      sourceRef: { _id: "src.t", title: "T", authority: "transfer-partner" },
      chartEntries: [
        {
          _id: "ace.x",
          pointsCost: 85000,
          taxesUsd: 100,
          effectiveDate: "2025-01-15T00:00:00.000Z",
          program: { _id: "prog.x", code: "PX", name: "Program X" },
          source: {
            _id: "src.a",
            title: "A",
            authority: "official-program",
            publishedDate: "2025-01-15T00:00:00.000Z",
          },
          // Deliberately list the resolved one FIRST to prove selection is by
          // kind (unresolved dominates), not by array position.
          contradictions: [resolvedContradiction, unresolvedContradiction],
        },
      ],
    };

    const [candidate] = toCandidates([row]);
    expect(candidate.contradiction).toEqual({
      id: "contra.b.unresolved",
      status: "unresolved",
    });
  });

  // --- ratio invariant (fail-closed data error) -----------------------------
  it("throws SolverInvariantError on a non-positive ratio (bad seed)", () => {
    const row: TraverseRow = {
      ...SFO_NRT_BUSINESS_ROWS[0],
      ratio: 0,
    };
    expect(() => toCandidates([row])).toThrow(SolverInvariantError);
  });
});
