// scripts/seed.ts
//
// Idempotent import of the exact design §5 synthetic dataset, with FIXED _ids
// so references and the engineered contradiction wire up reliably and reseeds
// are idempotent. Run via `npm run seed` (tsx).
//
// Fail-closed env contract (FEAT-003 / §5.6): SANITY_PROJECT_ID and
// SANITY_API_WRITE_TOKEN are REQUIRED. If either is missing we print a clear
// message pointing at the README and exit non-zero BEFORE constructing a client
// or writing anything — never a silent partial write and never a guessed value.
//
// Gate reset (§5.6, §7.4 fresh-demo): the contradiction is written with NO
// committedResolution field (absence is the unresolved signal), and the derived
// userDecision id is DELETED so every fresh seed restores the always-fires gate.
//
// Source excerpts (Sanity Context Knowledge Base): every source carries a short
// SYNTHETIC prose `excerpt`. A Knowledge Base built from this dataset reads
// them, so it can detect the 85,000 (printed chart) vs 90,000 (devaluation
// notice, effective 2026-09-25) conflict on ANA SFO→NRT business, and the
// 25,000 (official chart) vs 20,000 (points blog) conflict on Virgin Atlantic
// JFK→LHR economy. The numbers match the chart entries and claims exactly.
// Excerpts are evidence only; the solver never reads them.
//
// Extra routes (all SYNTHETIC) so the demo works for more than one trip:
//   • JFK→LHR business, Capital One only: BA 60,000 beats AV 52,000 because
//     Capital One → LifeMiles is 2:1.5 (52,000 / 0.75 = 69,334 of your miles).
//   • LAX→SYD business, Chase + Capital One: AC 90,000 beats AV 104,000.
//   • JFK→LHR economy, Amex: blog (aggregator, newer) vs chart (official);
//     authority beats recency, so the chart's 25,000 stands.
//   • SFO→NRT first, Chase only: no valid routing (only ANA prices it).

import { createClient } from "@sanity/client";
import {
  DEMO_CONTRADICTION_ID,
  DEMO_CONTRADICTION_IDS,
  demoUserDecisionId,
} from "../lib/demoReset";

// ----------------------------------------------------------------------------
// 0. Fail-closed env check (before any client / any write).
// ----------------------------------------------------------------------------

const projectId = process.env.SANITY_PROJECT_ID;
const writeToken = process.env.SANITY_API_WRITE_TOKEN;
const dataset = process.env.SANITY_DATASET ?? "production";

function fail(message: string): never {
  console.error(`\n[seed] ${message}\n`);
  console.error(
    "See README.md → \"Seed the dataset\" for how to set SANITY_PROJECT_ID and " +
      "SANITY_API_WRITE_TOKEN (e.g. in .env.local). No documents were written.\n",
  );
  process.exit(1);
}

if (!projectId || !writeToken) {
  const missing = [
    !projectId ? "SANITY_PROJECT_ID" : null,
    !writeToken ? "SANITY_API_WRITE_TOKEN" : null,
  ]
    .filter(Boolean)
    .join(" and ");
  fail(`Missing required environment variable(s): ${missing}.`);
}

// Narrow to defined after the fail-closed guard above (process.exit is `never`).
const client = createClient({
  projectId,
  dataset,
  token: writeToken,
  apiVersion: "2025-01-01",
  useCdn: false,
});

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const ref = (id: string) => ({ _type: "reference" as const, _ref: id });

// Deterministic ids for the gates (the contradictions and their derived
// carry-forward decisions). Shared with POST /api/demo/reset via
// lib/demoReset.ts, which only holds constants and a type import.
const CONTRADICTION_ID = DEMO_CONTRADICTION_ID;
const VS_CONTRADICTION_ID = "contra.vs.jfklhr.economy";
for (const id of [CONTRADICTION_ID, VS_CONTRADICTION_ID]) {
  if (!(DEMO_CONTRADICTION_IDS as readonly string[]).includes(id)) {
    fail(`internal: ${id} is missing from DEMO_CONTRADICTION_IDS.`);
  }
}

// ----------------------------------------------------------------------------
// §5.1 Currencies
// ----------------------------------------------------------------------------

const currencies = [
  {
    _id: "cur.amex",
    _type: "pointsCurrency",
    code: "AMEX_MR",
    name: "American Express Membership Rewards",
    synthetic: true,
  },
  {
    _id: "cur.chase",
    _type: "pointsCurrency",
    code: "CHASE_UR",
    name: "Chase Ultimate Rewards",
    synthetic: true,
  },
  {
    _id: "cur.capone",
    _type: "pointsCurrency",
    code: "CAPONE",
    name: "Capital One Miles",
    synthetic: true,
  },
];

