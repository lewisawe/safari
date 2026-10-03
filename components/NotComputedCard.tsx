/**
 * NotComputedCard — renders a solver NOT_COMPUTED result (FR-10).
 *
 * This is the fail-closed value made visible. It shows the solver's
 * human-readable `message` VERBATIM and never fabricates or derives a number.
 * The whole point of the gate is that when pricing is blocked the user sees
 * exactly why — the solver's own words — not a guessed price.
 */
import type { SolveNotComputed } from "@/solver/types";

export function NotComputedCard({ result }: { result: SolveNotComputed }) {
  const reasonLabel =
    result.reason === "UNRESOLVED_CONTRADICTION"
      ? "Unresolved contradiction"
      : "No valid routing";

  return (
    <section
      role="status"
      aria-label="Not computed"
      className="rounded-[var(--radius-2xl)] border border-[color-mix(in_srgb,var(--color-carbon-ink)_25%,transparent)] bg-[var(--color-parchment-cream)] p-[var(--spacing-32)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]"
    >
      <div className="mb-[var(--spacing-8)] flex items-center gap-[var(--spacing-8)]">
        <span
          aria-hidden="true"
          className="inline-block rounded-[var(--radius-lg)] border border-[var(--color-sunset-orange)] px-2 py-[0.1rem] text-[0.72rem] font-medium tracking-[0.04em] text-[var(--color-sunset-orange)]"
        >
          NOT_COMPUTED
        </span>
        <strong className="text-[0.95rem] font-medium text-[var(--color-carbon-ink)]">
          {reasonLabel}
        </strong>
      </div>

      {/* The solver's message, shown verbatim. No numeric price is derived. */}
      <p className="m-0 leading-[1.55] text-[var(--color-carbon-ink)]">
        {result.message}
      </p>

      {result.reason === "UNRESOLVED_CONTRADICTION" &&
      result.blockingContradictionIds &&
      result.blockingContradictionIds.length > 0 ? (
        <p className="mt-[var(--spacing-16)] mb-0 text-[0.8rem] text-[color-mix(in_srgb,var(--color-carbon-ink)_65%,transparent)]">
          Blocking contradiction
          {result.blockingContradictionIds.length > 1 ? "s" : ""}:{" "}
          {result.blockingContradictionIds.map((id, i) => (
            <span key={id}>
              {i > 0 ? ", " : ""}
              <code>{id}</code>
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}
