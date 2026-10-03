/**
 * ProofTable — the chosen routing + the full proof list (FR-7, design §9.2
 * step 4). Renders a COMPUTED solver result: the winning routing highlighted,
 * then every other valid routing cost-ascending with its cost.
 *
 * N2 / A5: the taxes column is labeled "Taxes (informational)" and a caption
 * states minimality is over points-in-user-currency only, taxes excluded. The
 * minimized quantity is `costInUserCurrency`; `taxesUsd` is carried for display
 * and is NOT part of the optimization.
 *
 * Every number shown comes from the solver's typed PricedRouting output; this
 * component derives no price of its own.
 */
import type { SolveComputed, PricedRouting } from "@/solver/types";

function fmtPoints(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

const CELL_CLASS =
  "px-3 py-[0.55rem] text-[0.88rem] border-b border-[color-mix(in_srgb,var(--color-carbon-ink)_12%,transparent)]";

const HEAD_CLASS =
  "px-3 py-2 text-left text-[0.74rem] uppercase tracking-[0.04em] text-[color-mix(in_srgb,var(--color-carbon-ink)_60%,transparent)] border-b border-[color-mix(in_srgb,var(--color-carbon-ink)_20%,transparent)]";

function Row({
  routing,
  chosen,
}: {
  routing: PricedRouting;
  chosen: boolean;
}) {
  return (
    <tr
      className={
        chosen
          ? "bg-[color-mix(in_srgb,var(--color-electric-blue)_8%,transparent)]"
          : "bg-transparent"
      }
    >
      <td className={CELL_CLASS}>
        {chosen ? (
          <span className="mr-2 rounded-[var(--radius-lg)] border border-[var(--color-outlined-action)] px-[0.4rem] py-[0.05rem] text-[0.68rem] font-medium text-[var(--color-outlined-action)]">
            WINNER
          </span>
        ) : null}
        <code>{routing.id}</code>
      </td>
      <td className={CELL_CLASS}>{routing.currencyCode}</td>
      <td className={CELL_CLASS}>{routing.programCode}</td>
      <td className={`${CELL_CLASS} text-right [font-variant-numeric:tabular-nums]`}>
        {fmtPoints(routing.effectivePointsCost)}
      </td>
      <td
        className={`${CELL_CLASS} text-right [font-variant-numeric:tabular-nums] text-[var(--color-carbon-ink)] ${
          chosen ? "font-medium" : "font-normal"
        }`}
      >
        {fmtPoints(routing.costInUserCurrency)}
      </td>
      <td
        className={`${CELL_CLASS} text-right [font-variant-numeric:tabular-nums] text-[color-mix(in_srgb,var(--color-carbon-ink)_60%,transparent)]`}
      >
        {fmtUsd(routing.taxesUsd)}
      </td>
    </tr>
  );
}

export function ProofTable({ result }: { result: SolveComputed }) {
  const { chosen, proof } = result;

  return (
    <section aria-label="Routing proof">
      <h3 className="m-0 mb-[var(--spacing-8)] text-[0.72rem] uppercase tracking-[0.05em] text-[color-mix(in_srgb,var(--color-carbon-ink)_60%,transparent)]">
        Proof: cheapest valid routing
      </h3>
      <div className="overflow-x-auto rounded-[var(--radius-2xl)] border border-[color-mix(in_srgb,var(--color-carbon-ink)_12%,transparent)] bg-[var(--color-parchment-cream)] p-[var(--spacing-16)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]">
        <table className="w-full min-w-[560px] border-collapse text-[var(--color-carbon-ink)]">
          <thead>
            <tr>
              <th className={HEAD_CLASS}>Routing</th>
              <th className={HEAD_CLASS}>Currency</th>
              <th className={HEAD_CLASS}>Program</th>
              <th className={`${HEAD_CLASS} text-right`}>Program points</th>
              <th className={`${HEAD_CLASS} text-right`}>Cost in your currency</th>
              {/* N2/A5: taxes are informational, not optimized over. */}
              <th className={`${HEAD_CLASS} text-right`}>Taxes (informational)</th>
            </tr>
          </thead>
          <tbody>
            <Row routing={chosen} chosen />
            {proof.map((p) => (
              <Row key={p.id} routing={p} chosen={false} />
            ))}
          </tbody>
        </table>
      </div>

      {/* N2/A5 caption: minimality is over points-in-user-currency only. */}
      <p className="m-0 mt-[var(--spacing-16)] text-[0.78rem] leading-[1.5] text-[color-mix(in_srgb,var(--color-carbon-ink)_60%,transparent)]">
        Minimality is over points in your currency only (the “Cost in your
        currency” column); taxes are informational and excluded from the
        optimization.{" "}
        {result.minimalityHolds
          ? "No valid routing is cheaper than the winner."
          : null}
      </p>
    </section>
  );
}
