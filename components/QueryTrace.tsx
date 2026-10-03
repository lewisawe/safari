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
      <h3 className="m-0 mb-2 text-[0.95rem] font-medium tracking-[var(--tracking-body-sm)] text-[var(--color-carbon-ink)]">
        GROQ traversal issued
      </h3>
      <pre className="m-0 overflow-x-auto whitespace-pre rounded-[var(--radius-2xl)] border border-[color-mix(in_srgb,var(--color-carbon-ink)_15%,transparent)] bg-[var(--color-parchment-cream)] p-[var(--spacing-16)] text-[0.78rem] leading-[1.5] text-[var(--color-carbon-ink)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]">
        <code>{query}</code>
      </pre>
      {params ? (
        <>
          <h4 className="mt-3 mb-2 text-[0.82rem] font-medium tracking-[var(--tracking-caption)] text-[color-mix(in_srgb,var(--color-carbon-ink)_70%,transparent)]">
            Params
          </h4>
          <pre className="m-0 overflow-x-auto rounded-[var(--radius-2xl)] border border-[color-mix(in_srgb,var(--color-carbon-ink)_15%,transparent)] bg-[var(--color-parchment-cream)] px-[var(--spacing-16)] py-3 text-[0.78rem] leading-[1.5] text-[var(--color-carbon-ink)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]">
            <code>{JSON.stringify(params, null, 2)}</code>
          </pre>
        </>
      ) : null}
    </section>
  );
}
