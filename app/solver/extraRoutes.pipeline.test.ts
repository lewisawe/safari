// app/solver/extraRoutes.pipeline.test.ts
//
// Locks the intent of the extra SYNTHETIC routes in scripts/seed.ts with the
// REAL pure pipeline (toCandidates -> solve -> lib/resolution -> solve). The
// in-test dataset mirrors the seed (same ids, ratios, prices, authorities and
// dates); a tiny in-memory traversal mirrors the §6 GROQ query so the rows are
// derived from the data the same way the live query derives them. The
// original SFO→NRT business fixture and its tests are untouched.
//
//   1. JFK→LHR business, Capital One:   BA 60,000 beats AV (52,000 / 0.75 = 69,334)
//   2. LAX→SYD business, Chase + C1:    AC 90,000 beats AV 104,000
//   3. JFK→LHR economy, Amex:           gate fires; chart (A, 25,000) beats the
//                                       newer blog (B, 20,000); VS 25,000 beats BA 26,000
//   4. SFO→NRT first, Chase:            NO_VALID_ROUTING

import { describe, it, expect } from "vitest";
import type {
  TraverseRow,
  ContradictionProjection,
  ClaimProjection,
} from "@/lib/fixtures/sfo-nrt-business.rows";
import { toCandidates } from "@/lib/toCandidates";
import { resolve } from "@/lib/resolution";
import { solve } from "@/solver/solve";
import type { Cabin, SolveResult } from "@/solver/types";

// --- Mirror of the seed ------------------------------------------------------

const CUR = {
  "cur.amex": { _id: "cur.amex", code: "AMEX_MR", name: "American Express Membership Rewards" },
  "cur.chase": { _id: "cur.chase", code: "CHASE_UR", name: "Chase Ultimate Rewards" },
  "cur.capone": { _id: "cur.capone", code: "CAPONE", name: "Capital One Miles" },
} as const;

const PROG = {
  "prog.ana": { _id: "prog.ana", code: "ANA", name: "ANA Mileage Club" },
  "prog.vs": { _id: "prog.vs", code: "VS", name: "Virgin Atlantic Flying Club" },
  "prog.ac": { _id: "prog.ac", code: "AC", name: "Air Canada Aeroplan" },
  "prog.av": { _id: "prog.av", code: "AV", name: "Avianca LifeMiles" },
  "prog.ba": { _id: "prog.ba", code: "BA", name: "British Airways Executive Club" },
} as const;

const SRC = {
  "src.ana.chart": { _id: "src.ana.chart", title: "ANA Award Chart (Partner, Business)", authority: "official-program", publishedDate: "2025-01-15T00:00:00.000Z" },
  "src.vs.chart": { _id: "src.vs.chart", title: "Virgin Atlantic Partner Chart", authority: "official-program", publishedDate: "2025-03-01T00:00:00.000Z" },
  "src.ac.chart": { _id: "src.ac.chart", title: "Aeroplan Partner Chart", authority: "official-program", publishedDate: "2025-02-10T00:00:00.000Z" },
  "src.ba.chart": { _id: "src.ba.chart", title: "British Airways Award Chart", authority: "official-program", publishedDate: "2025-04-01T00:00:00.000Z" },
  "src.av.chart": { _id: "src.av.chart", title: "Avianca LifeMiles Award Chart", authority: "official-program", publishedDate: "2025-05-01T00:00:00.000Z" },
  "src.vs.blog": { _id: "src.vs.blog", title: "Points Blog: Virgin Atlantic Award Sale", authority: "aggregator", publishedDate: "2026-09-28T00:00:00.000Z" },
  "src.transfer": { _id: "src.transfer", title: "Transfer Partner Ratio Table", authority: "transfer-partner", publishedDate: "2026-01-01T00:00:00.000Z" },
} as const;
type SrcId = keyof typeof SRC;

