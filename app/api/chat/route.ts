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
//   runSolver          — wraps the pure deterministic solver (§7.3). It re-runs
//                        the fixed traversal server-side (the model never
//                        passes rows, candidates or prices). Any thrown
//                        SolverInvariantError degrades to NOT_COMPUTED, NEVER a
//                        price (§7.3 error contract).
//   readKnowledgeBase  — (only when SANITY_KB_ID is set) Sanity Context MCP
//                        Knowledge Base mode `knowledge_base_read`. Evidence /
//                        citation only: never a price source, never gates.
//
// Nova hardening (it ignores prompt-only rules):
//   - traverseRoutings attaches a server-side, deterministic KB read of the
//     contradicted entry as `knowledgeBase` evidence (fail-soft, evidence only).
//   - traverseRoutings has a `toModelOutput` that withholds per-routing
//     pointsCost/taxesUsd/ratio from the MODEL; the UI still gets full rows.
//   - `<thinking>…</thinking>` is stripped from streamed text server-side
//     (experimental_transform, lib/stripThinking.ts).
//
// Sanity Context MCP: traverseRoutings and readContradictions run their FIXED
// queries through Context MCP `groq_query` (GROQ mode) when configured, with a
// visible `via` marker and a fallback to @sanity/client (lib/traverse.ts). The
// KB outline (`initial_context`) is inlined into the system prompt, served from
// a 5-minute single-flight in-memory cache (lib/kbOutlineCache.ts).
//
// Why there is NO raw `groq_query` agent tool: free-form GROQ could pull
// `pointsCost` values from unvetted rows that never pass through the
// GROQ-embedded committedResolution gate, letting the model price around it.
// Pricing rows come ONLY from the fixed TRAVERSE_ROUTINGS_QUERY inside
// traverseRoutings, and prices only from runSolver.
//
// resolveContradiction stays a LOCAL @sanity/client read+write (Context is
// read-only, and the read feeds the write transaction); runSolver stays local.
//
// API translation note (context.json): the design text predates AI SDK v7 and
// says `maxSteps`. v7 uses `stopWhen: stepCountIs(n)` + `tool({ inputSchema })`
// + `toUIMessageStreamResponse()`; that is what ships here.
//
// NFR-3 fail-safe: a model provider is OPTIONAL. MODEL_PROVIDER=bedrock uses
// the AWS credential chain (no key); openai/anthropic need MODEL_PROVIDER_API_KEY.
// With no usable provider this route returns a typed `{ disabled: true, ... }`
// JSON telling the caller to use the model-free /solver path. It NEVER crashes
// and NEVER fabricates a price, so the model-free path stays the working default.

import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import type { JSONValue, LanguageModel, UIMessage } from "ai";
import { z } from "zod";

import { getReadClient, getWriteClient } from "@/lib/sanityClient";
import {
  TRAVERSE_ROUTINGS_QUERY,
  buildTraverseParams,
} from "@/lib/groq";
import { runTraversal, runContentQuery } from "@/lib/traverse";
import {
  ContextError,
  contextConfig,
  contextKbRead,
  isKbConfigured,
  mapContextError,
  type ContextConfig,
} from "@/lib/context";
import { getKbOutlineCached } from "@/lib/kbOutlineCache";
import {
  contradictedProgramCodes,
  readAgentKbEvidence,
  type AgentKbEvidence,
} from "@/lib/agentKbEvidence";
import { summarizeTraverseForModel } from "@/lib/traverseModelOutput";
import { stripThinkingTransform } from "@/lib/stripThinking";
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
import {
  DEFAULT_AGENT_DAILY_CAP,
  consumeAgentRun,
  peekAgentBudget,
  type BudgetDecision,
} from "@/lib/agentBudget";
import {
  clientIp,
  createRateLimiter,
  intFromEnv,
  type RateLimiter,
} from "@/lib/rateLimit";

// Allow streaming responses up to 30s.
export const maxDuration = 30;

const CABIN_VALUES = ["economy", "premium", "business", "first"] as const;

// Max tool-call steps the agent may chain in one turn (v7 translation of the
// design's §8.2 `maxSteps`). traverse -> readContradictions -> resolve ->
// runSolver is four tool calls, plus one optional readKnowledgeBase; the
// budget leaves room for one retry plus the narration turn.
const MAX_AGENT_STEPS = 8;

