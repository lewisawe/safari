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
  /**
   * Which read path served the rows (from /api/traverse `via`). "context-mcp"
   * shows a "read via Context MCP (GROQ mode)" chip; any other marker renders
   * as a muted caption; absent renders nothing.
   */
  via?: string;
}

export function QueryTrace({
  query = TRAVERSE_ROUTINGS_QUERY,
  params,
  via,
}: QueryTraceProps) {
  return (
    <section aria-label="GROQ query issued">
      <div className="mb-2 flex flex-wrap items-baseline gap-[var(--spacing-8)]">
        <h3 className="m-0 text-[0.95rem] font-medium tracking-[var(--tracking-body-sm)] text-[var(--color-carbon-ink)]">
          GROQ traversal issued
        </h3>
        {via === "context-mcp" ? (
          <span className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-outlined-action)_55%,transparent)] px-[0.45rem] py-[0.1rem] text-[length:var(--text-caption)] font-medium tracking-[var(--tracking-caption)] text-[var(--color-outlined-action)]">
            read via Context MCP (GROQ mode)
          </span>
        ) : via ? (
          <span className="text-[length:var(--text-caption)] font-[450] tracking-[var(--tracking-caption)] text-[color-mix(in_srgb,var(--color-carbon-ink)_65%,transparent)]">
            via: {via}
          </span>
        ) : null}
      </div>
      <details className="group rounded-[var(--radius-2xl)] border border-[color-mix(in_srgb,var(--color-carbon-ink)_15%,transparent)] bg-[var(--color-parchment-cream)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]">
        <summary className="cursor-pointer select-none px-[var(--spacing-16)] py-3 text-[0.85rem] font-medium text-[var(--color-outlined-action)]">
          <span className="group-open:hidden">Show the full query (one bounded, four-hop traversal)</span>
          <span className="hidden group-open:inline">Hide query</span>
        </summary>
        <pre className="m-0 overflow-x-auto whitespace-pre border-t border-[color-mix(in_srgb,var(--color-carbon-ink)_12%,transparent)] p-[var(--spacing-16)] text-[0.78rem] leading-[1.5] text-[var(--color-carbon-ink)]">
          <code>{query}</code>
        </pre>
      </details>
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
