// lib/kbEvidence.ts
//
// Keyless, deterministic Knowledge Base evidence read for the /solver path
// (POST /api/kb). Reads the KB outline via Context MCP (`initial_context`),
// picks relevant entry paths by keyword match (NO LLM), reads them with
// `knowledge_base_read`, and returns Markdown + citations.
//
// PRESENTATION ONLY: the payload carries no price fields (no pointsCost /
// chosen* / proof). KB prose may *mention* 85,000 / 90,000 as cited claims,
// but nothing here feeds toCandidates/solve or the gate. Every failure is a
// quiet, typed result; this never throws, so the pipeline never blocks on it.
//
// Server-only by convention (imports lib/context.ts). Relative imports only.

import {
  contextConfig,
  contextKbOutline,
  contextKbRead,
  isKbConfigured,
  mapContextError,
  type ContextErrorKind,
} from "./context";
import {
  KB_DEFAULT_TERMS,
  parseKbOutline,
  pickRelevantPaths,
  programKbTerms,
  type KbOutline,
} from "./kbOutline";

export type KbEvidence =
  | { configured: false; message: string }
  | {
      configured: true;
      ok: true;
      via: "context-mcp (knowledge_base)";
      kbId: string | null;
      outlineTitle: string | null;
      entries: { path: string; summary: string }[];
      markdown: string;
      citations: { text: string; url: string }[];
    }
  | { configured: true; ok: false; error: ContextErrorKind; message: string };

export interface KbEvidenceRequest {
  origin: string;
  destination: string;
  programCodes?: string[];
}

/** Unique http(s) Markdown links `[text](url)` in order of appearance. */
export function extractCitations(markdown: string): { text: string; url: string }[] {
  const out: { text: string; url: string }[] = [];
  const seen = new Set<string>();
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const key = `${m[1]}|${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: m[1], url: m[2] });
  }
  return out;
}

/**
 * The deterministic (no-LLM) KB entry selection shared by POST /api/kb and the
 * agent's server-side KB read: parse the outline, match the default terms plus
 * the request's route and program names. Pure.
 *
 * Route first: when any outline entry names the requested origin or
 * destination, only those entries are candidates, so a JFK→LHR request reads
 * the JFK→LHR entry and not the SFO→NRT one (which shares "chart" and other
 * generic terms). An outline with no route-specific entries (topical KBs)
 * falls back to ranking every entry.
 */
export function selectKbEntries(
  outlineText: string,
  req: KbEvidenceRequest,
): { outline: KbOutline; paths: string[] } {
  const outline = parseKbOutline(outlineText);
  const routeTerms = [req.origin, req.destination].filter(
    (t) => typeof t === "string" && t.trim() !== "",
  );
  const terms = [
    ...KB_DEFAULT_TERMS,
    ...routeTerms,
    ...(req.programCodes ?? []).flatMap(programKbTerms),
  ];
  const onRoute = outline.entries.filter(
    (e) => pickRelevantPaths([e], routeTerms, 1).length > 0,
  );
  const pool = onRoute.length > 0 ? onRoute : outline.entries;
  return { outline, paths: pickRelevantPaths(pool, terms) };
}

export async function readKbEvidence(req: KbEvidenceRequest): Promise<KbEvidence> {
  const cfg = contextConfig();
  if (!isKbConfigured(cfg)) {
    return {
      configured: false,
      message: cfg
        ? "Knowledge Base not connected yet: set SANITY_KB_ID to enable Context MCP Knowledge Base mode."
        : "Knowledge Base not connected yet: Sanity Context is not configured (SANITY_CONTEXT_MCP_URL, SANITY_CONTEXT_TOKEN, SANITY_KB_ID).",
    };
  }
  try {
    const { text, kbId } = await contextKbOutline({ cfg });
    const { outline, paths } = selectKbEntries(text, req);
    if (paths.length === 0) {
      return { configured: true, ok: false, error: "tool_error", message: "no matching KB entries" };
    }
    const { markdown } = await contextKbRead(paths, { cfg });
    const byPath = new Map(outline.entries.map((e) => [e.path, e.summary]));
    return {
      configured: true,
      ok: true,
      via: "context-mcp (knowledge_base)",
      kbId: kbId ?? outline.kbId,
      outlineTitle: outline.title,
      entries: paths.map((p) => ({ path: p, summary: byPath.get(p) ?? "" })),
      markdown,
      citations: extractCitations(markdown),
    };
  } catch (err) {
    const ce = mapContextError(err);
    console.error("[kb] Knowledge Base read failed:", ce.kind);
    return { configured: true, ok: false, error: ce.kind, message: ce.message };
  }
}