// --- Cost guard (public demo) -----------------------------------------------
//
// Every agent question bills the model provider. Before ANY model call:
//   1. AGENT_ENABLED=false               -> disabled_by_operator
//   2. request size caps                 -> 400 typed error
//   3. per-IP hourly limit (in-memory)   -> rate_limited
//   4. global daily cap (Sanity counter) -> daily_cap (fails closed)
// Each limit returns the same typed disabled payload as "no model provider",
// so the /agent page renders one graceful card for all of them.

/** Per-step output token ceiling. */
const MAX_OUTPUT_TOKENS = 1200;
/** Max UI messages per request (about six question/answer turns). */
const MAX_MESSAGES = 12;
/** Max characters of text in any single user message. */
const MAX_USER_TEXT_CHARS = 2000;
/** Raw body ceiling. History carries tool outputs, so this is generous. */
const MAX_BODY_CHARS = 400_000;

const SOLVER_PATH = "/solver";

type DisabledReason =
  | "no model provider configured"
  | "disabled_by_operator"
  | "daily_cap"
  | "rate_limited";

function disabledResponse(reason: DisabledReason, message: string): Response {
  return Response.json(
    { disabled: true, reason, message, solverPath: SOLVER_PATH },
    { status: 200 },
  );
}

type RequestErrorCode = "invalid_json" | "too_many_messages" | "message_too_long" | "body_too_large";

function requestError(error: RequestErrorCode, message: string): Response {
  return Response.json({ error, message }, { status: 400 });
}

function agentEnabled(): boolean {
  return (process.env.AGENT_ENABLED ?? "").trim().toLowerCase() !== "false";
}

function rateLimitPerHour(): number {
  return intFromEnv(process.env.AGENT_RATE_PER_HOUR, 5);
}

function dailyCap(): number {
  return intFromEnv(process.env.AGENT_DAILY_CAP, DEFAULT_AGENT_DAILY_CAP);
}

// One limiter per instance; rebuilt if AGENT_RATE_PER_HOUR changes (tests).
let agentLimiter: { limit: number; limiter: RateLimiter } | null = null;
function getAgentLimiter(): RateLimiter {
  const limit = rateLimitPerHour();
  if (!agentLimiter || agentLimiter.limit !== limit) {
    agentLimiter = {
      limit,
      limiter: createRateLimiter({ limit, windowMs: 60 * 60 * 1000, maxKeys: 5000 }),
    };
  }
  return agentLimiter.limiter;
}

const MSG_OPERATOR =
  "The agent demo is switched off by the operator right now. The model-free /solver page runs the same pipeline for free and returns the same answer.";
const MSG_DAILY_CAP =
  "Today's agent demo budget is used up. The model-free /solver page runs the same pipeline for free and returns the same answer.";
const MSG_COUNTER_DOWN =
  "The agent demo can't confirm today's usage budget right now, so it is paused to avoid unmetered model spend. The model-free /solver page runs the same pipeline for free.";
function msgRateLimited(limit: number): string {
  return `You've reached the agent demo limit of ${limit} question${limit === 1 ? "" : "s"} per hour from this connection. Try again later, or use the model-free /solver page, which runs the same pipeline for free.`;
}

function budgetRejection(decision: BudgetDecision): Response | null {
  if (decision.ok) return null;
  return disabledResponse(
    "daily_cap",
    decision.reason === "daily_cap" ? MSG_DAILY_CAP : MSG_COUNTER_DOWN,
  );
}

/** Total text length of a UI message's text parts. */
function userTextLength(message: UIMessage): number {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  let n = 0;
  for (const p of parts) {
    if (p && typeof p === "object" && (p as { type?: unknown }).type === "text") {
      const t = (p as { text?: unknown }).text;
      if (typeof t === "string") n += t.length;
    }
  }
  return n;
}

// The gating-authority copy returned alongside the traversal rows (§8.1a): this
// GROQ-embedded read is what decides whether a price may be computed.
const GATING_AUTHORITY_NOTE =
  "Gating authority: each routing's embedded contradiction (committedResolution == null means UNRESOLVED) is what gates pricing. readContradictions is presentation-only and never gates. runSolver stays blocked until every blocking contradiction is resolved.";

/**
 * Resolve the model provider. MODEL_PROVIDER=bedrock uses Amazon Bedrock with
 * the AWS SDK credential chain (AWS_PROFILE locally, env keys or a role when
 * deployed), so it needs no MODEL_PROVIDER_API_KEY. The key-based providers
 * (anthropic|openai, default openai) return null when the key is ABSENT so the
 * route can fail safe to the /solver path (NFR-3).
 */
