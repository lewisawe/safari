// app/api/contradictions/route.ts
//
// POST { chartEntryIds } -> Knowledge-Base read returning each entry's
// contradiction with both claims and their dereferenced sources side-by-side,
// for the "Issues" view (KBIssueView, FR-4).
//
// PRESENTATION-ONLY (design §8.1a): this read must NOT gate pricing and is NEVER
// consumed by toCandidates/solve. The gating authority is the §6 GROQ-embedded
// contradiction (traverse route); this route is a convenience read for the
// side-by-side presentation and adds no state the gate depends on. Both derive
// from the same `contradiction` documents, so they cannot disagree.

import { NextResponse } from "next/server";
import { getReadClient } from "@/lib/sanityClient";

// Projects each contradiction whose subjectEntry is one of the requested
// entries, dereferencing both claims' sources so the UI can show title +
// authority + dates without a second round-trip. (committedResolution is NOT
// projected here on purpose: this view is presentation-only and must not look
// like it participates in gating.)
const CONTRADICTIONS_QUERY = /* groq */ `*[_type == "contradiction" && subjectEntry._ref in $chartEntryIds]{
  _id, title, status, explanation,
  "subjectEntryId": subjectEntry._ref,
  "claimA": {
    "pointsCost": claimA.pointsCost,
    "effectiveDate": claimA.effectiveDate,
    "label": claimA.label,
    "source": claimA.source->{ _id, title, authority, publishedDate }
  },
  "claimB": {
    "pointsCost": claimB.pointsCost,
    "effectiveDate": claimB.effectiveDate,
    "label": claimB.label,
    "source": claimB.source->{ _id, title, authority, publishedDate }
  }
}`;

interface ContradictionsBody {
  chartEntryIds?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  let body: ContradictionsBody;
  try {
    body = (await request.json()) as ContradictionsBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { chartEntryIds } = body;
  if (
    !Array.isArray(chartEntryIds) ||
    !chartEntryIds.every((id) => typeof id === "string")
  ) {
    return NextResponse.json(
      { error: "expected { chartEntryIds: string[] }" },
      { status: 400 },
    );
  }

  try {
    const client = getReadClient();
    const contradictions = await client.fetch(CONTRADICTIONS_QUERY, {
      chartEntryIds,
    });
    return NextResponse.json({ contradictions });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "contradictions read failed";
    console.error("[contradictions] KB read failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
