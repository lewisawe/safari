// lib/agentKbEvidence.ts
//
// Server-side, deterministic Knowledge Base read for the agent path. Amazon
// Nova skips the optional readKnowledgeBase tool even when the prompt says it
// MUST call it, so the server reads the KB itself whenever traverseRoutings
// finds a contradicted chart entry, and attaches the result to that tool's
// output as `knowledgeBase` evidence.
//
// Same selection as POST /api/kb (selectKbEntries: default terms + route +
// program codes, no LLM). The outline comes from the shared TTL cache so the
// extra read costs one `knowledge_base_read` round-trip.
//
// EVIDENCE ONLY: the result never feeds toCandidates/solve or the gate.
// FAIL-SOFT: every failure (not configured, auth, no match, timeout) becomes
// `{ error: { kind, message } }`; this function never throws.
//
// Server-only by convention (imports lib/context.ts). Relative imports only.

import {
  ContextError,
  contextKbRead,
  mapContextError,
  type ContextConfig,
  type ContextErrorKind,
} from "./context";
import { extractCitations, selectKbEntries } from "./kbEvidence";
import { getKbOutlineCached } from "./kbOutlineCache";
import type { TraverseRow } from "./fixtures/sfo-nrt-business.rows";

export const AGENT_KB_VIA = "context-mcp (knowledge_base mode)" as const;

/** Whole-read budget so a slow KB can never hold up the traversal result. */
export const AGENT_KB_TIMEOUT_MS = 8000;

export type AgentKbEvidence =
  | {
      via: typeof AGENT_KB_VIA;
      paths: string[];
      markdown: string;
      citations: { text: string; url: string }[];
      presentationOnly: true;
    }
  | { error: { kind: ContextErrorKind; message: string }; presentationOnly: true };

/** Program codes of chart entries that carry a contradiction, in row order. */
export function contradictedProgramCodes(rows: TraverseRow[]): string[] {
  const out: string[] = [];
  for (const row of rows ?? []) {
    for (const entry of row?.chartEntries ?? []) {
      const code = entry?.program?.code;
      if ((entry?.contradictions?.length ?? 0) > 0 && typeof code === "string" && !out.includes(code)) {
        out.push(code);
      }
    }
  }
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ContextError("transport", `Knowledge Base read timed out after ${ms} ms`)),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export async function readAgentKbEvidence(
  cfg: ContextConfig,
  req: { origin: string; destination: string; programCodes: string[] },
  opts: { timeoutMs?: number } = {},
): Promise<AgentKbEvidence> {
  const timeoutMs = opts.timeoutMs ?? AGENT_KB_TIMEOUT_MS;
  try {
    return await withTimeout(
      (async () => {
        const { text } = await getKbOutlineCached(cfg, { timeoutMs });
        const { paths } = selectKbEntries(text, req);
        if (paths.length === 0) {
          throw new ContextError("tool_error", "no matching KB entries for the contradicted routing");
        }
        const { markdown } = await contextKbRead(paths, { cfg, timeoutMs });
        return {
          via: AGENT_KB_VIA,
          paths,
          markdown,
          citations: extractCitations(markdown),
          presentationOnly: true as const,
        };
      })(),
      timeoutMs,
    );
  } catch (err) {
    const ce = err instanceof ContextError ? err : mapContextError(err);
    console.error("[chat/traverseRoutings] KB evidence unavailable:", ce.kind);
    return { error: { kind: ce.kind, message: ce.message }, presentationOnly: true };
  }
}