// ----------------------------------------------------------------------------
// §5.2 Programs
// ----------------------------------------------------------------------------

const programs = [
  { _id: "prog.ana", _type: "program", code: "ANA", name: "ANA Mileage Club", synthetic: true },
  { _id: "prog.vs", _type: "program", code: "VS", name: "Virgin Atlantic Flying Club", synthetic: true },
  { _id: "prog.ac", _type: "program", code: "AC", name: "Air Canada Aeroplan", synthetic: true },
  { _id: "prog.av", _type: "program", code: "AV", name: "Avianca LifeMiles", synthetic: true },
  { _id: "prog.ba", _type: "program", code: "BA", name: "British Airways Executive Club", synthetic: true },
];

// ----------------------------------------------------------------------------
// §5.3 Sources (all urls on the reserved example.invalid host — N4)
// ----------------------------------------------------------------------------

const sources = [
  {
    _id: "src.ana.chart",
    _type: "source",
    title: "ANA Award Chart (Partner, Business)",
    authority: "official-program",
    publishedDate: "2025-01-15T00:00:00.000Z",
    url: "https://example.invalid/ana-chart",
    excerpt:
      "SYNTHETIC — not real award pricing. ANA Mileage Club partner award chart (printed edition, published 2025-01-15). Business class, San Francisco (SFO) to Tokyo Narita (NRT), one-way on a partner itinerary: 85,000 points. Same route, economy: 35,000 points; first class: 110,000 points. Taxes and carrier surcharges are collected separately at booking.",
    synthetic: true,
  },
  {
    _id: "src.ana.deval",
    _type: "source",
    title: "ANA Devaluation Notice",
    authority: "devaluation-notice",
    publishedDate: "2026-09-25T00:00:00.000Z",
    url: "https://example.invalid/ana-devaluation",
    excerpt:
      "SYNTHETIC — not real award pricing. ANA devaluation notice. Effective 2026-09-25, business-class partner awards from San Francisco (SFO) to Tokyo Narita (NRT) rise to 90,000 points one-way. This notice supersedes the 85,000-point price in the printed partner award chart.",
    synthetic: true,
  },
  {
    _id: "src.vs.chart",
    _type: "source",
    title: "Virgin Atlantic Partner Chart",
    authority: "official-program",
    publishedDate: "2025-03-01T00:00:00.000Z",
    url: "https://example.invalid/vs-chart",
    excerpt:
      "SYNTHETIC — not real award pricing. Virgin Atlantic Flying Club partner chart (published 2025-03-01). Business class, San Francisco (SFO) to Tokyo Narita (NRT), one-way on a partner itinerary: 95,000 points. New York (JFK) to London Heathrow (LHR), one-way: economy 25,000 points; business 57,500 points.",
    synthetic: true,
  },
  {
    _id: "src.ac.chart",
    _type: "source",
    title: "Aeroplan Partner Chart",
    authority: "official-program",
    publishedDate: "2025-02-10T00:00:00.000Z",
    url: "https://example.invalid/ac-chart",
    excerpt:
      "SYNTHETIC — not real award pricing. Air Canada Aeroplan partner chart (published 2025-02-10). Business class, San Francisco (SFO) to Tokyo Narita (NRT), one-way on a partner itinerary: 105,000 points. Same route, economy: 37,500 points. Business class, Los Angeles (LAX) to Sydney (SYD), one-way: 90,000 points.",
    synthetic: true,
  },
  {
    _id: "src.transfer",
    _type: "source",
    title: "Transfer Partner Ratio Table",
    authority: "transfer-partner",
    publishedDate: "2026-01-01T00:00:00.000Z",
    url: "https://example.invalid/transfer-ratios",
    excerpt:
      "SYNTHETIC — not real transfer terms. Transfer partner ratio table (2026-01-01): Amex Membership Rewards → ANA Mileage Club 1:1 (about 48 hours to post); Amex Membership Rewards → Virgin Atlantic Flying Club 1:1 (instant); Amex Membership Rewards → British Airways Executive Club 1:1 (instant); Chase Ultimate Rewards → Virgin Atlantic Flying Club 1:1 (instant); Chase Ultimate Rewards → Air Canada Aeroplan 1:1 (instant); Chase Ultimate Rewards → British Airways Executive Club 1:1 (instant); Capital One Miles → Avianca LifeMiles 2:1.5, i.e. 2 Capital One miles become 1.5 LifeMiles (0.75 per mile, about 24 hours to post); Capital One Miles → British Airways Executive Club 1:1 (instant).",
    synthetic: true,
  },
  {
    _id: "src.ba.chart",
    _type: "source",
    title: "British Airways Award Chart",
    authority: "official-program",
    publishedDate: "2025-04-01T00:00:00.000Z",
    url: "https://example.invalid/ba-chart",
    excerpt:
      "SYNTHETIC — not real award pricing. British Airways Executive Club award chart (published 2025-04-01). New York (JFK) to London Heathrow (LHR), one-way: economy 26,000 points; business 60,000 points.",
    synthetic: true,
  },
  {
    _id: "src.av.chart",
    _type: "source",
    title: "Avianca LifeMiles Award Chart",
    authority: "official-program",
    publishedDate: "2025-05-01T00:00:00.000Z",
    url: "https://example.invalid/av-chart",
    excerpt:
      "SYNTHETIC — not real award pricing. Avianca LifeMiles partner award chart (published 2025-05-01). New York (JFK) to London Heathrow (LHR), one-way: economy 22,000 LifeMiles; business 52,000 LifeMiles. Los Angeles (LAX) to Sydney (SYD), business, one-way: 78,000 LifeMiles.",
    synthetic: true,
  },
  {
    _id: "src.vs.blog",
    _type: "source",
    title: "Points Blog: Virgin Atlantic Award Sale",
    authority: "aggregator",
    publishedDate: "2026-09-28T00:00:00.000Z",
    url: "https://example.invalid/points-blog-vs-sale",
    excerpt:
      "SYNTHETIC — not real award pricing. A points blog post (2026-09-28) reports a Virgin Atlantic Flying Club sale: New York (JFK) to London Heathrow (LHR) economy for 20,000 points one-way. This is a third-party report, not the official Virgin Atlantic chart, which lists 25,000 points.",
    synthetic: true,
  },
];

