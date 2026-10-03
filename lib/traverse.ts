// lib/traverse.ts
//
// Shared GROQ traversal used by /api/traverse and the agent's traverseRoutings
// tool. When Sanity Context is configured, the SAME fixed
// TRAVERSE_ROUTINGS_QUERY runs through the Context MCP `groq_query` tool
// (GROQ mode) and returns the IDENTICAL §6 row shape, so toCandidates/solve
// and the GROQ-embedded committedResolution gate are unchanged.
//
// Fallback (fail-closed, with a visible marker): if Context is not
// configured, or a Context read fails for any reason (auth, transport, tool
// error, truncation, malformed result), the same fixed query runs through the
// local @sanity/client. Rows always come from the real dataset; nothing is
// ever invented. The `via` string tells the UI which path served the rows.
//
// Server-only by convention (imports lib/context.ts). Relative imports only.

import { getReadClient } from "./sanityClient";
import { TRAVERSE_ROUTINGS_QUERY, type TraverseParams } from "./groq";
import { contextConfig, contextGroqQuery, ContextError, mapContextError } from "./context";
import type { TraverseRow } from "./fixtures/sfo-nrt-business.rows";

export const VIA_CONTEXT = "context-mcp";
export const VIA_NOT_CONFIGURED = "sanity-client (Context not configured)";
export function viaContextFailed(kind: string): string {
  return `sanity-client (Context MCP failed: ${kind})`;
}

export interface ContentQueryResult<T> {
  result: T;
  via: string;
  executedQuery?: string;
}

/**
 * Run a fixed GROQ query Context-first, falling back to @sanity/client.
 * `validate` lets callers require a shape (e.g. an array) from the MCP path;
 * a failing check is treated as `malformed` and falls back.
 */
export async function runContentQuery<T>(
  query: string,
  params: Record<string, unknown>,
  validate?: (v: unknown) => boolean,
): Promise<ContentQueryResult<T>> {
  if (contextConfig()) {
    try {
      const { result, meta } = await contextGroqQuery<T>(query, params);
      if (validate && !validate(result)) {
        throw new ContextError("malformed", "unexpected result shape");
      }
      return {
        result,
        via: VIA_CONTEXT,
        executedQuery: typeof meta.executedQuery === "string" ? meta.executedQuery : undefined,
      };
    } catch (err) {
      const ce = mapContextError(err);
      console.error(`[context] GROQ-mode read failed (${ce.kind}); falling back to @sanity/client:`, ce.message);
      const result = await getReadClient().fetch<T>(query, params);
      return { result, via: viaContextFailed(ce.kind) };
    }
  }
  const result = await getReadClient().fetch<T>(query, params);
  return { result, via: VIA_NOT_CONFIGURED };
}

export async function runTraversal(params: TraverseParams): Promise<{
  rows: TraverseRow[];
  via: string;
  executedQuery?: string;
}> {
  const { result, via, executedQuery } = await runContentQuery<TraverseRow[]>(
    TRAVERSE_ROUTINGS_QUERY,
    { ...params },
    Array.isArray,
  );
  return { rows: result, via, executedQuery };
}
