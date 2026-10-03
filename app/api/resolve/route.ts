// app/api/resolve/route.ts
//
// POST { contradictionId } -> fetch the contradiction + any prior userDecision,
// call the pure resolve() (§7.4, FEAT-002), then persist atomically:
// createOrReplace the userDecision at its derived fixed _id + patch the
// contradiction's status/committedResolution, in one transaction (§7.4 step 3,
// idempotent via the fixed _id).
//
// Fail-closed error contract (§7.4 resolve-route error contract, §7.3): the
// whole thing is wrapped in try/catch. On a caught SolverInvariantError (e.g.
// an unknown source.authority out of resolution's authorityRank, or a missing
// write token) the route writes NO userDecision, leaves the contradiction
// unresolved, and returns a NOT_COMPUTED(UNRESOLVED_CONTRADICTION) payload whose
// message names the bad authority, logged at error level. It NEVER leaks a price.

import { NextResponse } from "next/server";
import { getReadClient, getWriteClient } from "@/lib/sanityClient";
import {
  resolve,
  userDecisionId,
  type Contradiction,
  type PriorUserDecision,
} from "@/lib/resolution";
import { SolverInvariantError } from "@/solver/types";

// Shape of the committed resolution payload returned to the caller on success.
interface ResolvePayload {
  kind: "RESOLVED";
  contradictionId: string;
  chosenClaim: "A" | "B";
  chosenPointsCost: number;
  chosenSourceId: string;
  rationale: string;
}

// The fail-closed value returned when resolution cannot be computed. Mirrors
// the solver's SolveNotComputed so the downstream UI renders it the same way
// and no numeric price appears.
interface NotComputedPayload {
  kind: "NOT_COMPUTED";
  reason: "UNRESOLVED_CONTRADICTION";
  blockingContradictionIds: string[];
  message: string;
}

// GROQ to fetch the one contradiction (claims' sources dereferenced so
// resolve() sees each claim.source.authority) plus any prior userDecision.
const RESOLVE_READ_QUERY = /* groq */ `{
  "contradiction": *[_type == "contradiction" && _id == $cid][0]{
    _id,
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
  },
  "prior": *[_type == "userDecision" && contradiction._ref == $cid][0]{
    chosenClaim, chosenPointsCost, rationale,
    "chosenSource": chosenSource->{ _id, title, authority, publishedDate }
  }
}`;

interface ResolveReadResult {
  contradiction: Contradiction | null;
  prior: PriorUserDecision | null;
}

export async function POST(request: Request): Promise<Response> {
  let body: { contradictionId?: unknown };
  try {
    body = (await request.json()) as { contradictionId?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const contradictionId = body.contradictionId;
  if (typeof contradictionId !== "string" || contradictionId === "") {
    return NextResponse.json(
      { error: "expected { contradictionId: string }" },
      { status: 400 },
    );
  }

  try {
    const read = getReadClient();
    const { contradiction, prior } = await read.fetch<ResolveReadResult>(
      RESOLVE_READ_QUERY,
      { cid: contradictionId },
    );

    if (!contradiction) {
      return NextResponse.json(
        { error: `contradiction not found: ${contradictionId}` },
        { status: 404 },
      );
    }

    // Pure decision logic. Throws SolverInvariantError on an unknown authority.
    const decision = resolve(contradiction, prior ?? undefined);

    // Persist atomically + idempotently (fixed derived _id). If a prior
    // decision short-circuited resolve(), we still (re)write it to the same
    // _id so status/committedResolution stay in sync — createOrReplace makes
    // this a no-op-equivalent, never a duplicate.
    const write = getWriteClient();
    const decisionId = userDecisionId(contradiction._id);
    await write
      .transaction()
      .createOrReplace({
        _id: decisionId,
        _type: "userDecision",
        decisionKey: contradiction._id,
        contradiction: { _type: "reference", _ref: contradiction._id },
        chosenClaim: decision.chosenClaim,
        chosenPointsCost: decision.chosenPointsCost,
        chosenSource: { _type: "reference", _ref: decision.chosenSource._id },
        decidedAt: new Date().toISOString(),
        rationale: decision.rationale,
      })
      .patch(contradiction._id, (p) =>
        p.set({
          status: "resolved",
          committedResolution: {
            chosenClaim: decision.chosenClaim,
            chosenPointsCost: decision.chosenPointsCost,
            chosenSource: {
              _type: "reference",
              _ref: decision.chosenSource._id,
            },
            rationale: decision.rationale,
          },
        }),
      )
      .commit();

    const payload: ResolvePayload = {
      kind: "RESOLVED",
      contradictionId: contradiction._id,
      chosenClaim: decision.chosenClaim,
      chosenPointsCost: decision.chosenPointsCost,
      chosenSourceId: decision.chosenSource._id,
      rationale: decision.rationale,
    };
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof SolverInvariantError) {
      // Fail-closed degradation (§7.4 error contract): write nothing, leave the
      // contradiction unresolved, surface NOT_COMPUTED naming the invariant.
      // The gate stays shut; no price is ever derived from a bad authority.
      console.error(
        "[resolve] invariant violation, degrading to NOT_COMPUTED:",
        err.message,
      );
      const payload: NotComputedPayload = {
        kind: "NOT_COMPUTED",
        reason: "UNRESOLVED_CONTRADICTION",
        blockingContradictionIds: [contradictionId],
        message: `Cannot resolve contradiction ${contradictionId}: ${err.message}`,
      };
      // 200: this is a defined, expected fail-closed outcome the UI renders
      // verbatim, not a server crash.
      return NextResponse.json(payload);
    }
    const message = err instanceof Error ? err.message : "resolve failed";
    console.error("[resolve] unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