// ----------------------------------------------------------------------------
// §5.4 Transfer partners (all reference src.transfer)
// ----------------------------------------------------------------------------

const transferPartners = [
  {
    _id: "tp.amex.ana",
    _type: "transferPartner",
    fromCurrency: ref("cur.amex"),
    toProgram: ref("prog.ana"),
    ratio: 1.0,
    transferTimeHours: 48,
    sourceRef: ref("src.transfer"),
    synthetic: true,
  },
  {
    _id: "tp.amex.vs",
    _type: "transferPartner",
    fromCurrency: ref("cur.amex"),
    toProgram: ref("prog.vs"),
    ratio: 1.0,
    transferTimeHours: 0,
    sourceRef: ref("src.transfer"),
    synthetic: true,
  },
  {
    _id: "tp.chase.vs",
    _type: "transferPartner",
    fromCurrency: ref("cur.chase"),
    toProgram: ref("prog.vs"),
    ratio: 1.0,
    transferTimeHours: 0,
    sourceRef: ref("src.transfer"),
    synthetic: true,
  },
  {
    _id: "tp.chase.ac",
    _type: "transferPartner",
    fromCurrency: ref("cur.chase"),
    toProgram: ref("prog.ac"),
    ratio: 1.0,
    transferTimeHours: 0,
    sourceRef: ref("src.transfer"),
    synthetic: true,
  },
  {
    _id: "tp.amex.ba",
    _type: "transferPartner",
    fromCurrency: ref("cur.amex"),
    toProgram: ref("prog.ba"),
    ratio: 1.0,
    transferTimeHours: 0,
    sourceRef: ref("src.transfer"),
    synthetic: true,
  },
  {
    _id: "tp.chase.ba",
    _type: "transferPartner",
    fromCurrency: ref("cur.chase"),
    toProgram: ref("prog.ba"),
    ratio: 1.0,
    transferTimeHours: 0,
    sourceRef: ref("src.transfer"),
    synthetic: true,
  },
  {
    // 2 Capital One miles -> 1.5 LifeMiles: 0.75 program points per mile.
    _id: "tp.capone.av",
    _type: "transferPartner",
    fromCurrency: ref("cur.capone"),
    toProgram: ref("prog.av"),
    ratio: 0.75,
    transferTimeHours: 24,
    sourceRef: ref("src.transfer"),
    synthetic: true,
  },
  {
    _id: "tp.capone.ba",
    _type: "transferPartner",
    fromCurrency: ref("cur.capone"),
    toProgram: ref("prog.ba"),
    ratio: 1.0,
    transferTimeHours: 0,
    sourceRef: ref("src.transfer"),
    synthetic: true,
  },
];

