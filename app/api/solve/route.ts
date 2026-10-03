// app/api/solve/route.ts
//
// POST either a full SolveInput { origin, destination, cabin, candidates } OR
// { origin, destination, cabin, rows } where `rows` are raw §6 traversal rows
// to be mapped to candidates via toCandidates (§7.5). Calls the pure solve()
// (§7.3) and returns the typed SolveResult.
//
// Fail-closed error contract (§7.3): the call is wrapped in try/catch so a
// caught SolverInvariantError — whether thrown by toCandidates (bad ratio) or
// by solve() (resolved-without-number, bad cost, minimality) — is converted to
// NOT_COMPUTED(UNRESOLVED_CONTRADICTION) with a message, logged at error level,
// and NEVER a numeric price (§7.3 error contract). Normal NO_VALID_ROUTING /
// UNRESOLVED_CONTRADICTION results from solve() are returned as-is.

import { NextResponse } from "next/server";
import { solve } from "@/solver/solve";
import {
  SolverInvariantError,
  type CandidateRouting,
  type Cabin,
  type SolveInput,
  type SolveResult,
} from "@/solver/types";
import { toCandidates } from "@/lib/toCandidates";
import type { TraverseRow } from "@/lib/fixtures/sfo-nrt-business.rows";

const CABINS: readonly Cabin[] = ["economy", "premium", "business", "first"];

interface SolveBody {
  origin?: unknown;
  destination?: unknown;
  cabin?: unknown;
  candidates?: unknown;
  rows?: unknown;
}

function isCabin(value: unknown): value is Cabin {
  return typeof value === "string" && (CABINS as readonly string[]).includes(value);
}

export async function POST(request: Request): Promise<Response> {
  let body: SolveBody;
  try {
    body = (await request.json()) as SolveBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { origin, destination, cabin, candidates, rows } = body;

  if (
    typeof origin !== "string" ||
    typeof destination !== "string" ||
    !isCabin(cabin)
  ) {
    return NextResponse.json(
      {
        error:
          "expected { origin: string, destination: string, cabin: economy|premium|business|first, and candidates[] or rows[] }",
      },
      { status: 400 },
    );
  }

  try {
    // Resolve the candidate list: use `candidates` verbatim if given, else map
    // raw §6 `rows` through toCandidates. toCandidates throws SolverInvariantError
    // on a bad ratio — caught below and degraded to NOT_COMPUTED.
    let candidateList: CandidateRouting[];
    if (Array.isArray(candidates)) {
      candidateList = candidates as CandidateRouting[];
    } else if (Array.isArray(rows)) {
      candidateList = toCandidates(rows as TraverseRow[]);
    } else {
      return NextResponse.json(
        { error: "expected either candidates[] or rows[] in the body" },
        { status: 400 },
      );
    }

    const input: SolveInput = {
      origin,
      destination,
      cabin,
      candidates: candidateList,
    };

    const result: SolveResult = solve(input);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SolverInvariantError) {
      // Fail-closed: a solver/mapping invariant violation degrades to
      // NOT_COMPUTED, NEVER a price (§7.3 error contract).
      console.error(
        "[solve] invariant violation, degrading to NOT_COMPUTED:",
        err.message,
      );
      const result: SolveResult = {
        kind: "NOT_COMPUTED",
        reason: "UNRESOLVED_CONTRADICTION",
        message: `Cannot price: ${err.message}`,
      };
      return NextResponse.json(result);
    }
    const message = err instanceof Error ? err.message : "solve failed";
    console.error("[solve] unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
