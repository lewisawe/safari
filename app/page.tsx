import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "3rem 1.5rem",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: "2.25rem", marginBottom: "0.5rem" }}>Safari</h1>
      <p style={{ fontSize: "1.15rem", color: "#b7b7bd", marginTop: 0 }}>
        An award-travel routing agent that <strong>constructs</strong> the
        provably-cheapest valid points itinerary — and refuses to price it until
        it resolves a contradiction in its Knowledge Base.
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.3rem" }}>How it works</h2>
        <ol style={{ paddingLeft: "1.25rem" }}>
          <li>
            Walks a bounded, typed reference graph in Sanity
            (<code>pointsCurrency → transferPartner → program → awardChartEntry</code>)
            to enumerate every candidate routing.
          </li>
          <li>
            Hits an engineered contradiction (a printed award chart says 85k, a
            devaluation notice says 90k). Pricing <strong>pauses</strong> until
            the disagreement is resolved against the authoritative source.
          </li>
          <li>
            Calls a deterministic TypeScript solver that picks the single
            cheapest valid routing and emits a proof: every other valid routing,
            priced higher. The model does no arithmetic.
          </li>
        </ol>
      </section>

      <nav
        style={{
          display: "flex",
          gap: "1rem",
          marginTop: "2.5rem",
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/agent"
          style={{
            padding: "0.75rem 1.25rem",
            background: "#3b6cff",
            color: "white",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Agent path →
        </Link>
        <Link
          href="/solver"
          style={{
            padding: "0.75rem 1.25rem",
            background: "#1c1c20",
            color: "#e8e8ea",
            border: "1px solid #3a3a40",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Model-free solver path →
        </Link>
      </nav>

      <p style={{ marginTop: "2.5rem", fontSize: "0.9rem", color: "#8a8a90" }}>
        The dataset is synthetic and labeled as such throughout. Every price the
        UI shows originates from the deterministic solver; absence renders as{" "}
        <code>NOT_COMPUTED</code>, never a guessed number.
      </p>
    </main>
  );
}
