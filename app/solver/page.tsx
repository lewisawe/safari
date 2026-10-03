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
 *
 * PRESENTATION NOTE (FEAT-004): this file was restyled from dark inline styles
 * to the DESIGN.md light theme (Parchment Cream canvas, outlined/ghost action,
 * Warm Card Surface form, loading/empty/error states). The pipeline — the five
 * fetch calls, their exact request bodies, the currency _ids cur.amex/cur.chase
 * sent to /api/traverse, the `held` logic, and the <RoutingResult/> wiring — is
 * UNCHANGED. Only className/markup differs.
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

/** committedResolution as projected by the §6 traversal (when already resolved). */
interface CommittedResolutionRow {
  chosenClaim: "A" | "B";
  chosenPointsCost: number;
  rationale: string;
  chosenSource?: { _id: string; title?: string; authority?: string } | null;
}

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

          // 5) Re-traverse so the rows carry the committedResolution that
          //    /api/resolve just wrote (§9.1: resolve write + re-traverse),
          //    then re-run solve on those fresh rows. Re-solving the STALE
          //    pre-resolution rows would just re-fire the gate.
          const retraverse = await postJson<TraverseResponse>("/api/traverse", {
            currencyIds,
            origin,
            destination,
            cabin,
          });
          const finalResult = await postJson<SolveResult>("/api/solve", {
            origin,
            destination,
            cabin,
            rows: retraverse.rows,
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
        // If the contradiction was already resolved on an earlier run, surface
        // that committed resolution (read straight from the traversal rows) so
        // the "decision carried forward" beat is visible instead of silently
        // skipping from the contradiction to the proof. Presentation only.
        const committed = traverse.rows
          .flatMap(
            (row) =>
              (row as { chartEntries?: { contradictions?: unknown[] }[] })
                .chartEntries ?? [],
          )
          .flatMap((en) => en.contradictions ?? [])
          .map(
            (c) =>
              (c as { committedResolution?: CommittedResolutionRow | null })
                .committedResolution,
          )
          .find((r): r is CommittedResolutionRow => Boolean(r));
        if (committed) {
          next.resolution = {
            chosenClaim: committed.chosenClaim,
            chosenPointsCost: committed.chosenPointsCost,
            rationale: committed.rationale,
            chosenSource: {
              _id: committed.chosenSource?._id ?? "unknown",
              title: committed.chosenSource?.title,
              authority: committed.chosenSource?.authority,
            },
            carriedForward: true,
          };
        }
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
    <main className="mx-auto w-full max-w-[1200px] px-[var(--spacing-24)] pb-[var(--spacing-80)] pt-[var(--spacing-56)] font-[family-name:var(--font-jobytext)] text-[var(--color-carbon-ink)] sm:px-[var(--spacing-40)]">
      <header className="max-w-[60ch]">
        <p className="font-[family-name:var(--font-joby-sans-display)] text-[length:var(--text-caption)] font-medium tracking-[var(--tracking-caption)] text-[var(--color-outlined-action)]">
          TRIP REQUEST · MODEL-FREE
        </p>
        <h1 className="mt-[var(--spacing-16)] font-[family-name:var(--font-jobydisplay)] text-[clamp(40px,6vw,64px)] font-medium leading-[var(--leading-heading-sm)] tracking-[var(--tracking-heading-sm)] text-[var(--color-carbon-ink)]">
          Construct the cheapest routing
        </h1>
        <p className="mt-[var(--spacing-16)] font-[family-name:var(--font-jobytext)] text-[length:var(--text-body-lg)] font-[450] leading-[var(--leading-body-lg)] tracking-[var(--tracking-body-lg)] text-[color-mix(in_srgb,var(--color-carbon-ink)_72%,transparent)]">
          Runs the exact traversal → Knowledge-Base read → resolution →
          deterministic solver pipeline with no model in the loop (FR-9). Needs
          no API key.
        </p>
      </header>

      <div className="mt-[var(--spacing-40)] grid grid-cols-1 gap-[var(--spacing-40)]">
        {/* Form on top, results full-width below: the proof table and GROQ
            trace need the full 1200px column to show every column legibly. */}
        {/* ---------------------------------------------------------------- */}
        {/* Trip-request form — Warm Card Surface                            */}
        {/* ---------------------------------------------------------------- */}
        <form
          onSubmit={runPipeline}
          className="grid h-max max-w-[720px] gap-[var(--spacing-24)] rounded-[var(--radius-2xl)] border border-[color-mix(in_srgb,var(--color-carbon-ink)_12%,transparent)] bg-[var(--color-parchment-cream)] p-[var(--spacing-40)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]"
        >
          <div className="grid grid-cols-1 gap-[var(--spacing-16)] sm:grid-cols-2">
            <label className="flex flex-col gap-[var(--spacing-8)]">
              <span className={LABEL_CLASS}>Origin</span>
              <input
                value={origin}
                onChange={(e) => setOrigin(e.target.value.toUpperCase())}
                className={INPUT_CLASS}
                aria-label="Origin IATA code"
              />
            </label>
            <label className="flex flex-col gap-[var(--spacing-8)]">
              <span className={LABEL_CLASS}>Destination</span>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value.toUpperCase())}
                className={INPUT_CLASS}
                aria-label="Destination IATA code"
              />
            </label>
          </div>

          <label className="flex flex-col gap-[var(--spacing-8)]">
            <span className={LABEL_CLASS}>Cabin</span>
            <select
              value={cabin}
              onChange={(e) => setCabin(e.target.value as Cabin)}
              className={INPUT_CLASS}
              aria-label="Cabin"
            >
              {CABINS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="m-0 border-0 p-0">
            <legend className={`${LABEL_CLASS} p-0`}>
              Points currencies you hold
            </legend>
            <div className="mt-[var(--spacing-16)] flex flex-col gap-[var(--spacing-8)]">
              {CURRENCIES.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-[var(--spacing-8)] text-[length:var(--text-body-sm)] font-[450] tracking-[var(--tracking-body-sm)] text-[var(--color-carbon-ink)]"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(held[c.id])}
                    onChange={() => toggleCurrency(c.id)}
                    className="h-[var(--spacing-16)] w-[var(--spacing-16)] accent-[var(--color-outlined-action)]"
                  />
                  <span>
                    {c.name} (<code>{c.code}</code>)
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-[var(--spacing-8)]">
            {/* Outlined Action (ghost pill) — never a filled rectangle */}
            <button
              type="submit"
              disabled={running}
              className="inline-flex items-center rounded-[var(--radius-full)] border border-[var(--color-outlined-action)] bg-transparent px-[var(--spacing-24)] py-[var(--spacing-8)] font-[family-name:var(--font-jobytext)] text-[length:var(--text-body)] font-medium tracking-[var(--tracking-body)] text-[var(--color-outlined-action)] transition-opacity disabled:cursor-default disabled:opacity-55"
            >
              {running ? "Running pipeline…" : "Construct cheapest routing"}
            </button>
          </div>
        </form>

        {/* ---------------------------------------------------------------- */}
        {/* Results column — loading / error / empty / result               */}
        {/* ---------------------------------------------------------------- */}
        <section className="min-w-0" aria-live="polite">
          {running ? <RunningIndicator /> : null}

          {error ? (
            <p
              role="alert"
              className="rounded-[var(--radius-2xl)] border border-[color-mix(in_srgb,var(--color-sunset-orange)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-peach-glow)_55%,var(--color-parchment-cream))] p-[var(--spacing-32)] text-[length:var(--text-body)] font-[450] leading-[var(--leading-body)] tracking-[var(--tracking-body)] text-[var(--color-carbon-ink)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]"
            >
              {error}
            </p>
          ) : null}

          {state ? (
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
          ) : null}

          {!running && !error && !state ? <EmptyState /> : null}
        </section>
      </div>
    </main>
  );
}

