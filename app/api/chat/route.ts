// app/api/chat/route.ts
//
// The Vercel AI SDK **v7** agent endpoint (design §8). It exposes the four §8.1
// tools to the model and lets it chain them to reach a priced, provably-cheapest
// routing — but the model may only ever *narrate* numbers that come out of the
// `runSolver` tool. The four tools map 1:1 to §8.1:
//
//   traverseRoutings   — GROQ traversal (the first Context concern). Returns the
//                        §6 rows whose embedded contradictions are the GATING
//                        authority (§8.1a). Also carries the gating-authority
//                        copy so the model knows this read decides the gate.
//   readContradictions — Knowledge-Base read (the second Context concern),
//                        PRESENTATION-ONLY (§8.1a): it never gates/prices and is
//                        never fed to the solver. Drives the KBIssueView.
//   resolveContradiction — app action that WRITES Sanity (same logic as the
//                        resolve route, §7.4): fail-closed, idempotent.
//   runSolver          — wraps the pure deterministic solver (§7.3). Any thrown
//                        SolverInvariantError degrades to NOT_COMPUTED, NEVER a
//                        price (§7.3 error contract).
//
// API translation note (context.json): the design text predates AI SDK v7 and
// says `maxSteps`. v7 uses `stopWhen: stepCountIs(n)` + `tool({ inputSchema })`
// + `toUIMessageStreamResponse()`; that is what ships here.
//
// NFR-3 fail-safe: `MODEL_PROVIDER_API_KEY` is OPTIONAL. If it is ABSENT this
// route returns a typed `{ disabled: true, ... }` JSON telling the caller to use
// the model-free /solver path. It NEVER crashes and NEVER fabricates a price,
// so the model-free path stays the working default.

import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel, UIMessage } from "ai";
import { z } from "zod";

import { getReadClient, getWriteClient } from "@/lib/sanityClient";
import {
  TRAVERSE_ROUTINGS_QUERY,
  buildTraverseParams,
} from "@/lib/groq";
import { toCandidates } from "@/lib/toCandidates";
import { solve } from "@/solver/solve";
import {
  SolverInvariantError,
  type CandidateRouting,
  type Cabin,
  type SolveInput,
  type SolveResult,
} from "@/solver/types";
import {
  resolve,
  userDecisionId,
  type Contradiction,
  type PriorUserDecision,
} from "@/lib/resolution";
import type { TraverseRow } from "@/lib/fixtures/sfo-nrt-business.rows";

// Allow streaming responses up to 30s.
export const maxDuration = 30;

const CABIN_VALUES = ["economy", "premium", "business", "first"] as const;

// Max tool-call steps the agent may chain in one turn (v7 translation of the
// design's §8.2 `maxSteps`). traverse -> readContradictions -> resolve ->
// runSolver is four tool calls; the budget leaves room for a re-run after a
// resolution plus the model's narration turns.
const MAX_AGENT_STEPS = 8;

// The gating-authority copy returned alongside the traversal rows (§8.1a): this
// GROQ-embedded read is what decides whether a price may be computed.
const GATING_AUTHORITY_NOTE =
  "Gating authority: each routing's embedded contradiction (committedResolution == null means UNRESOLVED) is what gates pricing. readContradictions is presentation-only and never gates. runSolver stays blocked until every blocking contradiction is resolved.";

/**
 * Resolve the model provider from MODEL_PROVIDER_API_KEY. Returns null when the
 * key is ABSENT so the route can fail safe to the /solver path (NFR-3). The
 * provider is chosen by MODEL_PROVIDER (anthropic|openai), defaulting to openai.
 */
function getModel(): LanguageModel | null {
  const key = process.env.MODEL_PROVIDER_API_KEY;
  if (!key || key.trim() === "") return null;

  const provider = (process.env.MODEL_PROVIDER ?? "openai").toLowerCase();
  if (provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey: key });
    return anthropic(process.env.MODEL_NAME ?? "claude-sonnet-4-20250514");
  }
  const openai = createOpenAI({ apiKey: key });
  return openai(process.env.MODEL_NAME ?? "gpt-4o");
}

