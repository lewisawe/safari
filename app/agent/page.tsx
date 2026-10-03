"use client";

/**
 * app/agent/page.tsx — the LLM (agent) path that SHOWS ITS WORK (FR-8, §8.2).
 *
 * It drives the Vercel AI SDK v7 chat endpoint (`/api/chat`) via `useChat` from
 * @ai-sdk/react. The model chains the four §8.1 tools; this page renders the
 * TYPED TOOL RESULTS by reusing the exact FEAT-005 components (QueryTrace,
 * KBIssueView, ResolutionCard, ProofTable, NotComputedCard via RoutingResult).
 *
 * STRUCTURAL GUARD (§8.2, defense-in-depth beyond the prompt): prices are
 * rendered ONLY from the `runSolver` tool-result object in a message's parts
 * (`type === "tool-runSolver"` with `output`). The model's free text is shown
 * as narration ONLY — it can never occupy a price slot. So even a misbehaving
 * model cannot surface a fabricated number: the price cells read exclusively
 * from the structured solver output.
 *
 * NFR-3: if MODEL_PROVIDER_API_KEY is absent the /api/chat route returns a typed
 * `{ disabled: true }` payload; we detect that (via a probe) and steer the user
 * to the model-free /solver path, which needs no key. The synthetic banner is
 * in the root layout and stays visible. The same payload (reason daily_cap,
 * rate_limited or disabled_by_operator) is caught on a mid-session send by the
 * chat transport's fetch, which swaps the page to the disabled card.
 *
 * PRESENTATION NOTE (FEAT-004): this file was restyled from dark inline styles
 * to the DESIGN.md light theme (Warm Card Surface messages, outlined/ghost
 * send action, graceful on-palette disabled card). The structural price guard,
 * the /api/chat probe, and the useChat wiring are UNCHANGED — only className /
 * markup differs.
 */

import { useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import Link from "next/link";

import type { SolveResult, SolveComputed } from "@/solver/types";
import type { ClaimProjection } from "@/lib/fixtures/sfo-nrt-business.rows";
import { QueryTrace } from "@/components/QueryTrace";
import { KBIssueView } from "@/components/KBIssueView";
import { ResolutionCard } from "@/components/ResolutionCard";
import { ProofTable } from "@/components/ProofTable";
import { NotComputedCard } from "@/components/NotComputedCard";
import { KBEvidencePanel, MarkdownText } from "@/components/KBEvidencePanel";
import type { KbEvidence } from "@/lib/kbEvidence";
import { agentKbToEvidence, kbToolOutputToEvidence } from "@/lib/kbToolEvidence";
import { stripThinkingText } from "@/lib/stripThinking";
import { ResetDemoButton } from "@/components/ResetDemoButton";
import { EXAMPLE_CHIP_CLASS, EXAMPLE_TRIPS } from "@/lib/examples";

// --- Narrow local mirrors of the tool-result shapes (from /api/chat tools) ---

interface TraverseOutput {
  rows: unknown[];
  query: string;
  params: Record<string, unknown>;
  gatingAuthority: string;
  via?: string;
  /** Server-side KB evidence about the contradicted entry (evidence only). */
  knowledgeBase?: unknown;
}

/** readKnowledgeBase tool output (Context MCP KB mode) — evidence only.
 *  Mapped to KbEvidence by the pure lib/kbToolEvidence helper, which keeps
 *  the typed error kind + message. */

interface KBContradiction {
  _id: string;
  title: string;
  explanation?: string;
  claimA: ClaimProjection;
  claimB: ClaimProjection;
}

interface ReadContradictionsOutput {
  contradictions: KBContradiction[];
  presentationOnly: true;
}

interface ResolvedOutput {
  kind: "RESOLVED";
  contradictionId: string;
  chosenClaim: "A" | "B";
  chosenPointsCost: number;
  chosenSourceId: string;
  chosenSourceTitle?: string;
  chosenSourceAuthority?: string;
  rationale: string;
}

interface ResolveNotComputedOutput {
  kind: "NOT_COMPUTED";
  reason: "UNRESOLVED_CONTRADICTION";
  blockingContradictionIds: string[];
  message: string;
}

type ResolveOutput = ResolvedOutput | ResolveNotComputedOutput;

// A single message part. We only read the fields we render; `output` on a
// tool part is the typed tool result object.
interface MessagePart {
  type: string;
  text?: string;
  state?: string;
  output?: unknown;
}

// The first example is the SFO→NRT gate demo (same text as before).
const SAMPLE_PROMPT = EXAMPLE_TRIPS[0].prompt;

/** The typed `{ disabled: true }` payload /api/chat returns instead of a stream. */
interface DisabledState {
  disabled: boolean;
  reason?: string;
  message?: string;
}

/** Card heading per disabled reason (no-model and operator share the default). */
function disabledHeading(reason: string | undefined): string {
  if (reason === "daily_cap") return "DAILY DEMO BUDGET REACHED";
  if (reason === "rate_limited") return "HOURLY LIMIT REACHED";
  return "AGENT PATH DISABLED";
}

/**
 * Thrown by the chat transport's fetch when /api/chat answers a send with the
 * typed disabled JSON (daily cap, rate limit, kill switch) instead of a
 * stream. The page shows the disabled card, not this error.
 */
class AgentUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentUnavailableError";
  }
}