/**
 * Loading indicator driven by the existing `running` flag. The animated dots
 * are purely decorative (aria-hidden) and the global prefers-reduced-motion
 * guard in globals.css flattens the animation; the text carries the meaning.
 */
function RunningIndicator() {
  return (
    <div className="rounded-[var(--radius-2xl)] border border-[color-mix(in_srgb,var(--color-carbon-ink)_12%,transparent)] bg-[var(--color-parchment-cream)] p-[var(--spacing-40)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]">
      <p className="font-[family-name:var(--font-joby-sans-display)] text-[length:var(--text-caption)] font-medium tracking-[var(--tracking-caption)] text-[var(--color-outlined-action)]">
        RUNNING PIPELINE
      </p>
      <p className="mt-[var(--spacing-16)] inline-flex items-center gap-[var(--spacing-8)] font-[family-name:var(--font-jobydisplay)] text-[length:var(--text-subheading)] font-medium leading-[var(--leading-subheading)] tracking-[var(--tracking-subheading)] text-[var(--color-carbon-ink)]">
        Constructing the proof
        <span aria-hidden="true" className="inline-flex gap-[6px]">
          <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[var(--color-electric-blue)] [animation-delay:0ms]" />
          <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[var(--color-electric-blue)] [animation-delay:200ms]" />
          <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[var(--color-electric-blue)] [animation-delay:400ms]" />
        </span>
      </p>
      <ol className="mt-[var(--spacing-24)] flex flex-col gap-[var(--spacing-8)] text-[length:var(--text-body-sm)] font-[450] tracking-[var(--tracking-body-sm)] text-[color-mix(in_srgb,var(--color-carbon-ink)_65%,transparent)]">
        <li>Traversing the typed routing graph…</li>
        <li>Reading the Knowledge Base for contradictions…</li>
        <li>Gating, resolving, and pricing deterministically…</li>
      </ol>
    </div>
  );
}

