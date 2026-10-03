// lib/kbSearch.test.ts — knowledge_base_search parsing + search-first entry
// selection, and the summary-less outline fallback (mocked MCP client).
import { describe, it, expect, vi, beforeEach } from "vitest";

const createMCPClient = vi.fn();
vi.mock("@ai-sdk/mcp", () => ({ createMCPClient: (...a: unknown[]) => createMCPClient(...a) }));

import {
  contextKbSearch,
  parseKbSearchResults,
  resolveKbSearchArgNames,
  type ContextConfig,
} from "./context";
import {
  buildKbSearchQuery,
  readKbEvidence,
  selectFromSearch,
  selectKbEntries,
  selectKbPaths,
} from "./kbEvidence";
import { parseKbOutline } from "./kbOutline";

const CFG = { url: "https://api.sanity.io/context/mcp/ep1", token: "tok", kbId: "kby2KJXfwxBt" } as ContextConfig;

// Verbatim shape of the live KB-mode outline after the rebuild (no summaries).
const BARE_OUTLINE = [
  "Knowledge base id: `kby2KJXfwxBt`",
  "## Safari award-travel facts — Award prices, devaluations, promotions and transfer partners",
  "7 entries.",
  "award_prices/transatlantic [core]",
  "award_prices/transpacific_laxsyd",
  "award_prices/transpacific_sfonrt [core]",
  "devaluation_notices [core]",
  "loyalty_programs",
  "promotions",
  "transfer_partners [core]",
].join("\n");

// Live knowledge_base_search text for "JFK LHR Virgin Atlantic economy".
const JFK_SEARCH = `Entries matching "JFK LHR Virgin Atlantic economy", ranked by relevance:

1. \`award_prices/transatlantic\` (score 18.57): JFK–LHR Award Prices
   One-way award point costs and taxes for New York JFK to London Heathrow: British Airways Executive Club (economy 26k, business 60k pts), Avianca LifeMiles (economy 22k, business 52k pts), Virgin Atlantic Flying Club (economy 25k, business 57.5k pts). Effective dates 2025-03-01 to 2025-05-01.
2. \`award_prices/transpacific_sfonrt\` (score 13.61): SFO–NRT Award Prices
   One-way award prices SFO to NRT: ANA Mileage Club (economy 35k, business 85k pts pre-devaluation / 90k pts from 2026-09-25, first 110k pts); Air Canada Aeroplan (economy 37.5k, business 105k pts); Virgin Atlantic Flying Club (business 95k pts). Taxes listed per entry.
3. \`promotions\` (score 3.77): Promotional & Sale Pricing
   Temporary or limited-time award price reductions, flash sales, and bonus offers that differ from the standard published chart
4. \`award_prices/transpacific_laxsyd\` (score 1.83): LAX–SYD Award Prices
   One-way award point costs and taxes for Los Angeles LAX to Sydney SYD: Avianca LifeMiles business class 78k pts plus $200 taxes (eff. 2025-05-01); Air Canada Aeroplan business class 90k pts plus $250 taxes (eff. 2025-02-10).
5. \`transfer_partners\` (score 1.64): Transfer Partners & Conversion Ratios
   Which transferable point currencies (Amex MR, Chase UR, Capital One) connect to which airline loyalty programs, at what conversion ratio, and posting times

Fetch the full content of the winning paths with knowledge_base_read (pass several paths in one call).`;

// Live knowledge_base_search text for "SFO NRT ANA business".
const SFO_SEARCH = `Entries matching "SFO NRT ANA business", ranked by relevance:

1. \`award_prices/transpacific_sfonrt\` (score 20.11): SFO–NRT Award Prices
   One-way award prices SFO to NRT: ANA Mileage Club (economy 35k, business 85k pts pre-devaluation / 90k pts from 2026-09-25, first 110k pts); Air Canada Aeroplan (economy 37.5k, business 105k pts); Virgin Atlantic Flying Club (business 95k pts). Taxes listed per entry.
2. \`award_prices/transpacific_laxsyd\` (score 5.92): LAX–SYD Award Prices
   One-way award point costs and taxes for Los Angeles LAX to Sydney SYD: Avianca LifeMiles business class 78k pts plus $200 taxes (eff. 2025-05-01); Air Canada Aeroplan business class 90k pts plus $250 taxes (eff. 2025-02-10).
3. \`devaluation_notices\` (score 4.93): Devaluation & Repricing Notices
   Announced or effective changes to award charts that supersede previously published prices, including effective dates and magnitude of change
4. \`award_prices/transatlantic\` (score 4.45): JFK–LHR Award Prices
   One-way award point costs and taxes for New York JFK to London Heathrow: British Airways Executive Club (economy 26k, business 60k pts), Avianca LifeMiles (economy 22k, business 52k pts), Virgin Atlantic Flying Club (economy 25k, business 57.5k pts). Effective dates 2025-03-01 to 2025-05-01.
5. \`transfer_partners\` (score 0.88): Transfer Partners & Conversion Ratios
   Which transferable point currencies (Amex MR, Chase UR, Capital One) connect to which airline loyalty programs, at what conversion ratio, and posting times

Fetch the full content of the winning paths with knowledge_base_read (pass several paths in one call).`;

