// lib/kbEvidence.ts
//
// Keyless, deterministic Knowledge Base evidence read for the /solver path
// (POST /api/kb). Picks relevant entry paths (NO LLM) with the server-ranked
// `knowledge_base_search` tool (selectKbPaths), falling back to keyword
// matching over the `initial_context` outline when search is unavailable or
// finds no route entry, reads them with `knowledge_base_read`, and returns
// Markdown + citations.
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
  contextKbSearch,
  isKbConfigured,
  mapContextError,
  type ContextConfig,
  type ContextErrorKind,
  type KbSearchResult,
} from "./context";
import {
  KB_DEFAULT_TERMS,
  entryOnRoute,
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
  cabin?: string;
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
  const onRoute = outline.entries.filter((e) => entryOnRoute(e, req.origin, req.destination));
  const pool = onRoute.length > 0 ? onRoute : outline.entries;
  return { outline, paths: pickRelevantPaths(pool, terms) };
}

// ----------------------------------------------------------------------------
// Search-based selection (knowledge_base_search)
// ----------------------------------------------------------------------------

/** Max entries read per request: one route entry + one contradiction-context entry (+ slack). */
export const KB_MAX_PATHS = 3;

/** Results requested from knowledge_base_search. */
export const KB_SEARCH_LIMIT = 10;

/** Title/summary words that mark a contradiction-context entry (notice, sale, blog...). */
const CONTEXT_KIND_RE = /(^|[^a-z0-9])(devaluation|repricing|sale|promotion|promo|blog|notice)/i;

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (hay: string, term: string) =>
  new RegExp(`(^|[^a-z0-9])${esc(term.trim())}($|[^a-z0-9])`, "i").test(hay);

/**
 * The search query: route codes, program NAMES (PROGRAM_KB_TERMS; never bare
 * two-letter codes) and the cabin when known. Generic source-kind words
 * (devaluation/sale/blog/chart) are deliberately left out: every route's entry
 * mentions them, so they drown the content match that ranks the RIGHT
 * contradiction-context entry (ANA content lives in the devaluation notice,
 * Virgin Atlantic JFK–LHR content in the promotions entry).
 */
/** Full program names for search (matching is exact on content words). */
const PROGRAM_SEARCH_NAMES: Record<string, string[]> = { VS: ["Virgin Atlantic"] };

function programSearchNames(code: string): string[] {
  // Slug variants (british_airways) only help the outline matcher.
  return PROGRAM_SEARCH_NAMES[code] ?? programKbTerms(code).filter((t) => !/[_-]/.test(t));
}

export function buildKbSearchQuery(req: KbEvidenceRequest): string {
  const words = [
    req.origin,
    req.destination,
    ...(req.programCodes ?? []).flatMap(programSearchNames),
    ...(req.cabin ? [req.cabin] : []),
  ]
    .filter((t) => typeof t === "string" && t.trim() !== "")
    .map((t) => t.trim());
  return Array.from(new Set(words)).join(" ");
}

/**
 * Pure selection over ranked search results. Requires a route-specific hit:
 * the top-ranked entry whose title or summary names BOTH the origin and the
 * destination (or whose path packs both codes, e.g. `transpacific_sfonrt`).
 * Then adds the top-ranked contradiction-context entry (path/title says
 * devaluation / sale / promotion / blog / notice; summary only when there is
 * no title), preferring one whose title/summary names a requested program. Capped at KB_MAX_PATHS. No route hit -> [] (caller falls
 * back to the outline matcher).
 */
export function selectFromSearch(results: KbSearchResult[], req: KbEvidenceRequest): string[] {
  const o = (req.origin ?? "").trim();
  const d = (req.destination ?? "").trim();
  if (!o || !d) return [];
  const hay = (r: KbSearchResult) => `${r.title} ${r.summary}`;
  const route = results.find(
    (r) =>
      (mentions(hay(r), o) && mentions(hay(r), d)) ||
      entryOnRoute({ path: r.path, summary: "" }, o, d),
  );
  if (!route) return [];
  const paths = [route.path];
  const programTerms = (req.programCodes ?? []).flatMap(programKbTerms);
  const contextHits = results.filter(
    // Kind is judged on path + title: other routes' price summaries also say
    // "pre-devaluation", but only a notice/sale entry is TITLED that way.
    (r) => r.path !== route.path && CONTEXT_KIND_RE.test(`${r.path} ${r.title || r.summary}`),
  );
  const ctx =
    contextHits.find((r) => programTerms.some((t) => mentions(hay(r), t))) ?? contextHits[0];
  if (ctx) paths.push(ctx.path);
  return paths.slice(0, KB_MAX_PATHS);
}

export interface KbSelection {
  via: "search" | "outline";
  paths: string[];
  /** path -> short description (search title/summary, or outline summary). */
  summaries: Map<string, string>;
  outlineTitle: string | null;
  kbId: string | null;
}

/**
 * Shared, deterministic entry selection for /api/kb, the agent's server-side
 * KB attach and scripts/check-context.ts: knowledge_base_search first; on a
 * search error, or no route-specific hit, the outline matcher (selectKbEntries)
 * via `getOutline`. Throws a typed ContextError only when the fallback fails.
 */
export async function selectKbPaths(
  req: KbEvidenceRequest,
  opts: {
    cfg: ContextConfig;
    timeoutMs?: number;
    getOutline?: () => Promise<{ text: string; kbId: string | null }>;
  },
): Promise<KbSelection> {
  try {
    const { results } = await contextKbSearch(buildKbSearchQuery(req), {
      cfg: opts.cfg,
      timeoutMs: opts.timeoutMs,
      limit: KB_SEARCH_LIMIT,
    });
    const paths = selectFromSearch(results, req);
    if (paths.length > 0) {
      const byPath = new Map(results.map((r) => [r.path, r.summary || r.title]));
      return {
        via: "search",
        paths,
        summaries: new Map(paths.map((p) => [p, byPath.get(p) ?? ""])),
        outlineTitle: null,
        kbId: opts.cfg.kbId,
      };
    }
  } catch (err) {
    console.error("[kb] knowledge_base_search unavailable, using the outline:", mapContextError(err).kind);
  }
  const getOutline = opts.getOutline ?? (() => contextKbOutline({ cfg: opts.cfg, timeoutMs: opts.timeoutMs }));
  const { text, kbId } = await getOutline();
  const { outline, paths } = selectKbEntries(text, req);
  const byPath = new Map(outline.entries.map((e) => [e.path, e.summary]));
  return {
    via: "outline",
    paths,
    summaries: new Map(paths.map((p) => [p, byPath.get(p) ?? ""])),
    outlineTitle: outline.title,
    kbId: kbId ?? outline.kbId,
  };
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
    const sel = await selectKbPaths(req, { cfg });
    const { paths } = sel;
    if (paths.length === 0) {
      return { configured: true, ok: false, error: "tool_error", message: "no matching KB entries" };
    }
    const { markdown } = await contextKbRead(paths, { cfg });
    return {
      configured: true,
      ok: true,
      via: "context-mcp (knowledge_base)",
      kbId: sel.kbId,
      outlineTitle: sel.outlineTitle,
      entries: paths.map((p) => ({ path: p, summary: sel.summaries.get(p) ?? "" })),
      markdown,
      citations: extractCitations(markdown),
    };
  } catch (err) {
    const ce = mapContextError(err);
    console.error("[kb] Knowledge Base read failed:", ce.kind);
    return { configured: true, ok: false, error: ce.kind, message: ce.message };
  }
}
