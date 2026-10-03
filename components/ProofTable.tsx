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

function Row({
  routing,
  chosen,
}: {
  routing: PricedRouting;
  chosen: boolean;
}) {
  return (
    <tr
      style={{
        background: chosen ? "#0e1a11" : "transparent",
      }}
    >
      <td style={cellStyle}>
        {chosen ? (
          <span
            style={{
              padding: "0.05rem 0.4rem",
              borderRadius: 5,
              background: "#1f4d2a",
              color: "#9fe6b0",
              fontSize: "0.68rem",
              fontWeight: 700,
              marginRight: "0.5rem",
            }}
          >
            WINNER
          </span>
        ) : null}
        <code>{routing.id}</code>
      </td>
      <td style={cellStyle}>{routing.currencyCode}</td>
      <td style={cellStyle}>{routing.programCode}</td>
      <td style={{ ...cellStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {fmtPoints(routing.effectivePointsCost)}
      </td>
      <td
        style={{
          ...cellStyle,
          textAlign: "right",
          fontWeight: chosen ? 700 : 400,
          color: chosen ? "#9fe6b0" : "#e8e8ea",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {fmtPoints(routing.costInUserCurrency)}
      </td>
      <td
        style={{
          ...cellStyle,
          textAlign: "right",
          color: "#8a8a90",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {fmtUsd(routing.taxesUsd)}
      </td>
    </tr>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "0.55rem 0.75rem",
  borderBottom: "1px solid #22222a",
  fontSize: "0.88rem",
};

const headStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  textAlign: "left",
  fontSize: "0.74rem",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#8a8a90",
  borderBottom: "1px solid #2a2a30",
};

export function ProofTable({ result }: { result: SolveComputed }) {
  const { chosen, proof } = result;

  return (
    <section aria-label="Routing proof">
      <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem", color: "#cfcfd4" }}>
        Proof: cheapest valid routing
      </h3>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: 560,
          }}
        >
          <thead>
            <tr>
              <th style={headStyle}>Routing</th>
              <th style={headStyle}>Currency</th>
              <th style={headStyle}>Program</th>
              <th style={{ ...headStyle, textAlign: "right" }}>
                Program points
              </th>
              <th style={{ ...headStyle, textAlign: "right" }}>
                Cost in your currency
              </th>
              {/* N2/A5: taxes are informational, not optimized over. */}
              <th style={{ ...headStyle, textAlign: "right" }}>
                Taxes (informational)
              </th>
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
      <p
        style={{
          margin: "0.6rem 0 0",
          fontSize: "0.78rem",
          color: "#8a8a90",
          lineHeight: 1.5,
        }}
      >
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