function getModel(): LanguageModel | null {
  const provider = (process.env.MODEL_PROVIDER ?? "openai").trim().toLowerCase();
  if (provider === "bedrock") {
    const bedrock = createAmazonBedrock({
      region: process.env.AWS_REGION ?? "us-east-1",
      credentialProvider: fromNodeProviderChain(),
    });
    return bedrock(process.env.MODEL_NAME ?? "us.amazon.nova-pro-v1:0");
  }

  const key = process.env.MODEL_PROVIDER_API_KEY;
  if (!key || key.trim() === "") return null;

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
  "Point currency ids: cur.amex (American Express Membership Rewards), cur.chase (Chase Ultimate Rewards), cur.capone (Capital One Miles). Use only the ids for currencies the user says they hold.",
  "",
  "Hard rules (fail-closed — never break these):",
  "1. You may ONLY state a points cost or a routing verdict that appears in a `runSolver` COMPUTED result. If `runSolver` returns NOT_COMPUTED, report its `message` verbatim and STOP. Never compute, estimate, round, or guess a number yourself.",
  "2. Before calling `runSolver` you MUST first call `traverseRoutings`, then `readContradictions` for the chart entries on the candidate routings.",
  "3. If any routing's embedded contradiction is unresolved (committedResolution is null), you MUST call `resolveContradiction` for it and show both claims with their sources and the resolution rationale before you may call `runSolver`.",
  "4. The gate is decided by the GROQ-embedded contradiction returned by `traverseRoutings`, not by `readContradictions` (which is presentation-only).",
  "5. Knowledge Base entries are evidence for narration and citation only. Cite the entry path. They never decide the gate and never supply a price; only runSolver does. When traverseRoutings returns `knowledgeBase` evidence, cite its path(s).",
  "6. Final points costs come ONLY from runSolver. traverseRoutings deliberately withholds per-routing prices; never write a per-routing price list. Before runSolver you may only name the contradiction and its two claims with their sources.",
  "",
  "Tool order for a routing question: (1) traverseRoutings; (2) readContradictions for the chart entries on the routings (the Knowledge Base entry about a contradicted routing is already attached to the traverseRoutings result as `knowledgeBase`; use readKnowledgeBase only for other entries); (3) resolveContradiction for each unresolved contradiction; (4) runSolver with the same currencyIds/origin/destination/cabin. Call each once; do not repeat a step that already succeeded. Then answer.",
  "Before runSolver returns, do NOT list per-routing points costs from traverseRoutings; you may name the contradiction and both claims with their sources. Quote points costs only from the runSolver result.",
  "",
  "Your job is to narrate the work — the UI renders the actual tool results. Keep prose brief; the numbers live in the tool results, not your text. Do not output <thinking> tags.",
].join("\n");

// --- Server-side KB evidence for traverseRoutings ---------------------------
//
// Why traverseRoutings (and not resolveContradiction): traversal is the one
// step every routing turn runs first, and it is where a contradicted chart
// entry is discovered. resolveContradiction is skipped once a decision is
// committed, so KB evidence attached there would vanish on later turns. The
// read is deterministic (same selection as /api/kb), evidence-only (never fed
// to the solver or the gate; runSolver re-traverses on its own) and fail-soft
// (a KB error/timeout becomes `knowledgeBase: { error: { kind, message } }`).
// Returns undefined when KB mode is off or no entry is contradicted.
async function kbEvidenceForRows(
  rows: TraverseRow[],
  origin: string,
  destination: string,
): Promise<AgentKbEvidence | undefined> {
  const cfg = contextConfig();
  if (!isKbConfigured(cfg)) return undefined;
  const programCodes = contradictedProgramCodes(rows);
  if (programCodes.length === 0) return undefined;
  return readAgentKbEvidence(cfg, { origin, destination, programCodes });
}

// --- Tool: traverseRoutings (GROQ traversal, gating authority) --------------