// ----------------------------------------------------------------------------
// §5.5 Award-chart entries — SFO→NRT, business
// ----------------------------------------------------------------------------

const chartEntries = [
  {
    _id: "ace.ana",
    _type: "awardChartEntry",
    program: ref("prog.ana"),
    origin: "SFO",
    destination: "NRT",
    cabin: "business",
    pointsCost: 85000,
    taxesUsd: 180,
    sourceRef: ref("src.ana.chart"),
    effectiveDate: "2025-01-15T00:00:00.000Z",
    synthetic: true,
  },
  {
    _id: "ace.vs",
    _type: "awardChartEntry",
    program: ref("prog.vs"),
    origin: "SFO",
    destination: "NRT",
    cabin: "business",
    pointsCost: 95000,
    taxesUsd: 350,
    sourceRef: ref("src.vs.chart"),
    effectiveDate: "2025-03-01T00:00:00.000Z",
    synthetic: true,
  },
  {
    _id: "ace.ac",
    _type: "awardChartEntry",
    program: ref("prog.ac"),
    origin: "SFO",
    destination: "NRT",
    cabin: "business",
    pointsCost: 105000,
    taxesUsd: 400,
    sourceRef: ref("src.ac.chart"),
    effectiveDate: "2025-02-10T00:00:00.000Z",
    synthetic: true,
  },
];

// ----------------------------------------------------------------------------
// Extra award-chart entries (SYNTHETIC) — more trips for the demo.
// ----------------------------------------------------------------------------

function entry(
  _id: string,
  program: string,
  origin: string,
  destination: string,
  cabin: "economy" | "premium" | "business" | "first",
  pointsCost: number,
  taxesUsd: number,
  source: string,
  effectiveDate: string,
) {
  return {
    _id,
    _type: "awardChartEntry",
    program: ref(program),
    origin,
    destination,
    cabin,
    pointsCost,
    taxesUsd,
    sourceRef: ref(source),
    effectiveDate,
    synthetic: true,
  };
}

const ANA_DATE = "2025-01-15T00:00:00.000Z";
const VS_DATE = "2025-03-01T00:00:00.000Z";
const AC_DATE = "2025-02-10T00:00:00.000Z";
const BA_DATE = "2025-04-01T00:00:00.000Z";
const AV_DATE = "2025-05-01T00:00:00.000Z";

const extraChartEntries = [
  // SFO→NRT economy and first (first: ANA only, so Chase alone has no routing).
  entry("ace.ana.sfonrt.economy", "prog.ana", "SFO", "NRT", "economy", 35000, 90, "src.ana.chart", ANA_DATE),
  entry("ace.ac.sfonrt.economy", "prog.ac", "SFO", "NRT", "economy", 37500, 110, "src.ac.chart", AC_DATE),
  entry("ace.ana.sfonrt.first", "prog.ana", "SFO", "NRT", "first", 110000, 500, "src.ana.chart", ANA_DATE),
  // JFK→LHR economy. The VS entry stores claim A (the official chart), the
  // same pattern as ace.ana storing 85,000; its contradiction gates it.
  entry("ace.vs.jfklhr.economy", "prog.vs", "JFK", "LHR", "economy", 25000, 120, "src.vs.chart", VS_DATE),
  entry("ace.ba.jfklhr.economy", "prog.ba", "JFK", "LHR", "economy", 26000, 110, "src.ba.chart", BA_DATE),
  entry("ace.av.jfklhr.economy", "prog.av", "JFK", "LHR", "economy", 22000, 60, "src.av.chart", AV_DATE),
  // JFK→LHR business: AV has fewer program points but loses on Capital One.
  entry("ace.ba.jfklhr.business", "prog.ba", "JFK", "LHR", "business", 60000, 450, "src.ba.chart", BA_DATE),
  entry("ace.av.jfklhr.business", "prog.av", "JFK", "LHR", "business", 52000, 180, "src.av.chart", AV_DATE),
  entry("ace.vs.jfklhr.business", "prog.vs", "JFK", "LHR", "business", 57500, 420, "src.vs.chart", VS_DATE),
  // LAX→SYD business.
  entry("ace.ac.laxsyd.business", "prog.ac", "LAX", "SYD", "business", 90000, 250, "src.ac.chart", AC_DATE),
  entry("ace.av.laxsyd.business", "prog.av", "LAX", "SYD", "business", 78000, 200, "src.av.chart", AV_DATE),
];