const TRANSFERS: { _id: string; from: keyof typeof CUR; to: keyof typeof PROG; ratio: number; hours: number }[] = [
  { _id: "tp.amex.ana", from: "cur.amex", to: "prog.ana", ratio: 1, hours: 48 },
  { _id: "tp.amex.vs", from: "cur.amex", to: "prog.vs", ratio: 1, hours: 0 },
  { _id: "tp.chase.vs", from: "cur.chase", to: "prog.vs", ratio: 1, hours: 0 },
  { _id: "tp.chase.ac", from: "cur.chase", to: "prog.ac", ratio: 1, hours: 0 },
  { _id: "tp.amex.ba", from: "cur.amex", to: "prog.ba", ratio: 1, hours: 0 },
  { _id: "tp.chase.ba", from: "cur.chase", to: "prog.ba", ratio: 1, hours: 0 },
  { _id: "tp.capone.av", from: "cur.capone", to: "prog.av", ratio: 0.75, hours: 24 },
  { _id: "tp.capone.ba", from: "cur.capone", to: "prog.ba", ratio: 1, hours: 0 },
];

interface Entry {
  _id: string;
  program: keyof typeof PROG;
  origin: string;
  destination: string;
  cabin: Cabin;
  pointsCost: number;
  taxesUsd: number;
  source: SrcId;
}

const ENTRIES: Entry[] = [
  // Original SFO→NRT business (unchanged).
  { _id: "ace.ana", program: "prog.ana", origin: "SFO", destination: "NRT", cabin: "business", pointsCost: 85000, taxesUsd: 180, source: "src.ana.chart" },
  { _id: "ace.vs", program: "prog.vs", origin: "SFO", destination: "NRT", cabin: "business", pointsCost: 95000, taxesUsd: 350, source: "src.vs.chart" },
  { _id: "ace.ac", program: "prog.ac", origin: "SFO", destination: "NRT", cabin: "business", pointsCost: 105000, taxesUsd: 400, source: "src.ac.chart" },
  // New.
  { _id: "ace.ana.sfonrt.economy", program: "prog.ana", origin: "SFO", destination: "NRT", cabin: "economy", pointsCost: 35000, taxesUsd: 90, source: "src.ana.chart" },
  { _id: "ace.ac.sfonrt.economy", program: "prog.ac", origin: "SFO", destination: "NRT", cabin: "economy", pointsCost: 37500, taxesUsd: 110, source: "src.ac.chart" },
  { _id: "ace.ana.sfonrt.first", program: "prog.ana", origin: "SFO", destination: "NRT", cabin: "first", pointsCost: 110000, taxesUsd: 500, source: "src.ana.chart" },
  { _id: "ace.vs.jfklhr.economy", program: "prog.vs", origin: "JFK", destination: "LHR", cabin: "economy", pointsCost: 25000, taxesUsd: 120, source: "src.vs.chart" },
  { _id: "ace.ba.jfklhr.economy", program: "prog.ba", origin: "JFK", destination: "LHR", cabin: "economy", pointsCost: 26000, taxesUsd: 110, source: "src.ba.chart" },
  { _id: "ace.av.jfklhr.economy", program: "prog.av", origin: "JFK", destination: "LHR", cabin: "economy", pointsCost: 22000, taxesUsd: 60, source: "src.av.chart" },
  { _id: "ace.ba.jfklhr.business", program: "prog.ba", origin: "JFK", destination: "LHR", cabin: "business", pointsCost: 60000, taxesUsd: 450, source: "src.ba.chart" },
  { _id: "ace.av.jfklhr.business", program: "prog.av", origin: "JFK", destination: "LHR", cabin: "business", pointsCost: 52000, taxesUsd: 180, source: "src.av.chart" },
  { _id: "ace.vs.jfklhr.business", program: "prog.vs", origin: "JFK", destination: "LHR", cabin: "business", pointsCost: 57500, taxesUsd: 420, source: "src.vs.chart" },
  { _id: "ace.ac.laxsyd.business", program: "prog.ac", origin: "LAX", destination: "SYD", cabin: "business", pointsCost: 90000, taxesUsd: 250, source: "src.ac.chart" },
  { _id: "ace.av.laxsyd.business", program: "prog.av", origin: "LAX", destination: "SYD", cabin: "business", pointsCost: 78000, taxesUsd: 200, source: "src.av.chart" },
];

