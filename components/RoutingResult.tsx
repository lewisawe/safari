/**
 * RoutingResult — composes the result components into the full §9.2 demo beat
 * presentation. It renders, in order:
 *   1. QueryTrace       — the GROQ query that was issued (FR-8)
 *   2. KBIssueView      — both claims side-by-side with sources (FR-4)
 *   2b. kbEvidence      — optional Knowledge Base (via Context MCP) panel,
 *                         presentation only
 *   3. NotComputedCard  — shown FIRST while the gate is unresolved (FR-10)
 *   4. ResolutionCard   — the committed resolution + citation (§9.2 step 3)
 *   5. ProofTable       — chosen routing + full proof (FR-7, §9.2 step 4)
 *
 * This is a pure presentational composer: it renders whatever pipeline state it
 * is handed and derives no prices itself. The §9.2 ordering (gate first, then
 * resolution, then proof) is encoded by which pieces the caller supplies.
 */
import type { SolveResult } from "@/solver/types";
import type { ClaimProjection } from "@/lib/fixtures/sfo-nrt-business.rows";
import { QueryTrace } from "./QueryTrace";
import { KBIssueView } from "./KBIssueView";
import { ResolutionCard, type ResolutionCardProps } from "./ResolutionCard";
import { ProofTable } from "./ProofTable";
import { NotComputedCard } from "./NotComputedCard";

export interface RoutingResultProps {
  /** The GROQ query + params to trace (FR-8). Omit to hide the trace. */
  queryTrace?: { query?: string; params?: Record<string, unknown>; via?: string };
  /** The contradiction to present side-by-side (FR-4). Omit to hide. */
  kbIssue?: {
    title: string;
    explanation?: string;
    claimA: ClaimProjection;
    claimB: ClaimProjection;
  };
  /**
   * Optional Knowledge Base evidence (via Context MCP), rendered right after
   * KBIssueView. Presentation only: never a price, never a gate.
   */
  kbEvidence?: React.ReactNode;
  /**
   * The gated solver result, shown FIRST (before resolution). Per §9.2 the
   * NotComputedCard is rendered while the contradiction is unresolved.
   */
  gatedResult?: SolveResult;
  /** The committed resolution (§9.2 step 3). Omit until resolved. */
  resolution?: ResolutionCardProps;
  /**
   * The final solver result after resolution. When COMPUTED a ProofTable is
   * shown; when NOT_COMPUTED a NotComputedCard is shown (fail-closed).
   */
  finalResult?: SolveResult;
}

export function RoutingResult({
  queryTrace,
  kbIssue,
  kbEvidence,
  gatedResult,
  resolution,
  finalResult,
}: RoutingResultProps) {
  return (
    <div className="flex flex-col gap-[var(--spacing-32)]">
      {queryTrace ? (
        <QueryTrace
          query={queryTrace.query}
          params={queryTrace.params}
          via={queryTrace.via}
        />
      ) : null}

      {kbIssue ? (
        <KBIssueView
          title={kbIssue.title}
          explanation={kbIssue.explanation}
          claimA={kbIssue.claimA}
          claimB={kbIssue.claimB}
        />
      ) : null}

      {kbEvidence ?? null}

      {/* §9.2 step 2: the gate fires first — NOT_COMPUTED shown before resolution. */}
      {gatedResult && gatedResult.kind === "NOT_COMPUTED" ? (
        <NotComputedCard result={gatedResult} />
      ) : null}

      {/* §9.2 step 3: the committed resolution + citation. */}
      {resolution ? <ResolutionCard {...resolution} /> : null}

      {/* §9.2 step 4: after resolution the proof (or a fail-closed card). */}
      {finalResult ? (
        finalResult.kind === "COMPUTED" ? (
          <ProofTable result={finalResult} />
        ) : (
          <NotComputedCard result={finalResult} />
        )
      ) : null}
    </div>
  );
}
