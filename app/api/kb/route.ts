// app/api/kb/route.ts
//
// GET  -> KB status for the default demo route (SFO→NRT, ANA).
// POST { origin, destination, programCodes? } -> Knowledge Base evidence read
// via Sanity Context MCP (KB mode), deterministic entry selection, no LLM.
//
// PRESENTATION ONLY: the response never carries a price field and nothing from
// it reaches traverse/solve or the gate. Any failure (not configured, auth,
// no KB, ...) is a 200 with a typed quiet payload so the /solver pipeline
// never blocks on it. Only a malformed request body is a 400.

import { NextResponse } from "next/server";
import { readKbEvidence } from "@/lib/kbEvidence";

interface KbBody {
  origin?: unknown;
  destination?: unknown;
  programCodes?: unknown;
}

export async function GET(): Promise<Response> {
  const evidence = await readKbEvidence({ origin: "SFO", destination: "NRT", programCodes: ["ANA"] });
  return NextResponse.json(evidence);
}

export async function POST(request: Request): Promise<Response> {
  let body: KbBody;
  try {
    body = (await request.json()) as KbBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { origin, destination, programCodes } = body ?? {};
  if (
    typeof origin !== "string" ||
    typeof destination !== "string" ||
    (programCodes !== undefined &&
      (!Array.isArray(programCodes) || !programCodes.every((c) => typeof c === "string")))
  ) {
    return NextResponse.json(
      { error: "expected { origin: string, destination: string, programCodes?: string[] }" },
      { status: 400 },
    );
  }
  const evidence = await readKbEvidence({
    origin,
    destination,
    programCodes: programCodes as string[] | undefined,
  });
  return NextResponse.json(evidence);
}
