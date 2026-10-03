// scripts/check-context.ts
//
// Live smoke test for the Sanity Context MCP endpoint. Run with:
//   npm run check-context
//   (= node --env-file=.env.local ./node_modules/.bin/tsx scripts/check-context.ts)
//
// 1. Config   — which vars are set (names only; never values or the token).
// 2. GROQ mode — list tools; run the fixed traversal via groq_query; print row
//               counts and each contradiction's resolved/unresolved status
//               (compare before/after a resolve to check read-after-write
//               freshness through Context).
// 3. KB mode   — list tools + their inputSchemas; print the outline header;
//               for BOTH demo routes (SFO→NRT/ANA, JFK→LHR/VS) print the
//               deterministically selected entry paths (knowledge_base_search,
//               outline fallback; same selection as /api/kb) and the first 40
//               lines of the read entries.
//
// Every documented failure prints its actionable message (403
// contextGrantRequired, -32004 schema not deployed, -32005 no KB, unknown kb
// id, 401). Relative imports only (tsx does not resolve the `@/` alias).

import {
  ContextError,
  contextConfig,
  contextGroqQuery,
  contextKbOutline,
  contextKbRead,
  isKbConfigured,
  mapContextError,
  openGroqContext,
  openKbContext,
} from "../lib/context";
import { TRAVERSE_ROUTINGS_QUERY } from "../lib/groq";
import { parseKbOutline } from "../lib/kbOutline";
import { buildKbSearchQuery, selectKbEntries, selectKbPaths } from "../lib/kbEvidence";
import type { TraverseRow } from "../lib/fixtures/sfo-nrt-business.rows";

let exitCode = 0;

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function report(section: string, err: unknown): void {
  const ce = err instanceof ContextError ? err : mapContextError(err);
  exitCode = 1;
  console.error(`[${section}] FAILED (${ce.kind}): ${ce.message}`);
}

async function main(): Promise<void> {
  header("1. Config");
  const cfg = contextConfig();
  if (!cfg) {
    const missing = ["SANITY_CONTEXT_MCP_URL", "SANITY_CONTEXT_TOKEN"].filter(
      (n) => !process.env[n] || process.env[n]!.trim() === "",
    );
    console.error(
      `Sanity Context is not configured. Missing: ${missing.join(", ")}.\n` +
        "Add them to .env.local (see README → \"Sanity Context setup\").",
    );
    process.exit(1);
  }
  let shown: string;
  try {
    const u = new URL(cfg.url);
    shown = `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    console.error("SANITY_CONTEXT_MCP_URL is not a valid URL.");
    process.exit(1);
  }
  console.log(`Endpoint: ${shown} (query string hidden)`);
  console.log("Token: set (value hidden)");
  console.log(`SANITY_KB_ID: ${cfg.kbId ? "set" : "not set (KB mode will be skipped)"}`);

  header("2. GROQ mode");
  try {
    const client = await openGroqContext({ cfg });
    try {
      const { tools } = await client.listTools();
      console.log(`Tools: ${tools.map((t) => t.name).join(", ") || "(none)"}`);
    } finally {
      await client.close();
    }
  } catch (err) {
    report("groq:listTools", err);
  }
  try {
    const params = {
      currencyIds: ["cur.amex", "cur.chase"],
      origin: "SFO",
      destination: "NRT",
      cabin: "business",
    };
    const { result, meta } = await contextGroqQuery<TraverseRow[]>(TRAVERSE_ROUTINGS_QUERY, params, { cfg });
    if (!Array.isArray(result)) throw new ContextError("malformed", "traversal result is not an array");
    console.log(`meta.resultCount=${String(meta.resultCount)} meta.returnedCount=${String(meta.returnedCount)}`);
    if (typeof meta.executedQuery === "string") {
      console.log(`meta.executedQuery (first line): ${meta.executedQuery.split("\n")[0]}`);
    }
    console.log(`Rows: ${result.length}`);
    let found = 0;
    for (const row of result) {
      for (const entry of row.chartEntries ?? []) {
        for (const c of entry.contradictions ?? []) {
          found++;
          const status = c.committedResolution == null ? "UNRESOLVED" : "resolved";
          console.log(`  ${row.toProgram?.code ?? "?"}  ${c._id}  ${status}`);
        }
      }
    }
    if (found === 0) console.log("  (no routings carry a contradiction)");
  } catch (err) {
    report("groq:traversal", err);
  }

  header("3. Knowledge Base mode");
  if (!isKbConfigured(cfg)) {
    console.log(
      "Skipped: SANITY_KB_ID is not set. Create + build a KB from dataset 62hh3v9t/production, then set SANITY_KB_ID (starts with `kb`).",
    );
  } else {
    try {
      const client = await openKbContext({ cfg });
      try {
        const { tools } = await client.listTools();
        console.log(`Tools: ${tools.map((t) => t.name).join(", ") || "(none)"}`);
        for (const t of tools) {
          if (t.name === "initial_context" || t.name.startsWith("knowledge_base_")) {
            console.log(`  ${t.name} inputSchema: ${JSON.stringify(t.inputSchema)}`);
          }
        }
      } finally {
        await client.close();
      }
    } catch (err) {
      report("kb:listTools", err);
    }
    let outlineText: string | null = null;
    try {
      const { text, kbId } = await contextKbOutline({ cfg });
      outlineText = text;
      console.log(`Outline (kb id: ${kbId ?? "?"}), first 15 lines:`);
      console.log(text.split("\n").slice(0, 15).map((l) => `  | ${l}`).join("\n"));
      console.log(`Parsed outline entries: ${parseKbOutline(text).entries.length}`);
    } catch (err) {
      report("kb:outline", err);
    }
    const routes = [
      { origin: "SFO", destination: "NRT", programCodes: ["ANA"] },
      { origin: "JFK", destination: "LHR", programCodes: ["VS"] },
    ];
    for (const req of routes) {
      const label = `${req.origin}→${req.destination} (${req.programCodes.join(",")})`;
      try {
        if (outlineText) {
          const fb = selectKbEntries(outlineText, req).paths;
          console.log(`\n[${label}] outline-fallback paths: ${fb.join(", ") || "(none)"}`);
        }
        console.log(`[${label}] search query: "${buildKbSearchQuery(req)}"`);
        const sel = await selectKbPaths(req, { cfg });
        console.log(`[${label}] Matched paths (via ${sel.via}): ${sel.paths.join(", ") || "(none)"}`);
        if (sel.paths.length > 0) {
          const { markdown } = await contextKbRead(sel.paths, { cfg });
          console.log(`[${label}] knowledge_base_read, first 40 lines:`);
          console.log(markdown.split("\n").slice(0, 40).map((l) => `  | ${l}`).join("\n"));
        } else {
          exitCode = 1;
          console.error(`[${label}] No KB entries matched; check the raw outline above.`);
        }
      } catch (err) {
        report(`kb:read ${label}`, err);
      }
    }
  }

  console.log(exitCode === 0 ? "\nAll checks passed." : "\nSome checks failed (see above).");
  process.exit(exitCode);
}

main().catch((err) => {
  report("check-context", err);
  process.exit(1);
});