function claim(pointsCost: number, effectiveDate: string, label: string, source: SrcId): ClaimProjection {
  return { pointsCost, effectiveDate, label, source: { ...SRC[source] } };
}

const CONTRADICTIONS: (ContradictionProjection & { subject: string })[] = [
  {
    subject: "ace.ana",
    _id: "contra.ana.sfonrt.business",
    title: "ANA SFO→NRT Business: 85k chart vs 90k devaluation",
    status: "unresolved",
    explanation: "",
    claimA: claim(85000, "2025-01-15T00:00:00.000Z", "Printed award chart", "src.ana.chart"),
    claimB: {
      pointsCost: 90000,
      effectiveDate: "2026-09-25T00:00:00.000Z",
      label: "Devaluation notice (effective last week)",
      source: { _id: "src.ana.deval", title: "ANA Devaluation Notice", authority: "devaluation-notice", publishedDate: "2026-09-25T00:00:00.000Z" },
    },
    committedResolution: null,
  },
  {
    subject: "ace.vs.jfklhr.economy",
    _id: "contra.vs.jfklhr.economy",
    title: "Virgin Atlantic JFK→LHR Economy: 25k chart vs 20k blog report",
    status: "unresolved",
    explanation: "",
    claimA: claim(25000, "2025-03-01T00:00:00.000Z", "Official award chart", "src.vs.chart"),
    claimB: claim(20000, "2026-09-28T00:00:00.000Z", "Points blog sale report", "src.vs.blog"),
    committedResolution: null,
  },
];

/** In-memory mirror of TRAVERSE_ROUTINGS_QUERY over the dataset above. */
function traverse(
  currencyIds: (keyof typeof CUR)[],
  origin: string,
  destination: string,
  cabin: Cabin,
  contradictions = CONTRADICTIONS,
): TraverseRow[] {
  return TRANSFERS.filter((t) => currencyIds.includes(t.from)).map((t) => ({
    transferPartnerId: t._id,
    ratio: t.ratio,
    transferTimeHours: t.hours,
    fromCurrency: { ...CUR[t.from] },
    toProgram: { ...PROG[t.to] },
    sourceRef: { _id: SRC["src.transfer"]._id, title: SRC["src.transfer"].title, authority: SRC["src.transfer"].authority },
    chartEntries: ENTRIES.filter(
      (e) => e.program === t.to && e.origin === origin && e.destination === destination && e.cabin === cabin,
    ).map((e) => ({
      _id: e._id,
      pointsCost: e.pointsCost,
      taxesUsd: e.taxesUsd,
      effectiveDate: SRC[e.source].publishedDate,
      program: { ...PROG[e.program] },
      source: { ...SRC[e.source] },
      contradictions: contradictions
        .filter((c) => c.subject === e._id)
        .map(({ subject: _s, ...c }) => structuredClone(c)),
    })),
  })) as TraverseRow[];
}

/** The /solver sequence: solve; if gated, resolve EACH blocking id, re-traverse once, re-solve. */
function runPipeline(currencyIds: (keyof typeof CUR)[], origin: string, destination: string, cabin: Cabin) {
  const gated = solve({ origin, destination, cabin, candidates: toCandidates(traverse(currencyIds, origin, destination, cabin)) });
  if (gated.kind !== "NOT_COMPUTED" || gated.reason !== "UNRESOLVED_CONTRADICTION") {
    return { gated, final: gated, resolutions: [] as ReturnType<typeof resolve>[] };
  }
  const ids = Array.from(new Set(gated.blockingContradictionIds ?? []));
  const resolutions = ids.map((id) => {
    const c = CONTRADICTIONS.find((x) => x._id === id)!;
    return { id, out: resolve({ _id: c._id, claimA: c.claimA, claimB: c.claimB }) };
  });
  // What the resolve write + re-traverse do: the committedResolution comes back.
  const written = CONTRADICTIONS.map((c) => {
    const r = resolutions.find((x) => x.id === c._id);
    if (!r) return c;
    return {
      ...c,
      status: "resolved",
      committedResolution: {
        chosenClaim: r.out.chosenClaim,
        chosenPointsCost: r.out.chosenPointsCost,
        rationale: r.out.rationale,
        chosenSource: { _id: r.out.chosenSource._id, title: r.out.chosenSource.title ?? "", authority: r.out.chosenSource.authority },
      },
    };
  });
  const final = solve({
    origin,
    destination,
    cabin,
    candidates: toCandidates(traverse(currencyIds, origin, destination, cabin, written)),
  });
  return { gated, final, resolutions: resolutions.map((r) => r.out) };
}