const traverseRoutings = tool({
  description:
    "GROQ reference-graph traversal (Context concern #1). Given the point currencies the user holds and origin/destination/cabin, returns candidate routings with their blocking contradictions embedded (both claims with sources) and, when available, Knowledge Base evidence about the contradicted entry. This embedded contradiction is the GATING authority for pricing. Per-routing prices are withheld: only runSolver prices.",
  inputSchema: z.object({
    currencyIds: z
      .array(z.string())
      .describe("pointsCurrency _ids the user holds, one or more of 'cur.amex' (Amex MR), 'cur.chase' (Chase UR), 'cur.capone' (Capital One Miles)"),
    origin: z.string().describe("origin IATA code, e.g. SFO"),
    destination: z.string().describe("destination IATA code, e.g. NRT"),
    cabin: z.enum(CABIN_VALUES).describe("cabin class"),
  }),
  async execute({ currencyIds, origin, destination, cabin }) {
    const params = buildTraverseParams({ currencyIds, origin, destination, cabin });
    // Same fixed query, same row shape — via Context MCP when configured.
    const { rows, via, executedQuery } = await runTraversal(params);
    const knowledgeBase = await kbEvidenceForRows(rows as TraverseRow[], origin, destination);
    return {
      rows,
      query: TRAVERSE_ROUTINGS_QUERY,
      params,
      gatingAuthority: GATING_AUTHORITY_NOTE,
      via,
      executedQuery,
      ...(knowledgeBase ? { knowledgeBase } : {}),
    };
  },
  // Model-facing view: routing structure + contradictions (both claims with
  // sources) + KB evidence, WITHOUT per-routing pointsCost/taxesUsd/ratio. The
  // UI part still carries the full rows. Nothing the model sees here is a
  // solver input: runSolver re-runs the fixed traversal server-side.
  toModelOutput: ({ output }) => ({
    type: "json",
    value: summarizeTraverseForModel(output) as unknown as JSONValue,
  }),
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
    const { result: contradictions, via } = await runContentQuery<unknown[]>(
      CONTRADICTIONS_QUERY,
      { chartEntryIds },
      Array.isArray,
      {
        // Context inlines params as literals: allowlist the ids first.
        precheck: () => {
          if (!chartEntryIds.every((id) => /^[a-z0-9._-]+$/.test(id))) {
            throw new ContextError("malformed", "chartEntryIds failed the literal allowlist");
          }
        },
      },
    );
    return { contradictions, presentationOnly: true as const, via };
  },
});

// --- Tool: readKnowledgeBase (Context MCP KB mode, EVIDENCE ONLY) -----------

