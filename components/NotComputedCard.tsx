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
      style={{
        border: "1px solid #5a3a00",
        background: "#1c1402",
        borderRadius: 10,
        padding: "1.25rem 1.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          marginBottom: "0.5rem",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            padding: "0.1rem 0.5rem",
            borderRadius: 6,
            background: "#5a3a00",
            color: "#ffd27f",
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          NOT_COMPUTED
        </span>
        <strong style={{ color: "#ffd27f", fontSize: "0.95rem" }}>
          {reasonLabel}
        </strong>
      </div>

      {/* The solver's message, shown verbatim. No numeric price is derived. */}
      <p style={{ margin: 0, color: "#e8d9b5", lineHeight: 1.55 }}>
        {result.message}
      </p>

      {result.reason === "UNRESOLVED_CONTRADICTION" &&
      result.blockingContradictionIds &&
      result.blockingContradictionIds.length > 0 ? (
        <p
          style={{
            marginTop: "0.75rem",
            marginBottom: 0,
            fontSize: "0.8rem",
            color: "#b79a5e",
          }}
        >
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
