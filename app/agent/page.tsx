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
 * in the root layout and stays visible.
 */

import { useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import Link from "next/link";

import type { SolveResult, SolveComputed } from "@/solver/types";
import type { ClaimProjection } from "@/lib/fixtures/sfo-nrt-business.rows";
import { QueryTrace } from "@/components/QueryTrace";
import { KBIssueView } from "@/components/KBIssueView";
import { ResolutionCard } from "@/components/ResolutionCard";
import { ProofTable } from "@/components/ProofTable";
import { NotComputedCard } from "@/components/NotComputedCard";

// --- Narrow local mirrors of the tool-result shapes (from /api/chat tools) ---

interface TraverseOutput {
  rows: unknown[];
  query: string;
  params: Record<string, unknown>;
  gatingAuthority: string;
}

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

const SAMPLE_PROMPT =
  "SFO to NRT in business. I hold Amex MR (cur.amex) and Chase UR (cur.chase). Find the cheapest valid routing and prove it.";

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
  const { messages, sendMessage, status, error } = useChat();
  const [input, setInput] = useState(SAMPLE_PROMPT);

  // NFR-3 probe: ask the chat route up front whether the model path is enabled.
  // The route returns a typed `{ disabled: true }` JSON (not a stream) when the
  // key is absent. undefined = not yet probed.
  const [modelDisabled, setModelDisabled] = useState<
    { disabled: boolean; message?: string } | undefined
  >(undefined);

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
          const data = (await res.json()) as { disabled?: boolean; message?: string };
          if (!cancelled && data.disabled) {
            setModelDisabled({ disabled: true, message: data.message });
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
    <main
      style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: "2.5rem 1.5rem 4rem",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>Agent path</h1>
      <p style={{ marginTop: 0, color: "#9a9aa2" }}>
        The model chains four Sanity Context tools (GROQ traversal, Knowledge-Base
        read, resolve, solver) and shows its work. Prices come only from the{" "}
        <code>runSolver</code> tool result — free text is narration (§8.2
        structural guard).
      </p>

      {modelDisabled?.disabled ? (
        <section
          role="status"
          style={{
            marginTop: "1.5rem",
            padding: "1rem 1.25rem",
            border: "1px solid #5a4a1a",
            background: "#1c180e",
            borderRadius: 10,
            color: "#e8d9a0",
          }}
        >
          <strong>Agent path disabled.</strong>{" "}
          {modelDisabled.message ??
            "MODEL_PROVIDER_API_KEY is not set."}{" "}
          <Link href="/solver" style={{ color: "#9fc0ff" }}>
            Use the model-free solver path →
          </Link>{" "}
          (needs no API key and returns the same answer).
        </section>
      ) : null}

      <form
        onSubmit={onSubmit}
        style={{
          display: "flex",
          gap: "0.75rem",
          marginTop: "1.5rem",
          alignItems: "flex-start",
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          aria-label="Message to the agent"
          placeholder="Describe your trip and the point currencies you hold…"
          style={{
            flex: 1,
            padding: "0.65rem 0.75rem",
            background: "#1c1c20",
            color: "#e8e8ea",
            border: "1px solid #3a3a40",
            borderRadius: 8,
            fontSize: "0.95rem",
            resize: "vertical",
            fontFamily: "inherit",
          }}
          disabled={Boolean(modelDisabled?.disabled)}
        />
        <button
          type="submit"
          disabled={busy || Boolean(modelDisabled?.disabled)}
          style={{
            padding: "0.65rem 1.25rem",
            background: busy || modelDisabled?.disabled ? "#2a2a30" : "#3b6cff",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: busy || modelDisabled?.disabled ? "default" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {busy ? "Working…" : "Send"}
        </button>
      </form>

      {error ? (
        <p
          role="alert"
          style={{
            marginTop: "1.25rem",
            padding: "0.75rem 1rem",
            border: "1px solid #5a1a1a",
            background: "#1c0e0e",
            borderRadius: 8,
            color: "#ffb0b0",
            fontSize: "0.9rem",
          }}
        >
          {error.message}
        </p>
      ) : null}

      <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
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
    <div
      style={{
        border: "1px solid #22222a",
        borderRadius: 10,
        padding: "1rem 1.25rem",
        background: isUser ? "#121214" : "#0e0e10",
      }}
    >
      <div
        style={{
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#7a7a82",
          marginBottom: "0.6rem",
        }}
      >
        {isUser ? "You" : "Safari agent"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {parts.map((part, i) => (
          <PartView key={i} part={part} />
        ))}
      </div>
    </div>
  );
}

function PartView({ part }: { part: MessagePart }) {
  // Free text = narration only (NEVER a price slot).
  if (part.type === "text") {
    if (!part.text) return null;
    return (
      <p style={{ margin: 0, color: "#d7d7dc", whiteSpace: "pre-wrap" }}>
        {part.text}
      </p>
    );
  }

  // --- Tool-result parts: render the typed output via FEAT-005 components. ---

  if (part.type === "tool-traverseRoutings" && hasOutput(part)) {
    const out = part.output as TraverseOutput;
    return (
      <div>
        <ToolBadge name="traverseRoutings" note="GROQ traversal · gating authority" />
        <div style={{ marginTop: "0.6rem" }}>
          <QueryTrace query={out.query} params={out.params} />
        </div>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.76rem", color: "#8a8a90" }}>
          {out.gatingAuthority}
        </p>
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
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#8a8a90" }}>
            No contradictions on these entries.
          </p>
        </div>
      );
    }
    return (
      <div>
        <ToolBadge name="readContradictions" note="Knowledge Base · presentation only" />
        <div style={{ marginTop: "0.6rem" }}>
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
          <div style={{ marginTop: "0.6rem" }}>
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
        <div style={{ marginTop: "0.6rem" }}>
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

  // STRUCTURAL GUARD: the ONLY price slot. Prices render exclusively from the
  // runSolver tool-result object — never from any text part above.
  if (part.type === "tool-runSolver" && hasOutput(part)) {
    const out = part.output;
    if (!isSolveResult(out)) {
      // Malformed tool output: refuse to show a number, fail closed.
      return (
        <div>
          <ToolBadge name="runSolver" note="deterministic solver" />
          <NotComputedCard
            result={{
              kind: "NOT_COMPUTED",
              reason: "NO_VALID_ROUTING",
              message: "Solver returned no readable result.",
            }}
          />
        </div>
      );
    }
    return (
      <div>
        <ToolBadge name="runSolver" note="deterministic solver · the only price source" />
        <div style={{ marginTop: "0.6rem" }}>
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
    <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
      <code
        style={{
          padding: "0.1rem 0.45rem",
          borderRadius: 5,
          background: "#1c2a44",
          color: "#9fc0ff",
          fontSize: "0.72rem",
          fontWeight: 700,
        }}
      >
        {name}
      </code>
      <span style={{ fontSize: "0.74rem", color: "#8a8a90" }}>{note}</span>
    </div>
  );
}
