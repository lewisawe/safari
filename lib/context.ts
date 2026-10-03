// lib/context.ts
//
// Sanity Context MCP helpers (GROQ mode + Knowledge Base mode).
//
// SERVER-ONLY BY CONVENTION: the `server-only` package is not installed, so
// this module is kept out of client bundles by import discipline. Only route
// handlers (app/api/*), other server libs (lib/traverse.ts, lib/kbEvidence.ts)
// and scripts import it. It reads only non-NEXT_PUBLIC_ env vars, so even an
// accidental client import would not inline the token. Relative imports only
// (no `@/`) because scripts/check-context.ts runs it under tsx.
//
// Design decisions:
//
// 1. One client per call, closed in `finally`. We use `callTool`/`listTools`
//    rather than `client.tools()`: `tools()` returns live AI-SDK tools bound to
//    an open client, which would keep a connection open across a streamed
//    response and hand the model raw, unvetted MCP output. Every Context read
//    here is a typed wrapper: open, one call, unwrap fail-closed, close.
//
// 3. The GROQ client sets `mode=groq` explicitly (an endpoint with a KB source
//    could otherwise auto-resolve to knowledge_base). The KB client sets
//    `mode=knowledge_base&knowledgeBases=<id>`. Both go through
//    URL.searchParams.set so any query string already on the endpoint URL
//    survives. An optional `tools=` allowlist narrows what the server exposes.
//
// 10. Result unwrapping: prefer `structuredContent`; otherwise join the
//    `content[type=text]` texts. For groq_query that text is JSON (parse
//    failure -> "malformed"). For KB tools the text IS the Markdown/outline.
//    `isError: true` -> ContextError("tool_error") (or "unknown_kb"). We never
//    return a default/empty result on error: no rows are ever fabricated.
//
// Errors from @ai-sdk/mcp (MCPClientError is not exported) are duck-typed on
// `statusCode`, `code`, `responseBody`, `message`. Error messages never carry
// the token or the endpoint's query string.

import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

export type ContextErrorKind =
  | "not_configured"
  | "unauthorized"
  | "grant_required"
  | "schema_not_deployed"
  | "no_knowledge_base"
  | "unknown_kb"
  | "tool_error"
  | "truncated"
  | "malformed"
  | "transport";

const KIND_MESSAGES: Record<ContextErrorKind, string> = {
  not_configured:
    "Sanity Context is not configured: set SANITY_CONTEXT_MCP_URL and SANITY_CONTEXT_TOKEN (and SANITY_KB_ID for Knowledge Base mode).",
  unauthorized:
    "Context MCP rejected the token (401/403): SANITY_CONTEXT_TOKEN must be a valid ORGANIZATION token with the Context Viewer role.",
  grant_required:
    "Context MCP returned 403 contextGrantRequired: SANITY_CONTEXT_TOKEN must be an ORGANIZATION token with the Context Viewer role (sanity.knowledge-base.read); project tokens are rejected.",
  schema_not_deployed:
    "Context MCP error -32004 (schema not deployed): run `npx sanity schema deploy` in studio-safari.",
  no_knowledge_base:
    "Context MCP error -32005: the endpoint has no knowledge base, or the KB is not built yet. Build the KB and add it to the endpoint.",
  unknown_kb:
    "Context MCP does not recognise SANITY_KB_ID: copy the knowledge base id (starts with `kb`) from Dashboard → Context.",
  tool_error: "Context MCP tool returned an error result.",
  truncated:
    "Context MCP truncated the GROQ result (returnedCount < resultCount); refusing partial rows.",
  malformed: "Context MCP returned a result that could not be parsed.",
  transport: "Context MCP request failed (network/transport).",
};

export class ContextError extends Error {
  readonly kind: ContextErrorKind;
  readonly status?: number;
  readonly code?: number;
  constructor(
    kind: ContextErrorKind,
    detail?: string,
    extra: { status?: number; code?: number } = {},
  ) {
    super(detail ? `${KIND_MESSAGES[kind]} (${detail})` : KIND_MESSAGES[kind]);
    this.name = "ContextError";
    this.kind = kind;
    this.status = extra.status;
    this.code = extra.code;
  }
}

