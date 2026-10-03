"use client";

/**
 * app/solver/page.tsx — the model-free structured-form path (FR-9).
 *
 * A form takes origin / destination / cabin + the point currencies the user
 * holds and, on submit, drives the SAME pipeline straight-line (§9.1):
 *
 *   POST /api/traverse        — GROQ traversal (FR-2), returns §6 rows + query
 *   POST /api/contradictions  — KB read for the side-by-side issue view (FR-4)
 *   POST /api/solve (rows)     — gate check: returns NOT_COMPUTED while unresolved
 *   POST /api/resolve          — resolves the blocking contradiction (§7.4)
 *   POST /api/solve (rows)     — re-run after resolution -> COMPUTED proof
 *
 * No MODEL_PROVIDER_API_KEY is needed; the LLM is not in the loop. The result
 * is rendered via RoutingResult in the §9.2 order: gate (NotComputedCard) first,
 * then ResolutionCard, then ProofTable. The synthetic banner lives in the root
 * layout and stays visible. Every price shown originates from the solver's
 * typed output; absence renders as NOT_COMPUTED, never a guessed number.
 */

import { useState } from "react";
import type { Cabin, SolveResult } from "@/solver/types";
import { TRAVERSE_ROUTINGS_QUERY } from "@/lib/groq";
import type { ClaimProjection } from "@/lib/fixtures/sfo-nrt-business.rows";
import { RoutingResult } from "@/components/RoutingResult";
import type { ResolutionCardProps } from "@/components/ResolutionCard";

// The currencies a user can hold, mapped to their deterministic seed _ids (§5.1).
const CURRENCIES: { id: string; code: string; name: string }[] = [
  { id: "cur.amex", code: "AMEX_MR", name: "American Express Membership Rewards" },
  { id: "cur.chase", code: "CHASE_UR", name: "Chase Ultimate Rewards" },
];

const CABINS: Cabin[] = ["economy", "premium", "business", "first"];

// --- Shapes returned by the API routes (narrow local mirrors) ----------------

interface KBContradiction {
  _id: string;
  title: string;
  explanation?: string;
  claimA: ClaimProjection;
  claimB: ClaimProjection;
}

interface ResolvedPayload {
  kind: "RESOLVED";
  contradictionId: string;
  chosenClaim: "A" | "B";
  chosenPointsCost: number;
  chosenSourceId: string;
  rationale: string;
}

interface NotComputedResolvePayload {
  kind: "NOT_COMPUTED";
  reason: "UNRESOLVED_CONTRADICTION";
  blockingContradictionIds: string[];
  message: string;
}

type ResolveResponse = ResolvedPayload | NotComputedResolvePayload;

// §6 traversal row shape is defined in the fixture; we treat it opaquely here
// and hand it straight back to /api/solve, so a loose unknown[] suffices.
interface TraverseResponse {
  rows: unknown[];
  query: string;
  params: Record<string, unknown>;
}

