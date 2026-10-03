// app/api/traverse/route.ts
//
// POST { currencyIds, origin, destination, cabin } -> runs the §6 GROQ
// traversal against the read client and returns the raw candidate rows (the §6
// shape). This is the GROQ-traversal Context concern (FR-2), distinct from the
// Knowledge-Base read (§8.1a). The embedded contradictions on each row are the
// gating authority consumed downstream by toCandidates/solve.

import { NextResponse } from "next/server";
import { getReadClient } from "@/lib/sanityClient";
import {
  TRAVERSE_ROUTINGS_QUERY,
  buildTraverseParams,
  type TraverseParams,
} from "@/lib/groq";

interface TraverseBody {
  currencyIds?: unknown;
  origin?: unknown;
  destination?: unknown;
  cabin?: unknown;
}

function parseBody(body: TraverseBody): TraverseParams | null {
  const { currencyIds, origin, destination, cabin } = body;
  if (
    !Array.isArray(currencyIds) ||
    !currencyIds.every((c) => typeof c === "string") ||
    typeof origin !== "string" ||
    typeof destination !== "string" ||
    typeof cabin !== "string"
  ) {
    return null;
  }
  return { currencyIds, origin, destination, cabin };
}

export async function POST(request: Request): Promise<Response> {
  let body: TraverseBody;
  try {
    body = (await request.json()) as TraverseBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "expected { currencyIds: string[], origin: string, destination: string, cabin: string }",
      },
      { status: 400 },
    );
  }

  try {
    const client = getReadClient();
    const params = buildTraverseParams(parsed);
    const rows = await client.fetch(TRAVERSE_ROUTINGS_QUERY, params);
    // Return the raw §6 rows plus the exact query issued (FR-8: show the work).
    return NextResponse.json({ rows, query: TRAVERSE_ROUTINGS_QUERY, params });
  } catch (err) {
    // A read/config failure is a server error; never fabricate rows.
    const message = err instanceof Error ? err.message : "traversal failed";
    console.error("[traverse] GROQ traversal failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