// The fail-closed system prompt (§8.2), verbatim intent.
const SYSTEM_PROMPT = [
  "You are Safari, an award-travel routing agent over a SYNTHETIC dataset in Sanity.",
  "The dataset is synthetic; say so if the user asks whether it is real.",
  "",
  "Hard rules (fail-closed — never break these):",
  "1. You may ONLY state a points cost or a routing verdict that appears in a `runSolver` COMPUTED result. If `runSolver` returns NOT_COMPUTED, report its `message` verbatim and STOP. Never compute, estimate, round, or guess a number yourself.",
  "2. Before calling `runSolver` you MUST first call `traverseRoutings`, then `readContradictions` for the chart entries on the candidate routings.",
  "3. If any routing's embedded contradiction is unresolved (committedResolution is null), you MUST call `resolveContradiction` for it and show both claims with their sources and the resolution rationale before you may call `runSolver`.",
  "4. The gate is decided by the GROQ-embedded contradiction returned by `traverseRoutings`, not by `readContradictions` (which is presentation-only).",
  "",
  "Your job is to narrate the work — the UI renders the actual tool results. Keep prose brief; the numbers live in the tool results, not your text.",
].join("\n");

// --- Tool: traverseRoutings (GROQ traversal, gating authority) --------------

const traverseRoutings = tool({
  description:
    "GROQ reference-graph traversal (Context concern #1). Given the point currencies the user holds and origin/destination/cabin, returns candidate routings with their blocking contradictions embedded. This embedded contradiction is the GATING authority for pricing.",
  inputSchema: z.object({
    currencyIds: z
      .array(z.string())
      .describe("pointsCurrency _ids the user holds, e.g. ['cur.amex','cur.chase']"),
    origin: z.string().describe("origin IATA code, e.g. SFO"),
    destination: z.string().describe("destination IATA code, e.g. NRT"),
    cabin: z.enum(CABIN_VALUES).describe("cabin class"),
  }),
  async execute({ currencyIds, origin, destination, cabin }) {
    const client = getReadClient();
    const params = buildTraverseParams({ currencyIds, origin, destination, cabin });
    const rows = (await client.fetch(TRAVERSE_ROUTINGS_QUERY, params)) as TraverseRow[];
    return {
      rows,
      query: TRAVERSE_ROUTINGS_QUERY,
      params,
      gatingAuthority: GATING_AUTHORITY_NOTE,
    };
  },
});

// --- Tool: readContradictions (Knowledge-Base read, PRESENTATION-ONLY) ------

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

const readContradictions = tool({
  description:
    "Knowledge-Base read (Context concern #2). PRESENTATION ONLY: returns each chart entry's contradiction with both claims and their sources side-by-side for display. It does NOT gate pricing and is never fed to the solver.",
  inputSchema: z.object({
    chartEntryIds: z
      .array(z.string())
      .describe("awardChartEntry _ids seen on the candidate routings"),
  }),
  async execute({ chartEntryIds }) {
    const client = getReadClient();
    const contradictions = await client.fetch(CONTRADICTIONS_QUERY, { chartEntryIds });
    return { contradictions, presentationOnly: true as const };
  },
});

// --- Tool: resolveContradiction (writes Sanity, same logic as resolve route) -

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

