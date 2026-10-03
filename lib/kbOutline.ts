// lib/kbOutline.ts
//
// Pure, deterministic parsing of a Sanity Context Knowledge Base outline (the
// `initial_context` text) and keyword-based entry selection. NO LLM: the
// keyless /solver path picks which KB entries to read by matching outline
// lines against fixed generic terms (chart / devaluation / blog) plus the
// request's own route and program names (see lib/kbEvidence.ts
// selectKbEntries, which prefers entries about the requested route).
//
// The exact outline line format is not documented, so the parser is tolerant:
// an entry is any line carrying a path token (a backticked token, else the
// first whitespace-free token containing "/" or ".md", else a line that is a
// single bare token like `devaluation_notices`, optionally tagged [core] /
// [peripheral], as in the summary-less outline format). Unknown lines are
// ignored. Relative imports only (used by scripts/check-context.ts under tsx).

export interface KbOutlineEntry {
  path: string;
  summary: string;
  tag?: "core" | "peripheral";
}

export interface KbOutline {
  title: string | null;
  kbId: string | null;
  entries: KbOutlineEntry[];
}

/** Route-independent terms: the kinds of sources a contradiction cites. */
export const KB_DEFAULT_TERMS = ["chart", "devaluation", "blog"];

/**
 * KB search terms per program code. Bare two-letter codes make poor keywords
 * ("VS" hits "chart vs notice", "BA"/"AC" hit "base"/"accrual"), so programs
 * are matched by name. Unknown codes fall back to the code itself.
 */
export const PROGRAM_KB_TERMS: Record<string, string[]> = {
  ANA: ["ANA"],
  VS: ["Virgin"],
  AC: ["Aeroplan", "Air Canada"],
  BA: ["British Airways", "british_airways", "british-airways"],
  AV: ["Avianca", "LifeMiles"],
};

export function programKbTerms(code: string): string[] {
  return PROGRAM_KB_TERMS[code] ?? [code];
}

function extractPath(line: string, allowBare = true): { path: string; rest: string } | null {
  const tick = /`([^`\s]+)`/.exec(line);
  if (tick) {
    return { path: tick[1], rest: line.slice(tick.index + tick[0].length) };
  }
  const tokens = line.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].replace(/[,;:]+$/, "");
    if (/^https?:\/\//i.test(t)) continue;
    if (t.includes("/") || /\.md$/i.test(t)) {
      return { path: t, rest: tokens.slice(i + 1).join(" ") };
    }
  }
  // Summary-less outline format: the whole line is one bare path token.
  const bare = line.trim();
  if (allowBare && /^[A-Za-z0-9][A-Za-z0-9_\-/.]*$/.test(bare) && !/^\d+[.)]?$/.test(bare)) {
    return { path: bare, rest: "" };
  }
  return null;
}

/**
 * True when an outline entry is about the origin→destination route: its path
 * or summary names either code at a word start, or its path packs both codes
 * together (compact names like `transpacific_sfonrt`).
 */
export function entryOnRoute(entry: KbOutlineEntry, origin: string, destination: string): boolean {
  const codes = [origin, destination].filter((t) => typeof t === "string" && t.trim() !== "");
  if (codes.length === 0) return false;
  if (pickRelevantPaths([entry], codes, 1).length > 0) return true;
  if (codes.length < 2) return false;
  const compact = entry.path.toLowerCase().replace(/[^a-z0-9]/g, "");
  const o = origin.trim().toLowerCase();
  const d = destination.trim().toLowerCase();
  return compact.includes(o + d) || compact.includes(d + o);
}

export function parseKbOutline(text: string): KbOutline {
  const lines = (text ?? "").split(/\r?\n/);
  let title: string | null = null;
  let kbId: string | null = null;
  const entries: KbOutlineEntry[] = [];
  const seen = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const idMatch = /Knowledge base id:\s*`?(kb[^\s`]+)`?/i.exec(line);
    if (idMatch) {
      kbId = idMatch[1];
      continue;
    }
    // A non-heading first line is the title; it may still carry a path, but a
    // lone bare word there ("KB") is the title, not an entry.
    let isTitleLine = false;
    if (title === null) {
      const h = /^#{1,6}\s+(.*)$/.exec(line);
      title = h ? h[1].trim() : line;
      if (h) continue;
      isTitleLine = true;
    }
    if (/^#{1,6}\s/.test(line)) continue;

    let body = line.replace(/^([-*+]|\d+[.)])\s+/, "");
    let tag: KbOutlineEntry["tag"];
    const tagMatch = /\[(core|peripheral)\]/i.exec(body);
    if (tagMatch) {
      tag = tagMatch[1].toLowerCase() as "core" | "peripheral";
      body = body.replace(tagMatch[0], " ").replace(/\s{2,}/g, " ").trim();
    }

    const found = extractPath(body, !isTitleLine);
    if (!found || seen.has(found.path)) continue;
    const summary = found.rest.replace(/^\s*(—|–|-|:)\s*/, "").trim();
    seen.add(found.path);
    entries.push(tag ? { path: found.path, summary, tag } : { path: found.path, summary });
  }

  return { title, kbId, entries };
}

/**
 * Rank entries by how many DISTINCT terms they mention (case-insensitive,
 * path + summary), then core before others, then original order. Entries that
 * match nothing are dropped. Deterministic; capped at `max` (≤ 20).
 */
export function pickRelevantPaths(
  entries: KbOutlineEntry[],
  terms: string[],
  max = 5,
): string[] {
  const cap = Math.max(0, Math.min(20, max));
  const uniqueTerms = Array.from(
    new Set(terms.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim().toLowerCase())),
  );
  // Match at a word START so "ANA" does not hit "Canada" but does hit
  // "ana-chart" / "ANA's"; "chart" still matches "charts".
  const patterns = uniqueTerms.map(
    (t) => new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
  );
  return entries
    .map((e, index) => {
      const hay = `${e.path} ${e.summary}`;
      const score = patterns.filter((p) => p.test(hay)).length;
      return { e, index, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ac = a.e.tag === "core" ? 0 : 1;
      const bc = b.e.tag === "core" ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return a.index - b.index;
    })
    .slice(0, cap)
    .map((x) => x.e.path);
}