const SEARCH_SCHEMA = {
  type: "object",
  properties: {
    knowledgeBase: { type: "string" },
    query: { type: "string", minLength: 1 },
    return: { type: "string", enum: ["paths", "entries"], default: "paths" },
    limit: { type: "integer", minimum: 1, maximum: 20, default: 5 },
  },
  required: ["knowledgeBase", "query"],
};

function mockClient(callTool: unknown, tools: unknown[] = [{ name: "knowledge_base_search", inputSchema: SEARCH_SCHEMA }]) {
  return {
    callTool: vi.fn().mockImplementation(async () => callTool),
    listTools: vi.fn().mockResolvedValue({ tools }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  createMCPClient.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("parseKbSearchResults", () => {
  it("parses ranked backticked paths, scores, titles and summaries from the live text", () => {
    const r = parseKbSearchResults(JFK_SEARCH);
    expect(r.map((x) => x.path)).toEqual([
      "award_prices/transatlantic",
      "award_prices/transpacific_sfonrt",
      "promotions",
      "award_prices/transpacific_laxsyd",
      "transfer_partners",
    ]);
    expect(r[0]).toMatchObject({ score: 18.57, title: "JFK–LHR Award Prices" });
    expect(r[0].summary).toMatch(/Virgin Atlantic Flying Club \(economy 25k/);
    expect(r[4].summary).not.toMatch(/Fetch the full content/);
  });

  it("prefers structured content when present", () => {
    const r = parseKbSearchResults("ignored", {
      results: [{ path: "a/b", title: "T", summary: "S", score: 2 }, { nope: 1 }],
    });
    expect(r).toEqual([{ path: "a/b", title: "T", summary: "S", score: 2 }]);
  });

  it("empty / no-hit text -> []", () => {
    expect(parseKbSearchResults('No entries matching "x".')).toEqual([]);
  });
});

describe("resolveKbSearchArgNames", () => {
  it("reads the live schema", () => {
    expect(resolveKbSearchArgNames(SEARCH_SCHEMA)).toEqual({
      idArg: "knowledgeBase",
      queryArg: "query",
      limitArg: "limit",
    });
  });
  it("falls back to the documented names", () => {
    expect(resolveKbSearchArgNames(undefined)).toEqual({ idArg: "knowledgeBase", queryArg: "query", limitArg: null });
  });
});

describe("selectFromSearch", () => {
  it("JFK→LHR economy VS -> transatlantic + promotions", () => {
    const req = { origin: "JFK", destination: "LHR", programCodes: ["VS"], cabin: "economy" };
    expect(selectFromSearch(parseKbSearchResults(JFK_SEARCH), req)).toEqual([
      "award_prices/transatlantic",
      "promotions",
    ]);
  });

  it("SFO→NRT business ANA -> transpacific_sfonrt + devaluation_notices", () => {
    const req = { origin: "SFO", destination: "NRT", programCodes: ["ANA"], cabin: "business" };
    expect(selectFromSearch(parseKbSearchResults(SFO_SEARCH), req)).toEqual([
      "award_prices/transpacific_sfonrt",
      "devaluation_notices",
    ]);
  });

  it("requires a route-specific hit (no entry naming both codes -> [])", () => {
    const req = { origin: "ORD", destination: "CDG", programCodes: ["VS"] };
    expect(selectFromSearch(parseKbSearchResults(JFK_SEARCH), req)).toEqual([]);
  });

  it("prefers a context entry that names the program, and caps at 3", () => {
    const results = [
      { path: "r", title: "JFK–LHR prices", summary: "", score: 9 },
      { path: "promo", title: "Sale pricing", summary: "flash sales", score: 5 },
      { path: "dev", title: "Devaluation notice", summary: "Virgin Atlantic repricing", score: 4 },
    ];
    expect(selectFromSearch(results, { origin: "JFK", destination: "LHR", programCodes: ["VS"] })).toEqual([
      "r",
      "dev",
    ]);
  });
});

describe("buildKbSearchQuery", () => {
  it("uses program names, never bare codes", () => {
    expect(buildKbSearchQuery({ origin: "JFK", destination: "LHR", programCodes: ["VS"], cabin: "economy" })).toBe(
      "JFK LHR Virgin Atlantic economy",
    );
    expect(buildKbSearchQuery({ origin: "SFO", destination: "NRT", programCodes: ["ANA"] })).toBe("SFO NRT ANA");
  });
});

describe("contextKbSearch (mocked MCP)", () => {
  it("calls knowledge_base_search with the schema's arg names and parses the ranking", async () => {
    const c = mockClient({ content: [{ type: "text", text: JFK_SEARCH }] });
    createMCPClient.mockResolvedValueOnce(c);
    const { results } = await contextKbSearch("JFK LHR Virgin", { cfg: CFG, limit: 10 });
    expect(results[0].path).toBe("award_prices/transatlantic");
    expect(c.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "knowledge_base_search",
        arguments: { knowledgeBase: "kby2KJXfwxBt", query: "JFK LHR Virgin", limit: 10 },
      }),
    );
    expect(c.close).toHaveBeenCalledTimes(1);
  });

  it("tool missing from tools/list -> typed tool_error, no call", async () => {
    const c = mockClient({}, [{ name: "knowledge_base_read", inputSchema: {} }]);
    createMCPClient.mockResolvedValueOnce(c);
    await expect(contextKbSearch("x", { cfg: CFG })).rejects.toMatchObject({ kind: "tool_error" });
    expect(c.callTool).not.toHaveBeenCalled();
  });

  it("isError result -> typed tool_error", async () => {
    createMCPClient.mockResolvedValueOnce(mockClient({ isError: true, content: [{ type: "text", text: "boom" }] }));
    await expect(contextKbSearch("x", { cfg: CFG })).rejects.toMatchObject({ kind: "tool_error" });
  });
});

describe("selectKbPaths", () => {
  it("search first: JFK→LHR picks transatlantic + promotions without touching the outline", async () => {
    createMCPClient.mockResolvedValueOnce(mockClient({ content: [{ type: "text", text: JFK_SEARCH }] }));
    const getOutline = vi.fn();
    const sel = await selectKbPaths({ origin: "JFK", destination: "LHR", programCodes: ["VS"] }, { cfg: CFG, getOutline });
    expect(sel).toMatchObject({ via: "search", paths: ["award_prices/transatlantic", "promotions"] });
    expect(sel.summaries.get("award_prices/transatlantic")).toMatch(/economy 25k/);
    expect(getOutline).not.toHaveBeenCalled();
  });

  it("search error -> outline fallback over the summary-less outline", async () => {
    createMCPClient.mockRejectedValueOnce(new Error("network down"));
    const getOutline = vi.fn().mockResolvedValue({ text: BARE_OUTLINE, kbId: "kby2KJXfwxBt" });
    const sel = await selectKbPaths({ origin: "SFO", destination: "NRT", programCodes: ["ANA"] }, { cfg: CFG, getOutline });
    expect(sel.via).toBe("outline");
    expect(sel.paths[0]).toBe("award_prices/transpacific_sfonrt");
  });
});

describe("summary-less outline (fallback)", () => {
  it("parses all 7 bare-path entries with tags; ignores id, heading and count lines", () => {
    const o = parseKbOutline(BARE_OUTLINE);
    expect(o.kbId).toBe("kby2KJXfwxBt");
    expect(o.title).toMatch(/^Safari award-travel facts/);
    expect(o.entries.map((e) => e.path)).toEqual([
      "award_prices/transatlantic",
      "award_prices/transpacific_laxsyd",
      "award_prices/transpacific_sfonrt",
      "devaluation_notices",
      "loyalty_programs",
      "promotions",
      "transfer_partners",
    ]);
    expect(o.entries.find((e) => e.path === "devaluation_notices")?.tag).toBe("core");
    expect(o.entries.find((e) => e.path === "promotions")?.tag).toBeUndefined();
  });

  it("compact path names count as on-route (sfonrt = SFO+NRT)", () => {
    const { paths } = selectKbEntries(BARE_OUTLINE, { origin: "SFO", destination: "NRT", programCodes: ["ANA"] });
    expect(paths).toEqual(["award_prices/transpacific_sfonrt"]);
  });
});

describe("readKbEvidence via search (mocked MCP)", () => {
  it("search -> read; entries carry search summaries; no price keys", async () => {
    process.env.SANITY_CONTEXT_MCP_URL = CFG.url;
    process.env.SANITY_CONTEXT_TOKEN = "tok";
    process.env.SANITY_KB_ID = "kby2KJXfwxBt";
    const search = mockClient({ content: [{ type: "text", text: SFO_SEARCH }] });
    const read = mockClient({ content: [{ type: "text", text: "# SFO–NRT\nANA business 90,000 from 2026-09-25" }] }, []);
    createMCPClient.mockResolvedValueOnce(search).mockResolvedValueOnce(read);
    const ev = await readKbEvidence({ origin: "SFO", destination: "NRT", programCodes: ["ANA"] });
    if (!ev.configured || !ev.ok) throw new Error("expected ok");
    expect(ev.entries.map((e) => e.path)).toEqual(["award_prices/transpacific_sfonrt", "devaluation_notices"]);
    expect(read.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "knowledge_base_read",
        arguments: {
          knowledgeBaseId: "kby2KJXfwxBt",
          paths: ["award_prices/transpacific_sfonrt", "devaluation_notices"],
        },
      }),
    );
    for (const k of ["chosen", "proof", "pointsCost"]) expect((ev as Record<string, unknown>)[k]).toBeUndefined();
  });
});