function summary(r: SolveResult) {
  if (r.kind !== "COMPUTED") return r;
  const fmt = (p: { currencyCode: string; programCode: string; effectivePointsCost: number; costInUserCurrency: number }) =>
    `${p.currencyCode}->${p.programCode} ${p.effectivePointsCost}/${p.costInUserCurrency}`;
  return { chosen: fmt(r.chosen), proof: r.proof.map(fmt), minimalityHolds: r.minimalityHolds };
}

describe("extra synthetic routes (mirrors scripts/seed.ts)", () => {
  it("1. JFK→LHR business, Capital One only: BA 60,000 beats AV's fewer program points", () => {
    const { gated, final } = runPipeline(["cur.capone"], "JFK", "LHR", "business");
    expect(gated.kind).toBe("COMPUTED");
    expect(summary(final)).toEqual({
      chosen: "CAPONE->BA 60000/60000",
      // 52,000 LifeMiles / 0.75 = 69,333.3 -> ceil 69,334 Capital One miles.
      proof: ["CAPONE->AV 52000/69334"],
      minimalityHolds: true,
    });
  });

  it("2. LAX→SYD business, Chase + Capital One: AC 90,000 beats AV 104,000", () => {
    const { final } = runPipeline(["cur.chase", "cur.capone"], "LAX", "SYD", "business");
    expect(summary(final)).toEqual({
      chosen: "CHASE_UR->AC 90000/90000",
      proof: ["CAPONE->AV 78000/104000"],
      minimalityHolds: true,
    });
  });

  it("3. JFK→LHR economy, Amex: the official chart beats the newer blog; VS 25,000 beats BA 26,000", () => {
    const { gated, final, resolutions } = runPipeline(["cur.amex"], "JFK", "LHR", "economy");
    expect(gated).toMatchObject({
      kind: "NOT_COMPUTED",
      reason: "UNRESOLVED_CONTRADICTION",
      blockingContradictionIds: ["contra.vs.jfklhr.economy"],
    });
    expect(resolutions).toHaveLength(1);
    // Authority beats recency: not the newer claim, not the cheaper claim.
    expect(resolutions[0]).toMatchObject({ chosenClaim: "A", chosenPointsCost: 25000 });
    expect(resolutions[0].chosenSource._id).toBe("src.vs.chart");
    expect(summary(final)).toEqual({
      chosen: "AMEX_MR->VS 25000/25000",
      // AV is not reachable from Amex.
      proof: ["AMEX_MR->BA 26000/26000"],
      minimalityHolds: true,
    });
  });

  it("4. SFO→NRT first, Chase only: NO_VALID_ROUTING (only ANA prices first)", () => {
    const { final } = runPipeline(["cur.chase"], "SFO", "NRT", "first");
    expect(final).toMatchObject({ kind: "NOT_COMPUTED", reason: "NO_VALID_ROUTING" });
  });

  it("5. SFO→NRT business, Amex + Chase: unchanged by the new data", () => {
    const { final, resolutions } = runPipeline(["cur.amex", "cur.chase"], "SFO", "NRT", "business");
    expect(resolutions[0]).toMatchObject({ chosenClaim: "B", chosenPointsCost: 90000 });
    expect(summary(final)).toEqual({
      chosen: "AMEX_MR->ANA 90000/90000",
      proof: ["AMEX_MR->VS 95000/95000", "CHASE_UR->VS 95000/95000", "CHASE_UR->AC 105000/105000"],
      minimalityHolds: true,
    });
  });
});