/**
 * Empty state shown before the first submit: brief guidance on the cream
 * canvas, framed as a quiet bordered caption rather than a boxed card.
 */
function EmptyState() {
  return (
    <div className="max-w-[48ch] border-l-[3px] border-[var(--color-outlined-action)] pl-[var(--spacing-24)]">
      <h2 className="font-[family-name:var(--font-jobydisplay)] text-[length:var(--text-subheading)] font-medium leading-[var(--leading-subheading)] tracking-[var(--tracking-subheading)] text-[var(--color-carbon-ink)]">
        No routing constructed yet
      </h2>
      <p className="mt-[var(--spacing-16)] font-[family-name:var(--font-jobytext)] text-[length:var(--text-body)] font-[450] leading-[var(--leading-body)] tracking-[var(--tracking-body)] text-[color-mix(in_srgb,var(--color-carbon-ink)_72%,transparent)]">
        Pick an origin, destination, cabin, and the points currencies you hold,
        then construct the routing. You&rsquo;ll see the exact GROQ traversal,
        the Knowledge-Base contradiction, how it&rsquo;s resolved, and the
        deterministic minimality proof — in that order.
      </p>
    </div>
  );
}

const LABEL_CLASS =
  "font-[family-name:var(--font-joby-sans-display)] text-[length:var(--text-caption)] font-medium uppercase tracking-[var(--tracking-caption)] text-[color-mix(in_srgb,var(--color-carbon-ink)_70%,transparent)]";

const INPUT_CLASS =
  "rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-carbon-ink)_22%,transparent)] bg-[color-mix(in_srgb,var(--color-parchment-cream)_60%,white)] px-[var(--spacing-16)] py-[var(--spacing-8)] font-[family-name:var(--font-jobytext)] text-[length:var(--text-body)] font-[450] tracking-[var(--tracking-body)] text-[var(--color-carbon-ink)] outline-none focus:border-[var(--color-outlined-action)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-outlined-action)]";
