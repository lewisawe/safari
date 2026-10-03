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
// notice, effective 2026-09-25) conflict on ANA SFO→NRT business. The numbers
// match the chart entries and claims exactly. Excerpts are evidence only; the
// solver never reads them.

import { createClient } from "@sanity/client";

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

// Deterministic derived id for the carry-forward decision (mirrors
// lib/resolution.ts userDecisionId); kept inline so the seed has no runtime
// dependency on app code.
const CONTRADICTION_ID = "contra.ana.sfonrt.business";
const USER_DECISION_ID = `userDecision.${CONTRADICTION_ID}`;

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
];

// ----------------------------------------------------------------------------
// §5.2 Programs
// ----------------------------------------------------------------------------

const programs = [
  { _id: "prog.ana", _type: "program", code: "ANA", name: "ANA Mileage Club", synthetic: true },
  { _id: "prog.vs", _type: "program", code: "VS", name: "Virgin Atlantic Flying Club", synthetic: true },
  { _id: "prog.ac", _type: "program", code: "AC", name: "Air Canada Aeroplan", synthetic: true },
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
      "SYNTHETIC — not real award pricing. ANA Mileage Club partner award chart (printed edition, published 2025-01-15). Business class, San Francisco (SFO) to Tokyo Narita (NRT), one-way on a partner itinerary: 85,000 points. Taxes and carrier surcharges are collected separately at booking.",
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
      "SYNTHETIC — not real award pricing. Virgin Atlantic Flying Club partner chart (published 2025-03-01). Business class, San Francisco (SFO) to Tokyo Narita (NRT), one-way on a partner itinerary: 95,000 points.",
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
      "SYNTHETIC — not real award pricing. Air Canada Aeroplan partner chart (published 2025-02-10). Business class, San Francisco (SFO) to Tokyo Narita (NRT), one-way on a partner itinerary: 105,000 points.",
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
      "SYNTHETIC — not real transfer terms. Transfer partner ratio table (2026-01-01): Amex Membership Rewards → ANA Mileage Club 1:1 (about 48 hours to post); Amex Membership Rewards → Virgin Atlantic Flying Club 1:1 (instant); Chase Ultimate Rewards → Virgin Atlantic Flying Club 1:1 (instant); Chase Ultimate Rewards → Air Canada Aeroplan 1:1 (instant).",
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
    contradictionDoc,
  ];

  // createOrReplace every doc in one transaction so the import is idempotent
  // and atomic (no partial-write window).
  let tx = client.transaction();
  for (const doc of allDocs) {
    tx = tx.createOrReplace(doc);
  }
  // Reset the gate: delete any derived userDecision so a fresh seed always
  // restores the always-fires demo state (§5.6, §7.4). delete is a no-op if
  // the doc does not exist.
  tx = tx.delete(USER_DECISION_ID);

  await tx.commit();

  console.log(
    `[seed] Imported ${allDocs.length} synthetic docs to project ${projectId}, dataset "${dataset}".`,
  );
  console.log(
    `[seed] Reset gate: deleted ${USER_DECISION_ID} and wrote ${CONTRADICTION_ID} with no committedResolution (unresolved).`,
  );
}

seed().catch((err) => {
  console.error("\n[seed] Import failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