interface PipelineState {
  queryTrace: { query: string; params: Record<string, unknown> };
  kbIssue?: KBContradiction;
  gatedResult?: SolveResult;
  resolution?: ResolutionCardProps;
  finalResult?: SolveResult;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as unknown;
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `request to ${url} failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export default function SolverPage() {
  const [origin, setOrigin] = useState("SFO");
  const [destination, setDestination] = useState("NRT");
  const [cabin, setCabin] = useState<Cabin>("business");
  const [held, setHeld] = useState<Record<string, boolean>>({
    "cur.amex": true,
    "cur.chase": true,
  });

  const [state, setState] = useState<PipelineState | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCurrency(id: string) {
    setHeld((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function runPipeline(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    setState(null);

    const currencyIds = CURRENCIES.filter((c) => held[c.id]).map((c) => c.id);

    try {
      if (currencyIds.length === 0) {
        throw new Error("Select at least one points currency you hold.");
      }

      // 1) GROQ traversal (FR-2). Returns raw §6 rows + the exact query issued.
      const traverse = await postJson<TraverseResponse>("/api/traverse", {
        currencyIds,
        origin,
        destination,
        cabin,
      });

      const next: PipelineState = {
        queryTrace: { query: traverse.query, params: traverse.params },
      };

      // Chart entry ids present in the traversal, for the KB (presentation) read.
      const chartEntryIds = Array.from(
        new Set(
          traverse.rows.flatMap((row) => {
            const entries =
              (row as { chartEntries?: { _id?: unknown }[] }).chartEntries ?? [];
            return entries
              .map((en) => en._id)
              .filter((id): id is string => typeof id === "string");
          }),
        ),
      );

      // 2) KB read (FR-4) — presentation only, drives the side-by-side view.
      if (chartEntryIds.length > 0) {
        try {
          const kb = await postJson<{ contradictions: KBContradiction[] }>(
            "/api/contradictions",
            { chartEntryIds },
          );
          if (kb.contradictions.length > 0) {
            next.kbIssue = kb.contradictions[0];
          }
        } catch {
          // Presentation-only; a KB read miss must not block the pipeline.
        }
      }

      // 3) Gate check: solve with the raw rows. While a contradiction is
      //    unresolved this returns NOT_COMPUTED(UNRESOLVED_CONTRADICTION).
      const gated = await postJson<SolveResult>("/api/solve", {
        origin,
        destination,
        cabin,
        rows: traverse.rows,
      });
      next.gatedResult = gated;
      setState({ ...next });

      // 4) If gated, resolve the blocking contradiction, then re-run solve.
      if (
        gated.kind === "NOT_COMPUTED" &&
        gated.reason === "UNRESOLVED_CONTRADICTION" &&
        gated.blockingContradictionIds &&
        gated.blockingContradictionIds.length > 0
      ) {
        const contradictionId = gated.blockingContradictionIds[0];
        const resolved = await postJson<ResolveResponse>("/api/resolve", {
          contradictionId,
        });

        if (resolved.kind === "RESOLVED") {
          next.resolution = {
            chosenClaim: resolved.chosenClaim,
            chosenPointsCost: resolved.chosenPointsCost,
            rationale: resolved.rationale,
            chosenSource: {
              _id: resolved.chosenSourceId,
              // Enrich the citation with the KB issue's source title/authority
              // when we have it (the chosen claim's dereferenced source).
              title:
                next.kbIssue && resolved.chosenClaim === "A"
                  ? next.kbIssue.claimA.source.title
                  : next.kbIssue && resolved.chosenClaim === "B"
                    ? next.kbIssue.claimB.source.title
                    : undefined,
              authority:
                next.kbIssue && resolved.chosenClaim === "A"
                  ? next.kbIssue.claimA.source.authority
                  : next.kbIssue && resolved.chosenClaim === "B"
                    ? next.kbIssue.claimB.source.authority
                    : undefined,
            },
          };
          setState({ ...next });

          // 5) Re-run solve now that the contradiction carries a resolution.
          const finalResult = await postJson<SolveResult>("/api/solve", {
            origin,
            destination,
            cabin,
            rows: traverse.rows,
          });
          next.finalResult = finalResult;
          setState({ ...next });
        } else {
          // Resolution itself degraded to NOT_COMPUTED (fail-closed): surface it.
          next.finalResult = {
            kind: "NOT_COMPUTED",
            reason: "UNRESOLVED_CONTRADICTION",
            blockingContradictionIds: resolved.blockingContradictionIds,
            message: resolved.message,
          };
          setState({ ...next });
        }
      } else {
        // No gate (or NO_VALID_ROUTING): the gated result is the final result.
        next.finalResult = gated;
        setState({ ...next });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "pipeline failed");
    } finally {
      setRunning(false);
    }
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
      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
        Model-free solver
      </h1>
      <p style={{ marginTop: 0, color: "#9a9aa2" }}>
        Runs the exact traversal → Knowledge-Base read → resolution →
        deterministic solver pipeline with no model in the loop (FR-9). Needs no
        API key.
      </p>

      <form
        onSubmit={runPipeline}
        style={{
          display: "grid",
          gap: "1rem",
          marginTop: "1.5rem",
          padding: "1.25rem 1.5rem",
          border: "1px solid #2a2a30",
          borderRadius: 10,
          background: "#121214",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <span style={labelText}>Origin</span>
            <input
              value={origin}
              onChange={(e) => setOrigin(e.target.value.toUpperCase())}
              style={inputStyle}
              aria-label="Origin IATA code"
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <span style={labelText}>Destination</span>
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value.toUpperCase())}
              style={inputStyle}
              aria-label="Destination IATA code"
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <span style={labelText}>Cabin</span>
            <select
              value={cabin}
              onChange={(e) => setCabin(e.target.value as Cabin)}
              style={inputStyle}
              aria-label="Cabin"
            >
              {CABINS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={{ ...labelText, padding: 0 }}>
            Points currencies you hold
          </legend>
          <div style={{ display: "flex", gap: "1rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
            {CURRENCIES.map((c) => (
              <label
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "0.9rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(held[c.id])}
                  onChange={() => toggleCurrency(c.id)}
                />
                {c.name} (<code>{c.code}</code>)
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <button
            type="submit"
            disabled={running}
            style={{
              padding: "0.65rem 1.25rem",
              background: running ? "#2a2a30" : "#3b6cff",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: running ? "default" : "pointer",
            }}
          >
            {running ? "Running pipeline…" : "Construct cheapest routing"}
          </button>
        </div>
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
          {error}
        </p>
      ) : null}

      {state ? (
        <div style={{ marginTop: "2rem" }}>
          <RoutingResult
            queryTrace={state.queryTrace}
            kbIssue={
              state.kbIssue
                ? {
                    title: state.kbIssue.title,
                    explanation: state.kbIssue.explanation,
                    claimA: state.kbIssue.claimA,
                    claimB: state.kbIssue.claimB,
                  }
                : undefined
            }
            gatedResult={state.gatedResult}
            resolution={state.resolution}
            finalResult={state.finalResult}
          />
        </div>
      ) : null}
    </main>
  );
}

const labelText: React.CSSProperties = {
  fontSize: "0.78rem",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#8a8a90",
};

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.6rem",
  background: "#1c1c20",
  color: "#e8e8ea",
  border: "1px solid #3a3a40",
  borderRadius: 6,
  fontSize: "0.95rem",
  minWidth: 120,
};
