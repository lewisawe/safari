/**
 * QueryTrace — shows the exact GROQ query (and its params) the app issued
 * (FR-8, "show the work"). The query string is the single fixed-depth
 * traversal from lib/groq.ts; nothing here is fabricated — it is the literal
 * query text and the parameter object the traversal ran with.
 */
import { TRAVERSE_ROUTINGS_QUERY } from "@/lib/groq";

export interface QueryTraceProps {
  /** Defaults to the §6 traversal query so callers can render it directly. */
  query?: string;
  /** The params the query ran with (currencyIds, origin, destination, cabin). */
  params?: Record<string, unknown>;
}

export function QueryTrace({
  query = TRAVERSE_ROUTINGS_QUERY,
  params,
}: QueryTraceProps) {
  return (
    <section aria-label="GROQ query issued">
      <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem", color: "#cfcfd4" }}>
        GROQ traversal issued
      </h3>
      <pre
        style={{
          margin: 0,
          padding: "1rem",
          background: "#121214",
          border: "1px solid #2a2a30",
          borderRadius: 8,
          overflowX: "auto",
          fontSize: "0.78rem",
          lineHeight: 1.5,
          color: "#c7e0c7",
          whiteSpace: "pre",
        }}
      >
        <code>{query}</code>
      </pre>
      {params ? (
        <>
          <h4
            style={{
              fontSize: "0.82rem",
              margin: "0.75rem 0 0.4rem",
              color: "#9a9aa2",
            }}
          >
            Params
          </h4>
          <pre
            style={{
              margin: 0,
              padding: "0.75rem 1rem",
              background: "#121214",
              border: "1px solid #2a2a30",
              borderRadius: 8,
              overflowX: "auto",
              fontSize: "0.78rem",
              lineHeight: 1.5,
              color: "#d7d7dc",
            }}
          >
            <code>{JSON.stringify(params, null, 2)}</code>
          </pre>
        </>
      ) : null}
    </section>
  );
}