const resolveContradiction = tool({
  description:
    "App action that resolves a contradiction and WRITES the decision to Sanity (idempotent). Applies the precedence rule (higher authority, later effectiveDate). On an unknown authority it fails closed and returns NOT_COMPUTED without writing or leaking any number.",
  inputSchema: z.object({
    contradictionId: z.string().describe("the contradiction _id to resolve"),
  }),
  async execute({ contradictionId }) {
    try {
      const read = getReadClient();
      const { contradiction, prior } = await read.fetch<ResolveReadResult>(
        RESOLVE_READ_QUERY,
        { cid: contradictionId },
      );
      if (!contradiction) {
        return {
          kind: "NOT_COMPUTED" as const,
          reason: "UNRESOLVED_CONTRADICTION" as const,
          blockingContradictionIds: [contradictionId],
          message: `contradiction not found: ${contradictionId}`,
        };
      }

      const decision = resolve(contradiction, prior ?? undefined);

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

      return {
        kind: "RESOLVED" as const,
        contradictionId: contradiction._id,
        chosenClaim: decision.chosenClaim,
        chosenPointsCost: decision.chosenPointsCost,
        chosenSourceId: decision.chosenSource._id,
        chosenSourceTitle: decision.chosenSource.title,
        chosenSourceAuthority: decision.chosenSource.authority,
        rationale: decision.rationale,
      };
    } catch (err) {
      if (err instanceof SolverInvariantError) {
        // Fail-closed: write nothing, leave the gate shut, surface NOT_COMPUTED.
        console.error(
          "[chat/resolveContradiction] invariant, degrading to NOT_COMPUTED:",
          err.message,
        );
        return {
          kind: "NOT_COMPUTED" as const,
          reason: "UNRESOLVED_CONTRADICTION" as const,
          blockingContradictionIds: [contradictionId],
          message: `Cannot resolve contradiction ${contradictionId}: ${err.message}`,
        };
      }
      throw err;
    }
  },
});

// --- Tool: runSolver (wraps the pure deterministic solver) ------------------

const runSolver = tool({
  description:
    "Runs the deterministic solver on the candidate routings and returns the typed SolveResult (COMPUTED with chosen+proof, or NOT_COMPUTED). This is the ONLY source of a points cost or verdict. Pass the raw traversal rows (preferred) or pre-mapped candidates.",
  inputSchema: z.object({
    origin: z.string(),
    destination: z.string(),
    cabin: z.enum(CABIN_VALUES),
    // Accept either the raw §6 rows (preferred) or already-flattened candidates.
    rows: z.array(z.any()).optional(),
    candidates: z.array(z.any()).optional(),
  }),
  async execute({ origin, destination, cabin, rows, candidates }): Promise<SolveResult> {
    try {
      let candidateList: CandidateRouting[];
      if (Array.isArray(candidates) && candidates.length > 0) {
        candidateList = candidates as CandidateRouting[];
      } else if (Array.isArray(rows)) {
        candidateList = toCandidates(rows as TraverseRow[]);
      } else {
        candidateList = [];
      }
      const input: SolveInput = {
        origin,
        destination,
        cabin: cabin as Cabin,
        candidates: candidateList,
      };
      return solve(input);
    } catch (err) {
      if (err instanceof SolverInvariantError) {
        // §7.3 error contract: degrade to NOT_COMPUTED, never a price.
        console.error(
          "[chat/runSolver] invariant, degrading to NOT_COMPUTED:",
          err.message,
        );
        return {
          kind: "NOT_COMPUTED",
          reason: "UNRESOLVED_CONTRADICTION",
          message: `Cannot price: ${err.message}`,
        };
      }
      throw err;
    }
  },
});

const AGENT_TOOLS = {
  traverseRoutings,
  readContradictions,
  resolveContradiction,
  runSolver,
};

export async function POST(request: Request): Promise<Response> {
  const model = getModel();

  // NFR-3: no model key -> typed, non-crashing "disabled" response. The caller
  // (agent page) renders this and steers the user to the model-free /solver
  // path, which is fully functional without any key.
  if (!model) {
    return Response.json(
      {
        disabled: true,
        reason: "MODEL_PROVIDER_API_KEY not set",
        message:
          "The agent (model) path is disabled because MODEL_PROVIDER_API_KEY is not set. Use the model-free /solver path, which needs no API key and returns the same answer.",
        solverPath: "/solver",
      },
      { status: 200 },
    );
  }

  let body: { messages?: UIMessage[] };
  try {
    body = (await request.json()) as { messages?: UIMessage[] };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools: AGENT_TOOLS,
    // v7 translation of the design's `maxSteps` (context.json).
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
  });

  return result.toUIMessageStreamResponse();
}