// --- Type guards for the structural guard ------------------------------------

function isSolveResult(v: unknown): v is SolveResult {
  if (!v || typeof v !== "object") return false;
  const k = (v as { kind?: unknown }).kind;
  return k === "COMPUTED" || k === "NOT_COMPUTED";
}

function hasOutput(part: MessagePart): part is MessagePart & { output: unknown } {
  // v7 tool parts expose the result on `output` once state is output-available.
  return part.output !== undefined && part.output !== null;
}

export default function AgentPage() {
  // NFR-3 probe: ask the chat route up front whether the model path is enabled.
  // The route returns a typed `{ disabled: true }` JSON (not a stream) when the
  // key is absent, the operator switched it off, or the demo cost guard (daily
  // cap / per-visitor rate limit) would refuse a send. undefined = not yet probed.
  const [modelDisabled, setModelDisabled] = useState<DisabledState | undefined>(undefined);

  // A send can also be refused mid-session (cap or rate limit hit after the
  // probe). Then /api/chat answers with JSON, not a stream: intercept it here,
  // switch the page to the disabled card, and fail the request quietly instead
  // of letting the stream parser choke on a JSON body.
  const [transport] = useState(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const ct = res.headers.get("content-type") ?? "";
          if (!ct.includes("application/json")) return res;
          const data = (await res.json().catch(() => null)) as
            | { disabled?: boolean; reason?: string; message?: string; error?: string }
            | null;
          if (data?.disabled) {
            setModelDisabled({ disabled: true, reason: data.reason, message: data.message });
            throw new AgentUnavailableError(data.message ?? "The agent path is unavailable.");
          }
          throw new Error(
            data?.message ?? data?.error ?? `The agent request failed (${res.status}).`,
          );
        },
      }),
  );
  const { messages, sendMessage, status, error } = useChat({ transport });
  const [input, setInput] = useState(SAMPLE_PROMPT);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: [] }),
        });
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          const data = (await res.json()) as DisabledState;
          if (!cancelled && data.disabled) {
            setModelDisabled({ disabled: true, reason: data.reason, message: data.message });
            return;
          }
        }
        if (!cancelled) setModelDisabled({ disabled: false });
      } catch {
        if (!cancelled) setModelDisabled({ disabled: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const busy = status === "submitted" || status === "streaming";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    void sendMessage({ text });
    setInput("");
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-[var(--spacing-24)] pb-[var(--spacing-80)] pt-[var(--spacing-56)] font-[family-name:var(--font-jobytext)] text-[var(--color-carbon-ink)] sm:px-[var(--spacing-40)]">
      <header className="max-w-[60ch]">
        <p className="font-[family-name:var(--font-joby-sans-display)] text-[length:var(--text-caption)] font-medium tracking-[var(--tracking-caption)] text-[var(--color-outlined-action)]">
          AGENT PATH · SHOWS ITS WORK
        </p>
        <h1 className="mt-[var(--spacing-16)] font-[family-name:var(--font-jobydisplay)] text-[clamp(40px,6vw,64px)] font-medium leading-[var(--leading-heading-sm)] tracking-[var(--tracking-heading-sm)] text-[var(--color-carbon-ink)]">
          Agent path
        </h1>
        <p className="mt-[var(--spacing-16)] font-[family-name:var(--font-jobytext)] text-[length:var(--text-body-lg)] font-[450] leading-[var(--leading-body-lg)] tracking-[var(--tracking-body-lg)] text-[color-mix(in_srgb,var(--color-carbon-ink)_72%,transparent)]">
          The model chains four Sanity Context tools (GROQ traversal,
          Knowledge-Base read, resolve, solver) and shows its work. Prices come
          only from the <code>runSolver</code> tool result — free text is
          narration (§8.2 structural guard).
        </p>
      </header>

      {modelDisabled?.disabled ? (
        <section
          role="status"
          className="mt-[var(--spacing-40)] max-w-[60ch] rounded-[var(--radius-2xl)] border border-[color-mix(in_srgb,var(--color-carbon-ink)_12%,transparent)] bg-[var(--color-parchment-cream)] p-[var(--spacing-40)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]"
        >
          <p className="font-[family-name:var(--font-joby-sans-display)] text-[length:var(--text-caption)] font-medium tracking-[var(--tracking-caption)] text-[var(--color-outlined-action)]">
            {disabledHeading(modelDisabled.reason)}
          </p>
          <p className="mt-[var(--spacing-16)] font-[family-name:var(--font-jobytext)] text-[length:var(--text-body)] font-[450] leading-[var(--leading-body)] tracking-[var(--tracking-body)] text-[var(--color-carbon-ink)]">
            {modelDisabled.message ??
              "MODEL_PROVIDER_API_KEY is not set. The model-free solver path needs no API key and returns the same answer."}
          </p>
          <Link
            href="/solver"
            className="mt-[var(--spacing-24)] inline-flex items-center rounded-[var(--radius-full)] border border-[var(--color-outlined-action)] bg-transparent px-[var(--spacing-24)] py-[var(--spacing-8)] font-[family-name:var(--font-jobytext)] text-[length:var(--text-body)] font-medium tracking-[var(--tracking-body)] text-[var(--color-outlined-action)] no-underline"
          >
            Use the model-free solver path →
          </Link>
        </section>
      ) : null}

      {/* Example prompts: a chip fills the textarea and never sends. */}
      <div
        role="group"
        aria-label="Example questions"
        className="mt-[var(--spacing-40)] flex flex-wrap gap-[var(--spacing-8)]"
      >
        {EXAMPLE_TRIPS.map((ex) => (
          <button
            key={ex.label}
            type="button"
            title={ex.hint}
            disabled={busy || Boolean(modelDisabled?.disabled)}
            onClick={() => setInput(ex.prompt)}
            className={EXAMPLE_CHIP_CLASS}
          >
            {ex.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={onSubmit}
        className="mt-[var(--spacing-16)] flex flex-col items-stretch gap-[var(--spacing-16)] sm:flex-row sm:items-start"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          aria-label="Message to the agent"
          placeholder="Describe your trip and the point currencies you hold…"
          className="flex-1 resize-y rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-carbon-ink)_22%,transparent)] bg-[color-mix(in_srgb,var(--color-parchment-cream)_60%,white)] p-[var(--spacing-16)] font-[family-name:var(--font-jobytext)] text-[length:var(--text-body)] font-[450] leading-[var(--leading-body)] tracking-[var(--tracking-body)] text-[var(--color-carbon-ink)] outline-none focus:border-[var(--color-outlined-action)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-outlined-action)] disabled:opacity-55"
          disabled={Boolean(modelDisabled?.disabled)}
        />
        {/* Outlined Action (ghost pill) — never a filled rectangle */}
        <button
          type="submit"
          disabled={busy || Boolean(modelDisabled?.disabled)}
          className="inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-full)] border border-[var(--color-outlined-action)] bg-transparent px-[var(--spacing-24)] py-[var(--spacing-8)] font-[family-name:var(--font-jobytext)] text-[length:var(--text-body)] font-medium tracking-[var(--tracking-body)] text-[var(--color-outlined-action)] transition-opacity disabled:cursor-default disabled:opacity-55"
        >
          {busy ? "Working…" : "Send"}
        </button>
      </form>

      {error && !modelDisabled?.disabled && error.name !== "AgentUnavailableError" ? (
        <p
          role="alert"
          className="mt-[var(--spacing-24)] max-w-[60ch] rounded-[var(--radius-2xl)] border border-[color-mix(in_srgb,var(--color-sunset-orange)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-peach-glow)_55%,var(--color-parchment-cream))] p-[var(--spacing-32)] text-[length:var(--text-body)] font-[450] leading-[var(--leading-body)] tracking-[var(--tracking-body)] text-[var(--color-carbon-ink)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]"
        >
          {error.message}
        </p>
      ) : null}

      <div className="mt-[var(--spacing-24)]">
        <ResetDemoButton />
      </div>

      <div className="mt-[var(--spacing-40)] flex flex-col gap-[var(--spacing-24)]">
        {messages.map((message: UIMessage) => (
          <MessageView key={message.id} message={message} />
        ))}
      </div>
    </main>
  );
}

/**
 * Renders one chat message. User text is shown plainly. For assistant messages
 * we iterate the parts in order:
 *   - text parts  -> NARRATION ONLY (never a price slot)
 *   - tool parts  -> rendered via the typed FEAT-005 components
 * The runSolver tool part is the ONLY place a price appears (structural guard).
 */
function MessageView({ message }: { message: UIMessage }) {
  const parts = (message.parts ?? []) as MessagePart[];
  const isUser = message.role === "user";

  return (
    <article className="rounded-[var(--radius-2xl)] border border-[color-mix(in_srgb,var(--color-carbon-ink)_12%,transparent)] bg-[var(--color-parchment-cream)] p-[var(--spacing-32)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]">
      <div className="font-[family-name:var(--font-joby-sans-display)] text-[length:var(--text-caption)] font-medium uppercase tracking-[var(--tracking-caption)] text-[color-mix(in_srgb,var(--color-carbon-ink)_60%,transparent)]">
        {isUser ? "You" : "Safari agent"}
      </div>
      <div className="mt-[var(--spacing-16)] flex flex-col gap-[var(--spacing-24)]">
        {parts.map((part, i) => (
          <PartView key={i} part={part} />
        ))}
      </div>
    </article>
  );
}

/**
 * Amazon Nova emits its chain of thought as `<thinking>…</thinking>` inside the
 * text stream. /api/chat strips it server-side; this is defense-in-depth with
 * the same rules (complete blocks and a still-open trailing block).
 */
function stripThinking(text: string): string {
  return stripThinkingText(text).trim();
}

function PartView({ part }: { part: MessagePart }) {
  // Free text = narration only (NEVER a price slot).
  if (part.type === "text") {
    const text = stripThinking(part.text ?? "");
    if (!text) return null;
    return <MarkdownText text={text} />;
  }

  // --- Tool-result parts: render the typed output via FEAT-005 components. ---

  if (part.type === "tool-traverseRoutings" && hasOutput(part)) {
    const out = part.output as TraverseOutput;
    return (
      <div>
        <ToolBadge name="traverseRoutings" note="GROQ traversal · gating authority" />
        <div className="mt-[var(--spacing-16)]">
          <QueryTrace query={out.query} params={out.params} via={out.via} />
        </div>
        <p className="mt-[var(--spacing-8)] mb-0 text-[length:var(--text-caption)] font-[450] tracking-[var(--tracking-caption)] text-[color-mix(in_srgb,var(--color-carbon-ink)_60%,transparent)]">
          {out.gatingAuthority}
        </p>
        {out.knowledgeBase ? (
          <div className="mt-[var(--spacing-16)]">
            <ToolBadge
              name="knowledgeBase"
              note="read server-side via Context MCP · evidence only, never a price"
            />
            <div className="mt-[var(--spacing-16)]">
              <KBEvidencePanel evidence={agentKbToEvidence(out.knowledgeBase)} />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (part.type === "tool-readContradictions" && hasOutput(part)) {
    const out = part.output as ReadContradictionsOutput;
    const issue = out.contradictions?.[0];
    if (!issue) {
      return (
        <div>
          <ToolBadge name="readContradictions" note="Knowledge Base · presentation only" />
          <p className="mt-[var(--spacing-8)] mb-0 text-[length:var(--text-body-sm)] font-[450] tracking-[var(--tracking-body-sm)] text-[color-mix(in_srgb,var(--color-carbon-ink)_60%,transparent)]">
            No contradictions on these entries.
          </p>
        </div>
      );
    }
    return (
      <div>
        <ToolBadge name="readContradictions" note="Knowledge Base · presentation only" />
        <div className="mt-[var(--spacing-16)]">
          <KBIssueView
            title={issue.title}
            explanation={issue.explanation}
            claimA={issue.claimA}
            claimB={issue.claimB}
          />
        </div>
      </div>
    );
  }

  if (part.type === "tool-resolveContradiction" && hasOutput(part)) {
    const out = part.output as ResolveOutput;
    if (out.kind === "RESOLVED") {
      return (
        <div>
          <ToolBadge name="resolveContradiction" note="writes Sanity" />
          <div className="mt-[var(--spacing-16)]">
            <ResolutionCard
              chosenClaim={out.chosenClaim}
              chosenPointsCost={out.chosenPointsCost}
              rationale={out.rationale}
              chosenSource={{
                _id: out.chosenSourceId,
                title: out.chosenSourceTitle,
                authority: out.chosenSourceAuthority,
              }}
            />
          </div>
        </div>
      );
    }
    // Fail-closed resolve result -> NOT_COMPUTED card, no price.
    return (
      <div>
        <ToolBadge name="resolveContradiction" note="writes Sanity" />
        <div className="mt-[var(--spacing-16)]">
          <NotComputedCard
            result={{
              kind: "NOT_COMPUTED",
              reason: out.reason,
              blockingContradictionIds: out.blockingContradictionIds,
              message: out.message,
            }}
          />
        </div>
      </div>
    );
  }

  // Knowledge Base evidence (Context MCP) — presentation only, never a price.
  if (part.type === "tool-readKnowledgeBase" && hasOutput(part)) {
    const evidence: KbEvidence = kbToolOutputToEvidence(part.output);
    return (
      <div>
        <ToolBadge
          name="readKnowledgeBase"
          note="Knowledge Base via Context MCP · evidence only"
        />
        <div className="mt-[var(--spacing-16)]">
          <KBEvidencePanel evidence={evidence} />
        </div>
      </div>
    );
  }

  // STRUCTURAL GUARD: the ONLY price slot. Prices render exclusively from the
  // runSolver tool-result object — never from any text part above.
  if (part.type === "tool-runSolver" && hasOutput(part)) {
    const out = part.output;
    if (!isSolveResult(out)) {
      // Malformed tool output: refuse to show a number, fail closed.
      return (
        <div>
          <ToolBadge name="runSolver" note="deterministic solver" />
          <div className="mt-[var(--spacing-16)]">
            <NotComputedCard
              result={{
                kind: "NOT_COMPUTED",
                reason: "NO_VALID_ROUTING",
                message: "Solver returned no readable result.",
              }}
            />
          </div>
        </div>
      );
    }
    return (
      <div>
        <ToolBadge name="runSolver" note="deterministic solver · the only price source" />
        <div className="mt-[var(--spacing-16)]">
          {out.kind === "COMPUTED" ? (
            <ProofTable result={out as SolveComputed} />
          ) : (
            <NotComputedCard result={out} />
          )}
        </div>
      </div>
    );
  }

  // Any other part type (step markers, streaming tool-input, etc.) is not
  // rendered — crucially, no price can originate from an unrecognized part.
  return null;
}

function ToolBadge({ name, note }: { name: string; note: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-[var(--spacing-8)]">
      {/* A11y (FEAT-005): Outlined Action (#083e6f, 9.79:1 on cream) replaces
          Electric Blue (#007ae5, 3.84:1) for this 12px label so the tool name
          clears 4.5:1. Still an isolated blue-register outlined chip, matching
          the WINNER/RESOLVED chips. */}
      <code className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-outlined-action)_55%,transparent)] px-[0.45rem] py-[0.1rem] text-[length:var(--text-caption)] font-medium tracking-[var(--tracking-caption)] text-[var(--color-outlined-action)]">
        {name}
      </code>
      <span className="text-[length:var(--text-caption)] font-[450] tracking-[var(--tracking-caption)] text-[color-mix(in_srgb,var(--color-carbon-ink)_60%,transparent)]">
        {note}
      </span>
    </div>
  );
}
