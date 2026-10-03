// lib/kbEvidence.test.ts — keyless KB evidence read (mocked MCP client).
import { describe, it, expect, vi, beforeEach } from "vitest";

const createMCPClient = vi.fn();
vi.mock("@ai-sdk/mcp", () => ({ createMCPClient: (...a: unknown[]) => createMCPClient(...a) }));

import { readKbEvidence, extractCitations, selectKbEntries } from "./kbEvidence";

const OUTLINE = [
  "# Safari KB (synthetic)",
  "Knowledge base id: kbSafari",
  "- `sources/ana-devaluation-notice.md` [core] — ANA devaluation notice SFO→NRT 90,000",
  "- `sources/ana-award-chart.md` [core] — ANA printed chart SFO→NRT 85,000",
  "- `transfers/ratios.md` — transfer ratio table",
].join("\n");

const ENTRY_MD =
  "# ANA devaluation\nSYNTHETIC. Effective 2026-09-25.\n\nSee [ANA Devaluation Notice](https://example.invalid/ana-devaluation).";

beforeEach(() => {
  createMCPClient.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.SANITY_CONTEXT_MCP_URL = "https://api.sanity.io/context/mcp/ep1";
  process.env.SANITY_CONTEXT_TOKEN = "tok";
  process.env.SANITY_KB_ID = "kbSafari";
});

const PRICE_KEYS = ["chosen", "proof", "costInUserCurrency", "effectivePointsCost", "chosenPointsCost", "pointsCost"];

describe("readKbEvidence", () => {
  it("not configured -> configured:false, never connects", async () => {
    delete process.env.SANITY_CONTEXT_TOKEN;
    const ev = await readKbEvidence({ origin: "SFO", destination: "NRT" });
    expect(ev.configured).toBe(false);
    expect(createMCPClient).not.toHaveBeenCalled();
  });

  it("no SANITY_KB_ID -> configured:false", async () => {
    delete process.env.SANITY_KB_ID;
    const ev = await readKbEvidence({ origin: "SFO", destination: "NRT" });
    expect(ev.configured).toBe(false);
    expect(createMCPClient).not.toHaveBeenCalled();
  });

  it("configured -> reads the ANA paths, returns markdown + citations, no price keys", async () => {
    // No knowledge_base_search tool on this endpoint -> outline fallback.
    const searchClient = {
      callTool: vi.fn(),
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: "knowledge_base_read", inputSchema: {} }] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const outlineClient = {
      callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: OUTLINE }] }),
      listTools: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const readClient = {
      callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: ENTRY_MD }] }),
      listTools: vi.fn().mockResolvedValue({ tools: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    createMCPClient
      .mockResolvedValueOnce(searchClient)
      .mockResolvedValueOnce(outlineClient)
      .mockResolvedValueOnce(readClient);

    const ev = await readKbEvidence({ origin: "SFO", destination: "NRT", programCodes: ["ANA", "VS"] });
    expect(ev.configured && "ok" in ev && ev.ok).toBe(true);
    if (!ev.configured || !ev.ok) throw new Error("expected ok");
    expect(readClient.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "knowledge_base_read",
        arguments: {
          knowledgeBaseId: "kbSafari",
          paths: ["sources/ana-devaluation-notice.md", "sources/ana-award-chart.md"],
        },
      }),
    );
    expect(ev.markdown).toBe(ENTRY_MD);
    expect(ev.citations).toEqual([
      { text: "ANA Devaluation Notice", url: "https://example.invalid/ana-devaluation" },
    ]);
    expect(ev.kbId).toBe("kbSafari");
    for (const k of PRICE_KEYS) expect((ev as Record<string, unknown>)[k]).toBeUndefined();
    expect(searchClient.callTool).not.toHaveBeenCalled();
    expect(searchClient.close).toHaveBeenCalledTimes(1);
    expect(outlineClient.close).toHaveBeenCalledTimes(1);
    expect(readClient.close).toHaveBeenCalledTimes(1);
  });

  it("-32005 -> ok:false no_knowledge_base (quiet)", async () => {
    createMCPClient.mockRejectedValue({ code: -32005, message: "no kb" });
    const ev = await readKbEvidence({ origin: "SFO", destination: "NRT" });
    expect(ev).toMatchObject({ configured: true, ok: false, error: "no_knowledge_base" });
  });
});

describe("extractCitations", () => {
  it("keeps only unique http(s) links", () => {
    expect(
      extractCitations("[a](https://x.invalid/a) [a](https://x.invalid/a) [b](javascript:alert(1))"),
    ).toEqual([{ text: "a", url: "https://x.invalid/a" }]);
  });
});

// Both seeded contradictions, as a rebuilt KB might list them (mocked).
const TWO_ROUTE_OUTLINE = [
  "# Safari KB (synthetic)",
  "- `sources/ana-devaluation-notice.md` [core] — ANA devaluation notice: SFO→NRT business 90,000 effective 2026-09-25",
  "- `sources/ana-award-chart.md` [core] — ANA printed award chart: SFO→NRT business 85,000",
  "- `programs/virgin-atlantic-chart.md` [core] — Virgin Atlantic partner chart: SFO→NRT business 95,000; JFK→LHR economy 25,000",
  "- `sources/points-blog-vs-sale.md` — Points blog: Virgin Atlantic JFK→LHR economy sale 20,000",
  "- `programs/british-airways-chart.md` — British Airways award chart: JFK→LHR economy 26,000",
  "- `transfers/transfer-ratios.md` [peripheral] — Transfer partner ratio table (Amex MR, Chase UR, Capital One)",
].join("\n");

describe("selectKbEntries (route-aware)", () => {
  it("JFK→LHR with the contradicted VS program picks the JFK→LHR entries, not the ANA ones", () => {
    const { paths } = selectKbEntries(TWO_ROUTE_OUTLINE, {
      origin: "JFK",
      destination: "LHR",
      programCodes: ["VS"],
    });
    expect(paths.slice(0, 2)).toEqual([
      "programs/virgin-atlantic-chart.md",
      "sources/points-blog-vs-sale.md",
    ]);
    expect(paths).not.toContain("sources/ana-devaluation-notice.md");
    expect(paths).not.toContain("sources/ana-award-chart.md");
  });

  it("SFO→NRT with ANA still picks the ANA entries first and no JFK→LHR-only entry", () => {
    const { paths } = selectKbEntries(TWO_ROUTE_OUTLINE, {
      origin: "SFO",
      destination: "NRT",
      programCodes: ["ANA"],
    });
    expect(paths.slice(0, 2)).toEqual([
      "sources/ana-devaluation-notice.md",
      "sources/ana-award-chart.md",
    ]);
    expect(paths).not.toContain("sources/points-blog-vs-sale.md");
    expect(paths).not.toContain("programs/british-airways-chart.md");
  });

  it("a bare 'VS' code does not match 'old notice vs new notice' prose", () => {
    const { paths } = selectKbEntries(
      "# KB\n- `a/conflict.md` — old notice vs new notice\n- `b/virgin.md` — Virgin Atlantic JFK→LHR",
      { origin: "XXX", destination: "YYY", programCodes: ["VS"] },
    );
    expect(paths).toEqual(["b/virgin.md"]);
  });
});
