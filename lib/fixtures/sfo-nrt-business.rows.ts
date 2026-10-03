// lib/fixtures/sfo-nrt-business.rows.ts
//
// Hand-authored GROQ RESULT for the demo query (design §6 shape), for the beat
// `currencies [cur.amex, cur.chase], SFO→NRT, business`. Built directly from the
// §5 synthetic dataset so the model-free pipeline and its tests can run with NO
// live Sanity — this is the offline substitute for a live traversal read.
//
// The row types below describe exactly what the §6 query projects (one
// `transferPartner` row, each with nested `chartEntries`, each with nested
// `contradictions`), and are the shape `toCandidates` (FEAT-004) consumes.
//
// KEY INVARIANT (FEAT-003 acceptance): the ace.ana entry carries an embedded
// contradiction whose `committedResolution === null` — i.e. unresolved. GROQ
// returns an absent inline object as `null`, so `null` here is the authentic
// representation of the "no committedResolution field was stored" state (§4.6).

// ----------------------------------------------------------------------------
// Projected row types (mirror of the §6 query projection)
// ----------------------------------------------------------------------------

export interface RowRef {
  _id: string;
  code: string;
  name: string;
}

export interface RowSourceRef {
  _id: string;
  title: string;
  authority: string;
}

/** A source as projected inside a claim (carries publishedDate too). */
export interface ClaimSourceProjection {
  _id: string;
  title: string;
  authority: string;
  publishedDate: string;
}

/** A claim as projected in §6 (source dereferenced). */
export interface ClaimProjection {
  pointsCost: number;
  effectiveDate: string;
  label: string;
  source: ClaimSourceProjection;
}

/** committedResolution as projected in §6 (null when absent/unresolved). */
export interface CommittedResolutionProjection {
  chosenClaim: "A" | "B";
  chosenPointsCost: number;
  rationale: string;
  chosenSource: RowSourceRef;
}

/** A contradiction as projected inside a chart entry (§6). */
export interface ContradictionProjection {
  _id: string;
  title: string;
  status: string;
  explanation: string;
  claimA: ClaimProjection;
  claimB: ClaimProjection;
  // Absent (unresolved) inline object comes back from GROQ as null.
  committedResolution: CommittedResolutionProjection | null;
}

/** A matching award-chart entry as projected inside a transferPartner row (§6). */
export interface ChartEntryProjection {
  _id: string;
  pointsCost: number;
  taxesUsd: number;
  effectiveDate: string;
  program: RowRef;
  source: RowSourceRef & { publishedDate: string };
  contradictions: ContradictionProjection[];
}

/** One transferPartner row, the top-level unit of the §6 traversal result. */
export interface TraverseRow {
  transferPartnerId: string;
  ratio: number;
  transferTimeHours: number;
  fromCurrency: RowRef;
  toProgram: RowRef;
  sourceRef: RowSourceRef;
  chartEntries: ChartEntryProjection[];
}

// ----------------------------------------------------------------------------
// Reused projected sub-objects (from §5 data)
// ----------------------------------------------------------------------------

const progAna: RowRef = { _id: "prog.ana", code: "ANA", name: "ANA Mileage Club" };
const progVs: RowRef = { _id: "prog.vs", code: "VS", name: "Virgin Atlantic Flying Club" };
const progAc: RowRef = { _id: "prog.ac", code: "AC", name: "Air Canada Aeroplan" };

const curAmex: RowRef = {
  _id: "cur.amex",
  code: "AMEX_MR",
  name: "American Express Membership Rewards",
};
const curChase: RowRef = {
  _id: "cur.chase",
  code: "CHASE_UR",
  name: "Chase Ultimate Rewards",
};

const srcTransfer: RowSourceRef = {
  _id: "src.transfer",
  title: "Transfer Partner Ratio Table",
  authority: "transfer-partner",
};

// The §6 engineered contradiction on ace.ana, projected with its two claims'
// sources dereferenced and committedResolution === null (unresolved).
const anaContradiction: ContradictionProjection = {
  _id: "contra.ana.sfonrt.business",
  title: "ANA SFO→NRT Business: 85k chart vs 90k devaluation",
  status: "unresolved",
  explanation:
    "The printed chart lists 85k, but a devaluation notice raised the ANA SFO→NRT business award to 90k effective 2026-09-25, superseding the chart.",
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
  // Absence of the stored object (unresolved) is GROQ-projected as null.
  committedResolution: null,
};

// Chart entries (one per program's matching SFO→NRT business award).
const aceAna: ChartEntryProjection = {
  _id: "ace.ana",
  pointsCost: 85000,
  taxesUsd: 180,
  effectiveDate: "2025-01-15T00:00:00.000Z",
  program: progAna,
  source: {
    _id: "src.ana.chart",
    title: "ANA Award Chart (Partner, Business)",
    authority: "official-program",
    publishedDate: "2025-01-15T00:00:00.000Z",
  },
  // The gate lives here: an unresolved contradiction (committedResolution null).
  contradictions: [anaContradiction],
};

const aceVs: ChartEntryProjection = {
  _id: "ace.vs",
  pointsCost: 95000,
  taxesUsd: 350,
  effectiveDate: "2025-03-01T00:00:00.000Z",
  program: progVs,
  source: {
    _id: "src.vs.chart",
    title: "Virgin Atlantic Partner Chart",
    authority: "official-program",
    publishedDate: "2025-03-01T00:00:00.000Z",
  },
  contradictions: [],
};

const aceAc: ChartEntryProjection = {
  _id: "ace.ac",
  pointsCost: 105000,
  taxesUsd: 400,
  effectiveDate: "2025-02-10T00:00:00.000Z",
  program: progAc,
  source: {
    _id: "src.ac.chart",
    title: "Aeroplan Partner Chart",
    authority: "official-program",
    publishedDate: "2025-02-10T00:00:00.000Z",
  },
  contradictions: [],
};

// ----------------------------------------------------------------------------
// The traversal result: one row per transferPartner reachable from the user's
// currencies [cur.amex, cur.chase], each carrying its matching chart entries.
//   Amex → ANA (gated), Amex → VS, Chase → VS, Chase → AC.
// (Chase does NOT transfer to ANA — §5.4 — so there is no Chase→ANA row.)
// ----------------------------------------------------------------------------

export const SFO_NRT_BUSINESS_ROWS: TraverseRow[] = [
  {
    transferPartnerId: "tp.amex.ana",
    ratio: 1.0,
    transferTimeHours: 48,
    fromCurrency: curAmex,
    toProgram: progAna,
    sourceRef: srcTransfer,
    chartEntries: [aceAna],
  },
  {
    transferPartnerId: "tp.amex.vs",
    ratio: 1.0,
    transferTimeHours: 0,
    fromCurrency: curAmex,
    toProgram: progVs,
    sourceRef: srcTransfer,
    chartEntries: [aceVs],
  },
  {
    transferPartnerId: "tp.chase.vs",
    ratio: 1.0,
    transferTimeHours: 0,
    fromCurrency: curChase,
    toProgram: progVs,
    sourceRef: srcTransfer,
    chartEntries: [aceVs],
  },
  {
    transferPartnerId: "tp.chase.ac",
    ratio: 1.0,
    transferTimeHours: 0,
    fromCurrency: curChase,
    toProgram: progAc,
    sourceRef: srcTransfer,
    chartEntries: [aceAc],
  },
];

// Query params that produced these rows (for traceability / test fixtures).
export const SFO_NRT_BUSINESS_PARAMS = {
  currencyIds: ["cur.amex", "cur.chase"],
  origin: "SFO",
  destination: "NRT",
  cabin: "business" as const,
};