/** Strip query strings from any URL in a message and any bearer token value. */
function redact(text: string): string {
  const token = process.env.SANITY_CONTEXT_TOKEN;
  let out = text.replace(/(https?:\/\/[^\s?"'<>]+)\?[^\s"'<>]*/g, "$1?…");
  if (token && token.length > 0) out = out.split(token).join("[redacted]");
  return out.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]").slice(0, 300);
}

/** Map any thrown value to a ContextError (duck-typed; no instanceof on lib errors). */
export function mapContextError(err: unknown): ContextError {
  if (err instanceof ContextError) return err;
  const e = (err ?? {}) as {
    statusCode?: unknown;
    code?: unknown;
    responseBody?: unknown;
    message?: unknown;
    name?: unknown;
  };
  const status = typeof e.statusCode === "number" ? e.statusCode : undefined;
  const code = typeof e.code === "number" ? e.code : undefined;
  const body = typeof e.responseBody === "string" ? e.responseBody : "";
  const message = typeof e.message === "string" ? e.message : String(err);
  const detail = redact(message);

  if (status === 401) return new ContextError("unauthorized", detail, { status });
  if (status === 403) {
    const kind = /contextGrantRequired/i.test(body + " " + message)
      ? "grant_required"
      : "unauthorized";
    return new ContextError(kind, detail, { status });
  }
  if (code === -32004) return new ContextError("schema_not_deployed", detail, { code });
  if (code === -32005) return new ContextError("no_knowledge_base", detail, { code });
  // Some transports surface the HTTP status only inside the message text.
  const m = /HTTP (\d{3})/.exec(message);
  if (m) {
    const s = Number(m[1]);
    if (s === 401) return new ContextError("unauthorized", detail, { status: s });
    if (s === 403) {
      return new ContextError(
        /contextGrantRequired/i.test(body + " " + message) ? "grant_required" : "unauthorized",
        detail,
        { status: s },
      );
    }
  }
  return new ContextError("transport", detail, { status, code });
}

// ----------------------------------------------------------------------------
// Config + URL builders
// ----------------------------------------------------------------------------

export interface ContextConfig {
  url: string;
  token: string;
  kbId: string | null;
}

/** Read Context config at call time. Null when URL or token is absent/blank. */
export function contextConfig(): ContextConfig | null {
  const url = process.env.SANITY_CONTEXT_MCP_URL?.trim();
  const token = process.env.SANITY_CONTEXT_TOKEN?.trim();
  if (!url || !token) return null;
  const kb = process.env.SANITY_KB_ID?.trim();
  return { url, token, kbId: kb ? kb : null };
}

export function isKbConfigured(cfg: ContextConfig | null): cfg is ContextConfig & { kbId: string } {
  return Boolean(cfg && cfg.kbId && cfg.kbId.length > 0);
}

/** GROQ-mode endpoint URL: sets mode=groq (and optional tools allowlist), keeps existing params. */
export function buildGroqUrl(url: string, tools?: string[]): string {
  const u = new URL(url);
  u.searchParams.set("mode", "groq");
  if (tools && tools.length > 0) u.searchParams.set("tools", tools.join(","));
  return u.toString();
}

/** KB-mode endpoint URL: mode=knowledge_base&knowledgeBases=<id>, keeps existing params. */
export function buildKbUrl(url: string, kbId: string, tools?: string[]): string {
  const u = new URL(url);
  u.searchParams.set("mode", "knowledge_base");
  u.searchParams.set("knowledgeBases", kbId);
  if (tools && tools.length > 0) u.searchParams.set("tools", tools.join(","));
  return u.toString();
}

// ----------------------------------------------------------------------------
// Clients
// ----------------------------------------------------------------------------

export interface OpenOpts {
  tools?: string[];
  cfg?: ContextConfig | null;
  timeoutMs?: number;
}

async function openClient(url: string, token: string, timeoutMs?: number): Promise<MCPClient> {
  try {
    return await createMCPClient({
      clientName: "safari",
      transport: {
        type: "http",
        url,
        headers: { Authorization: `Bearer ${token}` },
      },
      ...(timeoutMs ? { initializationOptions: { timeout: timeoutMs } } : {}),
    });
  } catch (err) {
    throw mapContextError(err);
  }
}

export async function openGroqContext(opts: OpenOpts = {}): Promise<MCPClient> {
  const cfg = opts.cfg === undefined ? contextConfig() : opts.cfg;
  if (!cfg) throw new ContextError("not_configured");
  return openClient(buildGroqUrl(cfg.url, opts.tools), cfg.token, opts.timeoutMs);
}

export async function openKbContext(opts: OpenOpts = {}): Promise<MCPClient> {
  const cfg = opts.cfg === undefined ? contextConfig() : opts.cfg;
  if (!isKbConfigured(cfg)) throw new ContextError("not_configured", "SANITY_KB_ID is not set");
  return openClient(buildKbUrl(cfg.url, cfg.kbId, opts.tools), cfg.token, opts.timeoutMs);
}

// ----------------------------------------------------------------------------
// Result unwrapping
// ----------------------------------------------------------------------------

interface LooseCallToolResult {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

function joinText(r: LooseCallToolResult): string {
  return (r.content ?? [])
    .filter((c) => c && c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
}

function throwIfError(r: LooseCallToolResult): void {
  if (!r.isError) return;
  const text = joinText(r);
  if (/knowledge.?base/i.test(text) && /(id|valid|unknown|not found)/i.test(text)) {
    throw new ContextError("unknown_kb", redact(text));
  }
  throw new ContextError("tool_error", redact(text) || undefined);
}

async function withClient<T>(client: MCPClient, fn: (c: MCPClient) => Promise<T>): Promise<T> {
  try {
    return await fn(client);
  } catch (err) {
    throw mapContextError(err);
  } finally {
    try {
      await client.close();
    } catch {
      // closing is best-effort; never mask the real result/error
    }
  }
}

// ----------------------------------------------------------------------------
// GROQ mode
// ----------------------------------------------------------------------------

export interface GroqMeta {
  executedQuery?: string;
  resultCount?: number;
  returnedCount?: number;
  [k: string]: unknown;
}

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Run a GROQ query through the Context MCP `groq_query` tool. Returns the
 * unwrapped `result` and `meta`. Throws a typed ContextError on any failure —
 * never an empty/default result.
 */
export async function contextGroqQuery<T = unknown>(
  query: string,
  params: Record<string, unknown>,
  opts: OpenOpts = {},
): Promise<{ result: T; meta: GroqMeta }> {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const client = await openGroqContext({ ...opts, tools: opts.tools ?? ["groq_query"] });
  return withClient(client, async (c) => {
    const raw = (await c.callTool({
      name: "groq_query",
      arguments: { query, params },
      options: { timeout },
    })) as LooseCallToolResult;
    throwIfError(raw);

    let payload: unknown = raw.structuredContent;
    if (payload === undefined || payload === null) {
      const text = joinText(raw);
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ContextError("malformed", "groq_query text was not JSON");
      }
    }
    if (!payload || typeof payload !== "object" || !("result" in payload)) {
      throw new ContextError("malformed", "groq_query result had no `result` key");
    }
    const obj = payload as { result: T; meta?: GroqMeta };
    const meta: GroqMeta = obj.meta && typeof obj.meta === "object" ? obj.meta : {};
    if (
      typeof meta.resultCount === "number" &&
      typeof meta.returnedCount === "number" &&
      meta.returnedCount !== meta.resultCount
    ) {
      throw new ContextError(
        "truncated",
        `returned ${meta.returnedCount} of ${meta.resultCount}`,
      );
    }
    return { result: obj.result, meta };
  });
}

// ----------------------------------------------------------------------------
// Knowledge Base mode
// ----------------------------------------------------------------------------

/** Read the KB outline via `initial_context`. */
export async function contextKbOutline(
  opts: OpenOpts = {},
): Promise<{ text: string; kbId: string | null }> {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cfg = opts.cfg === undefined ? contextConfig() : opts.cfg;
  const client = await openKbContext({
    ...opts,
    cfg,
    tools: opts.tools ?? ["initial_context", "knowledge_base_read"],
  });
  return withClient(client, async (c) => {
    const raw = (await c.callTool({
      name: "initial_context",
      arguments: {},
      options: { timeout },
    })) as LooseCallToolResult;
    throwIfError(raw);
    let text = joinText(raw);
    if (!text && typeof raw.structuredContent === "string") text = raw.structuredContent;
    if (!text) throw new ContextError("malformed", "initial_context returned no text");
    const m = /Knowledge base id:\s*`?(kb[^\s`]+)`?/i.exec(text);
    return { text, kbId: m ? m[1] : (cfg?.kbId ?? null) };
  });
}

interface JsonSchemaLike {
  properties?: Record<string, { type?: string | string[] }>;
  required?: string[];
}

/** Pick knowledge_base_read argument names from its inputSchema (Decision 9). */
export function resolveKbReadArgNames(schema: JsonSchemaLike | undefined): {
  idArg: string;
  pathsArg: string;
} {
  const fallback = { idArg: "knowledgeBaseId", pathsArg: "paths" };
  const props = schema?.properties;
  if (!props || typeof props !== "object") return fallback;
  const entries = Object.entries(props);
  const isType = (p: { type?: string | string[] }, t: string) =>
    Array.isArray(p.type) ? p.type.includes(t) : p.type === t;
  const strings = entries.filter(([, p]) => p && isType(p, "string")).map(([k]) => k);
  const arrays = entries.filter(([, p]) => p && isType(p, "array")).map(([k]) => k);
  const idArg =
    strings.find((k) => /knowledge.?base|kb/i.test(k)) ??
    strings.find((k) => (schema?.required ?? []).includes(k));
  const pathsArg = arrays[0];
  if (!idArg || !pathsArg) return fallback;
  return { idArg, pathsArg };
}

/** Read KB entries by exact path via `knowledge_base_read` (1–20 paths). */
export async function contextKbRead(
  paths: string[],
  opts: OpenOpts = {},
): Promise<{ markdown: string }> {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 20) {
    throw new ContextError("tool_error", "knowledge_base_read needs 1–20 entry paths");
  }
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cfg = opts.cfg === undefined ? contextConfig() : opts.cfg;
  if (!isKbConfigured(cfg)) throw new ContextError("not_configured", "SANITY_KB_ID is not set");
  const client = await openKbContext({
    ...opts,
    cfg,
    tools: opts.tools ?? ["initial_context", "knowledge_base_read"],
  });
  return withClient(client, async (c) => {
    let schema: JsonSchemaLike | undefined;
    try {
      const listed = await c.listTools({ options: { timeout } });
      const t = listed.tools.find((x) => x.name === "knowledge_base_read");
      schema = t?.inputSchema as JsonSchemaLike | undefined;
    } catch {
      schema = undefined; // fall back to the default arg names
    }
    const { idArg, pathsArg } = resolveKbReadArgNames(schema);
    const raw = (await c.callTool({
      name: "knowledge_base_read",
      arguments: { [idArg]: cfg.kbId, [pathsArg]: paths },
      options: { timeout },
    })) as LooseCallToolResult;
    throwIfError(raw);
    let markdown = joinText(raw);
    if (!markdown && typeof raw.structuredContent === "string") markdown = raw.structuredContent;
    if (!markdown) throw new ContextError("malformed", "knowledge_base_read returned no text");
    return { markdown };
  });
}
