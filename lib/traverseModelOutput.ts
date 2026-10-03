// lib/traverseModelOutput.ts
//
// The MODEL-FACING view of the traverseRoutings tool result (AI SDK v7
// `toModelOutput`). The UI still receives the full rows (QueryTrace /
// KBIssueView), but the model only sees routing structure, contradictions
// and Knowledge Base evidence: NO per-routing pointsCost, taxesUsd or ratio.
// Nova ignores the prompt rule against listing per-routing prices before
// runSolver, so the structural fix is that it never sees them.
//
// The contradiction's two claims keep their points + sources on purpose:
// naming the disagreement (85k chart vs 90k devaluation) is the point. Nothing
// here is a solver input: runSolver re-runs the fixed traversal server-side.
// Pure, client-safe (type-only imports).

import type { TraverseRow, ClaimProjection } from "./fixtures/sfo-nrt-business.rows";

export interface TraverseModelInput {
  rows: TraverseRow[];
  gatingAuthority: string;
  via?: string;
  knowledgeBase?: unknown;
}

const NOTE =
  "Per-routing points costs are intentionally withheld. The ONLY source of a points cost or verdict is runSolver; call it after resolving every unresolved contradiction.";

function claimSummary(c: ClaimProjection | null | undefined) {
  if (!c) return null;
  return {
    pointsCost: c.pointsCost,
    effectiveDate: c.effectiveDate,
    label: c.label,
    source: c.source ? { _id: c.source._id, title: c.source.title, authority: c.source.authority } : null,
  };
}

export function summarizeTraverseForModel(out: TraverseModelInput) {
  const routings = (out.rows ?? []).map((row) => ({
    routingId: row.transferPartnerId,
    fromCurrency: row.fromCurrency
      ? { _id: row.fromCurrency._id, code: row.fromCurrency.code }
      : null,
    toProgram: row.toProgram
      ? { _id: row.toProgram._id, code: row.toProgram.code, name: row.toProgram.name }
      : null,
    chartEntries: (row.chartEntries ?? []).map((e) => ({
      chartEntryId: e._id,
      program: e.program?.code ?? null,
      contradictions: (e.contradictions ?? []).map((c) => ({
        contradictionId: c._id,
        title: c.title,
        resolved: c.committedResolution != null,
        claimA: claimSummary(c.claimA),
        claimB: claimSummary(c.claimB),
      })),
    })),
  }));
  return {
    routings,
    gatingAuthority: out.gatingAuthority,
    via: out.via ?? null,
    knowledgeBase: out.knowledgeBase ?? null,
    note: NOTE,
  };
}
