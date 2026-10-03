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
}

export function ResolutionCard({
  chosenClaim,
  chosenPointsCost,
  rationale,
  chosenSource,
}: ResolutionCardProps) {
  return (
    <section
      aria-label="Contradiction resolution"
      style={{
        border: "1px solid #1f4d2a",
        background: "#0e1a11",
        borderRadius: 10,
        padding: "1.25rem 1.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.6rem",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            padding: "0.1rem 0.5rem",
            borderRadius: 6,
            background: "#1f4d2a",
            color: "#9fe6b0",
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          RESOLVED
        </span>
        <span style={{ color: "#cfcfd4" }}>
          Chose claim <strong>{chosenClaim}</strong> —{" "}
          <strong style={{ color: "#9fe6b0" }}>
            {chosenPointsCost.toLocaleString("en-US")} points
          </strong>
        </span>
      </div>

      <p
        style={{
          margin: "0.75rem 0 0",
          color: "#d7e4d9",
          lineHeight: 1.55,
        }}
      >
        {rationale}
      </p>

      <p
        style={{
          margin: "0.75rem 0 0",
          fontSize: "0.82rem",
          color: "#8aa891",
        }}
      >
        Cited source:{" "}
        {chosenSource.title ? (
          <span style={{ color: "#c7d7ca" }}>{chosenSource.title}</span>
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