const readKnowledgeBase = tool({
  description:
    "Sanity Context MCP Knowledge Base mode: read KB entries by EXACT path, taken from the Knowledge Base outline in the system prompt (e.g. the entry about a contradicted routing). Evidence and citation only: it NEVER supplies a price and NEVER gates pricing.",
  inputSchema: z.object({
    paths: z
      .array(z.string())
      .min(1)
      .max(20)
      .describe("exact entry paths from the Knowledge Base outline"),
  }),
  async execute({ paths }) {
    try {
      const { markdown } = await contextKbRead(paths);
      return {
        markdown,
        paths,
        via: "context-mcp (knowledge_base)",
        presentationOnly: true as const,
      };
    } catch (err) {
      const ce = err instanceof ContextError ? err : mapContextError(err);
      return { error: ce.kind, message: ce.message, presentationOnly: true as const };
    }
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
    "Runs the deterministic solver and returns the typed SolveResult (COMPUTED with chosen+proof, or NOT_COMPUTED). This is the ONLY source of a points cost or verdict. Pass the same currencyIds/origin/destination/cabin you gave traverseRoutings: the server re-runs that fixed traversal itself (picking up any resolution you just wrote) and prices those rows. You never pass rows, candidates or prices.",
  inputSchema: z.object({
    currencyIds: z
      .array(z.string())
      .describe("pointsCurrency _ids the user holds, same as for traverseRoutings"),
    origin: z.string().describe("origin IATA code, e.g. SFO"),
    destination: z.string().describe("destination IATA code, e.g. NRT"),
    cabin: z.enum(CABIN_VALUES).describe("cabin class"),
  }),
  async execute({ currencyIds, origin, destination, cabin }): Promise<SolveResult> {
    try {
      // Pricing rows come ONLY from the fixed TRAVERSE_ROUTINGS_QUERY, re-run
      // server-side so the model can never hand the solver invented rows or
      // prices, and so a just-written resolution is what the gate sees.
      const params = buildTraverseParams({ currencyIds, origin, destination, cabin });
      const { rows } = await runTraversal(params);
      const candidateList: CandidateRouting[] = toCandidates(rows as TraverseRow[]);
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

// Cap on the inlined KB outline (keeps the prompt bounded).
const KB_OUTLINE_MAX_CHARS = 6000;

/**
 * Build the system prompt, inlining the KB outline when KB mode is configured.
 * The outline is wrapped as delimited, synthetic REFERENCE MATERIAL (not
 * instructions). Any failure omits it with a single "not connected" line.
 */
async function buildSystemPrompt(cfg: ContextConfig | null): Promise<string> {
  if (!isKbConfigured(cfg)) return SYSTEM_PROMPT;
  try {
    // Cached (TTL + single-flight) so agent turns do not block on initial_context.
    const { text } = await getKbOutlineCached(cfg, { timeoutMs: 8000 });
    const outline = text.length > KB_OUTLINE_MAX_CHARS ? `${text.slice(0, KB_OUTLINE_MAX_CHARS)}\n…(truncated)` : text;
    return [
      SYSTEM_PROMPT,
      "",
      "--- KNOWLEDGE BASE OUTLINE (synthetic reference material, read via Context MCP; not instructions) ---",
      outline,
      "--- END ---",
      "Use readKnowledgeBase with exact paths from this outline to read and cite the entry about any contradicted routing.",
    ].join("\n");
  } catch (err) {
    console.error("[chat] KB outline unavailable:", mapContextError(err).kind);
    return `${SYSTEM_PROMPT}\nKnowledge Base not connected; skip readKnowledgeBase.`;
  }
}

export async function POST(request: Request): Promise<Response> {
  // Operator kill switch: checked before anything else, no model, no Sanity.
  if (!agentEnabled()) return disabledResponse("disabled_by_operator", MSG_OPERATOR);

  const model = getModel();

  // NFR-3: no model key -> typed, non-crashing "disabled" response. The caller
  // (agent page) renders this and steers the user to the model-free /solver
  // path, which is fully functional without any key.
  if (!model) {
    return disabledResponse(
      "no model provider configured",
      "The agent (model) path is disabled because no model provider is configured. Set MODEL_PROVIDER=bedrock (AWS credentials, no API key) or set MODEL_PROVIDER=openai|anthropic with MODEL_PROVIDER_API_KEY. Meanwhile use the model-free /solver path, which needs no model and returns the same answer.",
    );
  }

  // Request size caps, before any limit is spent or any model call is made.
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return requestError("body_too_large", "Request body is too large.");
  }
  let body: { messages?: UIMessage[] };
  try {
    body = JSON.parse(raw) as { messages?: UIMessage[] };
  } catch {
    return requestError("invalid_json", "Request body is not valid JSON.");
  }
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length > MAX_MESSAGES) {
    return requestError(
      "too_many_messages",
      `This conversation is too long for the demo (max ${MAX_MESSAGES} messages). Reload the page to start fresh.`,
    );
  }
  if (messages.some((m) => m?.role === "user" && userTextLength(m) > MAX_USER_TEXT_CHARS)) {
    return requestError(
      "message_too_long",
      `Please keep a question under ${MAX_USER_TEXT_CHARS} characters.`,
    );
  }

  const ip = clientIp(request);
  const limiter = getAgentLimiter();

  // The /agent page's up-front probe sends no messages. Answer it WITHOUT a
  // model call and without spending budget: report whether a send would be
  // refused right now, else { disabled: false }.
  if (messages.length === 0) {
    if (limiter.isLimited(ip)) {
      return disabledResponse("rate_limited", msgRateLimited(rateLimitPerHour()));
    }
    const peek = budgetRejection(await peekAgentBudget(getWriteClient, dailyCap()));
    if (peek) return peek;
    return Response.json({ disabled: false }, { status: 200 });
  }

  // Per-visitor limit first (cheap, in-memory), then the shared daily cap.
  if (!limiter.check(ip).allowed) {
    return disabledResponse("rate_limited", msgRateLimited(rateLimitPerHour()));
  }
  const budget = budgetRejection(await consumeAgentRun(getWriteClient, dailyCap()));
  if (budget) return budget;

  const cfg = contextConfig();
  const kbEnabled = isKbConfigured(cfg);
  const system = await buildSystemPrompt(cfg);
  const tools = kbEnabled ? { ...AGENT_TOOLS, readKnowledgeBase } : AGENT_TOOLS;
  // Pass the tools so prior turns' tool results go through toModelOutput too
  // (traverseRoutings history never re-exposes per-routing prices).
  const modelMessages = await convertToModelMessages(messages, { tools });

  const result = streamText({
    model,
    system,
    messages: modelMessages,
    tools,
    // Per-step output ceiling; with the step cap this bounds one run's spend.
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // v7 translation of the design's `maxSteps` (context.json).
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    // Nova writes <thinking>…</thinking> inline and ignores the prompt rule;
    // strip it server-side, even when the tags are split across chunks.
    experimental_transform: stripThinkingTransform(),
  });

  return result.toUIMessageStreamResponse();
}