// ----------------------------------------------------------------------------
// §5.6 The engineered contradiction — THE gate.
// Written with NO committedResolution field (absence = unresolved signal).
// ----------------------------------------------------------------------------

const contradictionDoc = {
  _id: CONTRADICTION_ID,
  _type: "contradiction",
  title: "ANA SFO→NRT Business: 85k chart vs 90k devaluation",
  subjectEntry: ref("ace.ana"),
  claimA: {
    _type: "claim",
    pointsCost: 85000,
    source: ref("src.ana.chart"),
    effectiveDate: "2025-01-15T00:00:00.000Z",
    label: "Printed award chart",
  },
  claimB: {
    _type: "claim",
    pointsCost: 90000,
    source: ref("src.ana.deval"),
    effectiveDate: "2026-09-25T00:00:00.000Z",
    label: "Devaluation notice (effective last week)",
  },
  explanation:
    "The printed chart lists 85k, but a devaluation notice raised the ANA SFO→NRT business award to 90k effective 2026-09-25, superseding the chart.",
  status: "unresolved",
  // committedResolution: intentionally omitted — absence is the unresolved signal (§4.6).
  synthetic: true,
};

// Second gate: a newer points-blog report undercuts the official chart.
// Precedence picks claim A (official-program outranks aggregator), so the
// gate does not simply take the newer or the cheaper number.
const vsContradictionDoc = {
  _id: VS_CONTRADICTION_ID,
  _type: "contradiction",
  title: "Virgin Atlantic JFK→LHR Economy: 25k chart vs 20k blog report",
  subjectEntry: ref("ace.vs.jfklhr.economy"),
  claimA: {
    _type: "claim",
    pointsCost: 25000,
    source: ref("src.vs.chart"),
    effectiveDate: VS_DATE,
    label: "Official award chart",
  },
  claimB: {
    _type: "claim",
    pointsCost: 20000,
    source: ref("src.vs.blog"),
    effectiveDate: "2026-09-28T00:00:00.000Z",
    label: "Points blog sale report",
  },
  explanation:
    "The official Virgin Atlantic chart lists JFK→LHR economy at 25k, but a points blog reported a 20k sale on 2026-09-28. The blog is newer, yet it is a third-party aggregator, so the official chart outranks it.",
  status: "unresolved",
  // committedResolution: intentionally omitted — absence is the unresolved signal (§4.6).
  synthetic: true,
};

// ----------------------------------------------------------------------------
// Run
// ----------------------------------------------------------------------------

async function seed(): Promise<void> {
  // Heterogeneous doc set; typed as a common identified-document stub so the
  // transaction's createOrReplace does not infer the shape of the first element
  // and reject the rest. Every doc carries a fixed _id and _type.
  const allDocs: Array<Record<string, unknown> & { _id: string; _type: string }> = [
    ...currencies,
    ...programs,
    ...sources,
    ...transferPartners,
    ...chartEntries,
    ...extraChartEntries,
    contradictionDoc,
    vsContradictionDoc,
  ];

  // createOrReplace every doc in one transaction so the import is idempotent
  // and atomic (no partial-write window).
  let tx = client.transaction();
  for (const doc of allDocs) {
    tx = tx.createOrReplace(doc);
  }
  // Reset the gates: delete any derived userDecision so a fresh seed always
  // restores the always-fires demo state (§5.6, §7.4). delete is a no-op if
  // the doc does not exist.
  // Covers every demo contradiction (same fixed ids as POST /api/demo/reset).
  for (const id of DEMO_CONTRADICTION_IDS) {
    tx = tx.delete(demoUserDecisionId(id));
  }

  await tx.commit();

  console.log(
    `[seed] Imported ${allDocs.length} synthetic docs to project ${projectId}, dataset "${dataset}".`,
  );
  console.log(
    `[seed] Reset gates: deleted ${DEMO_CONTRADICTION_IDS.map(demoUserDecisionId).join(", ")} and wrote ${DEMO_CONTRADICTION_IDS.join(", ")} with no committedResolution (unresolved).`,
  );
}

seed().catch((err) => {
  console.error("\n[seed] Import failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
