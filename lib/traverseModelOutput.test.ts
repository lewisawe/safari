// lib/traverseModelOutput.test.ts — the model never sees per-routing prices.
import { describe, it, expect } from "vitest";
import { summarizeTraverseForModel } from "./traverseModelOutput";
import { SFO_NRT_BUSINESS_ROWS } from "./fixtures/sfo-nrt-business.rows";

/** Collect every key path whose last key matches `key`. */
function findKey(v: unknown, key: string, path = "$"): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => findKey(x, key, `${path}[${i}]`));
  if (v && typeof v === "object") {
    return Object.entries(v).flatMap(([k, x]) =>
      (k === key ? [`${path}.${k}`] : []).concat(findKey(x, key, `${path}.${k}`)),
    );
  }
  return [];
}

describe("summarizeTraverseForModel", () => {
  const summary = summarizeTraverseForModel({
    rows: SFO_NRT_BUSINESS_ROWS,
    gatingAuthority: "gate note",
    via: "context-mcp",
    knowledgeBase: { via: "context-mcp (knowledge_base mode)", paths: ["award_pricing/devaluations"], markdown: "# Devaluation", citations: [], presentationOnly: true },
  });

  it("keeps routing structure: ids, programs, currencies", () => {
    expect(summary.routings.length).toBe(SFO_NRT_BUSINESS_ROWS.length);
    expect(summary.routings.map((r) => r.routingId)).toEqual(
      SFO_NRT_BUSINESS_ROWS.map((r) => r.transferPartnerId),
    );
    expect(summary.routings.map((r) => r.toProgram?.code)).toEqual(
      SFO_NRT_BUSINESS_ROWS.map((r) => r.toProgram.code),
    );
    expect(summary.routings.map((r) => r.fromCurrency?.code)).toEqual(
      SFO_NRT_BUSINESS_ROWS.map((r) => r.fromCurrency.code),
    );
  });

  it("withholds per-routing pointsCost, taxesUsd and ratio", () => {
    expect(findKey(summary, "taxesUsd")).toEqual([]);
    expect(findKey(summary, "ratio")).toEqual([]);
    // pointsCost survives ONLY inside a contradiction claim.
    for (const p of findKey(summary, "pointsCost")) {
      expect(p).toMatch(/\.contradictions\[\d+\]\.claim[AB]\.pointsCost$/);
    }
    const json = JSON.stringify(summary);
    // VS 95,000 and AC 105,000 are per-routing chart prices, never claims.
    expect(json).not.toContain("95000");
    expect(json).not.toContain("105000");
  });

  it("keeps the contradiction with both claims and sources", () => {
    const contradictions = summary.routings.flatMap((r) =>
      r.chartEntries.flatMap((e) => e.contradictions),
    );
    expect(contradictions.length).toBeGreaterThan(0);
    const c = contradictions[0];
    expect(c.contradictionId).toBe("contra.ana.sfonrt.business");
    expect(c.resolved).toBe(false);
    expect(c.claimA?.pointsCost).toBe(85000);
    expect(c.claimA?.source?._id).toBe("src.ana.chart");
    expect(c.claimB?.pointsCost).toBe(90000);
    expect(c.claimB?.source?._id).toBe("src.ana.deval");
  });

  it("passes the KB evidence through and carries the runSolver-only note", () => {
    expect(summary.knowledgeBase).toMatchObject({ paths: ["award_pricing/devaluations"] });
    expect(summary.note).toMatch(/runSolver/);
  });
});
