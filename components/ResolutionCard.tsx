/**
 * ResolutionCard — shows the committed resolution of a contradiction: which
 * claim won, the number it committed, the cited source, and the precedence
 * rationale (design §9.2 step 3). The number here is the resolved
 * `chosenPointsCost` from the resolution rule / resolve route — it is the
 * load-bearing input the solver then prices with (§5.7).
 */
export interface ResolutionCardProps {
  chosenClaim: "A" | "B";
  chosenPointsCost: number;
  rationale: string;
  /** Cited source for the chosen claim (id always; title/authority if known). */
  chosenSource: { _id: string; title?: string; authority?: string };
  /**
   * True when this resolution was committed on an EARLIER run and read back
   * from the traversal (the decision carried forward), rather than made now.
   */
  carriedForward?: boolean;
}

export function ResolutionCard({
  chosenClaim,
  chosenPointsCost,
  rationale,
  chosenSource,
  carriedForward = false,
}: ResolutionCardProps) {
  return (
    <section
      aria-label="Contradiction resolution"
      className="rounded-[var(--radius-2xl)] border border-[color-mix(in_srgb,var(--color-carbon-ink)_12%,transparent)] bg-[var(--color-parchment-cream)] p-[var(--spacing-32)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]"
    >
      <div className="flex flex-wrap items-baseline gap-[var(--spacing-8)]">
        <span className="rounded-[var(--radius-lg)] border border-[var(--color-outlined-action)] px-2 py-[0.1rem] text-[0.72rem] font-medium tracking-[0.04em] text-[var(--color-outlined-action)]">
          {carriedForward ? "RESOLVED EARLIER · DECISION CARRIED FORWARD" : "RESOLVED"}
        </span>
        <span className="text-[var(--color-carbon-ink)]">
          Chose claim <strong>{chosenClaim}</strong> —{" "}
          <strong className="[font-variant-numeric:tabular-nums] text-[var(--color-carbon-ink)]">
            {chosenPointsCost.toLocaleString("en-US")} points
          </strong>
        </span>
      </div>

      <p className="mt-[var(--spacing-16)] mb-0 leading-[1.55] text-[var(--color-carbon-ink)]">
        {rationale}
      </p>

      <p className="mt-[var(--spacing-16)] mb-0 text-[0.82rem] text-[color-mix(in_srgb,var(--color-carbon-ink)_65%,transparent)]">
        Cited source:{" "}
        {chosenSource.title ? (
          <span className="text-[var(--color-carbon-ink)]">{chosenSource.title}</span>
        ) : null}{" "}
        <code>{chosenSource._id}</code>
        {chosenSource.authority ? (
          <>
            {" "}
            (<code>{chosenSource.authority}</code>)
          </>
        ) : null}
      </p>
    </section>
  );
}
