// lib/kbToolEvidence.ts
//
// Pure mapping from the agent's `readKnowledgeBase` tool output to the
// KbEvidence shape rendered by KBEvidencePanel. Client-safe: TYPE-ONLY imports
// (pulling lib/context.ts or lib/kbEvidence.ts at runtime would drag server
// config into the browser bundle).
//
// Error outputs keep their typed kind (not_configured / unauthorized /
// unknown_kb / transport / ...) and their human message from the
// lib/context.ts error mapping. The message is defensively cleaned (no bearer
// tokens, no stack lines, bounded length). Evidence only: this never produces
// a price and never touches the solver/gate.

import type { ContextErrorKind } from "./context";
import type { KbEvidence } from "./kbEvidence";

export type ReadKnowledgeBaseOutput =
  | { markdown: string; paths: string[]; via: string; presentationOnly: true }
  | { error: string; message: string; presentationOnly: true };

const KNOWN_KINDS = [
  "not_configured",
  "unauthorized",
  "grant_required",
  "schema_not_deployed",
  "no_knowledge_base",
  "unknown_kb",
  "tool_error",
  "truncated",
  "malformed",
  "transport",
] as const satisfies readonly ContextErrorKind[];

// Compile-time check that KNOWN_KINDS covers every ContextErrorKind.
type _Exhaustive = Exclude<ContextErrorKind, (typeof KNOWN_KINDS)[number]> extends never ? true : never;
const _exhaustive: _Exhaustive = true;
void _exhaustive;

const FALLBACK_MESSAGE = "Knowledge Base read failed.";

const KIND_TITLES: Record<ContextErrorKind, string> = {
  not_configured: "Knowledge Base not configured",
  unauthorized: "Knowledge Base token rejected",
  grant_required: "Knowledge Base token lacks the Context grant",
  schema_not_deployed: "Studio schema not deployed",
  no_knowledge_base: "Knowledge Base not built yet",
  unknown_kb: "Unknown Knowledge Base id",
  tool_error: "Knowledge Base read failed",
  truncated: "Knowledge Base result truncated",
  malformed: "Knowledge Base returned an unreadable result",
  transport: "Knowledge Base unreachable",
};

/** Short, human title for a typed KB error kind (shown in KBEvidencePanel). */
export function kbErrorTitle(kind: ContextErrorKind): string {
  return KIND_TITLES[kind] ?? KIND_TITLES.tool_error;
}
const MAX_MESSAGE_CHARS = 300;

function toKind(v: unknown): ContextErrorKind {
  return typeof v === "string" && (KNOWN_KINDS as readonly string[]).includes(v)
    ? (v as ContextErrorKind)
    : "tool_error";
}

/** Keep the human message; drop stack lines and any bearer token value. */
export function cleanKbMessage(v: unknown): string {
  if (typeof v !== "string") return FALLBACK_MESSAGE;
  const firstLines = v
    .split(/\r?\n/)
    .filter((line) => !/^\s*at\s/.test(line))
    .join(" ");
  const cleaned = firstLines
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return FALLBACK_MESSAGE;
  return cleaned.length > MAX_MESSAGE_CHARS ? `${cleaned.slice(0, MAX_MESSAGE_CHARS)}…` : cleaned;
}

export function kbToolOutputToEvidence(out: unknown): KbEvidence {
  const o = (out ?? {}) as Partial<{
    markdown: unknown;
    paths: unknown;
    error: unknown;
    message: unknown;
  }>;
  if (typeof o.markdown === "string") {
    const paths = Array.isArray(o.paths)
      ? o.paths.filter((p): p is string => typeof p === "string")
      : [];
    return {
      configured: true,
      ok: true,
      via: "context-mcp (knowledge_base)",
      kbId: null,
      outlineTitle: null,
      entries: paths.map((p) => ({ path: p, summary: "" })),
      markdown: o.markdown,
      citations: [],
    };
  }
  return {
    configured: true,
    ok: false,
    error: toKind(o.error),
    message: cleanKbMessage(o.message),
  };
}
