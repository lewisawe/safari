// lib/traverse.test.ts — traversal via Context MCP vs @sanity/client fallback,
// and the gate invariant over Context-sourced rows. Fully offline (mocked).
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.mock("@/lib/sanityClient", () => ({
  getReadClient: () => ({ fetch: mockFetch }),
  getWriteClient: () => {
    throw new Error("write client must not be used by traversal");
  },
}));

const createMCPClient = vi.fn();
vi.mock("@ai-sdk/mcp", () => ({ createMCPClient: (...a: unknown[]) => createMCPClient(...a) }));

import { runTraversal, VIA_CONTEXT } from "./traverse";
import { bindGroqParams } from "./context";
import { TRAVERSE_ROUTINGS_QUERY } from "./groq";
import { SFO_NRT_BUSINESS_ROWS, SFO_NRT_BUSINESS_PARAMS } from "./fixtures/sfo-nrt-business.rows";
import { toCandidates } from "./toCandidates";
import { solve } from "../solver/solve";
import { POST as traversePOST } from "../app/api/traverse/route";

function client(callTool: ReturnType<typeof vi.fn>) {
  return { callTool, listTools: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
}

function configure(on: boolean) {
  if (on) {
    process.env.SANITY_CONTEXT_MCP_URL = "https://api.sanity.io/context/mcp/ep1";
    process.env.SANITY_CONTEXT_TOKEN = "tok";
  } else {
    delete process.env.SANITY_CONTEXT_MCP_URL;
    delete process.env.SANITY_CONTEXT_TOKEN;
  }
  delete process.env.SANITY_KB_ID;
}

beforeEach(() => {
  mockFetch.mockReset();
  createMCPClient.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("runTraversal", () => {
  it("Context configured: same fixed query, identical rows, via context-mcp, no @sanity/client", async () => {
    configure(true);
    const c = client(
      vi.fn().mockResolvedValue({
        structuredContent: {
          result: SFO_NRT_BUSINESS_ROWS,
          meta: { executedQuery: "EXECUTED", resultCount: 3, returnedCount: 3 },
        },
      }),
    );
    createMCPClient.mockResolvedValue(c);

    const out = await runTraversal(SFO_NRT_BUSINESS_PARAMS);
    expect(out.rows).toEqual(SFO_NRT_BUSINESS_ROWS);
    expect(out.via).toBe(VIA_CONTEXT);
    expect(out.executedQuery).toBe("EXECUTED");
    expect(c.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "groq_query",
        // Same fixed query, params bound as literals (Context rejects $params).
        arguments: { query: bindGroqParams(TRAVERSE_ROUTINGS_QUERY, { ...SFO_NRT_BUSINESS_PARAMS }) },
      }),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("not configured: falls back to @sanity/client with a visible marker", async () => {
    configure(false);
    mockFetch.mockResolvedValue(SFO_NRT_BUSINESS_ROWS);
    const out = await runTraversal(SFO_NRT_BUSINESS_PARAMS);
    expect(out.rows).toEqual(SFO_NRT_BUSINESS_ROWS);
    expect(out.via).toContain("Context not configured");
    expect(mockFetch).toHaveBeenCalledWith(TRAVERSE_ROUTINGS_QUERY, { ...SFO_NRT_BUSINESS_PARAMS });
    expect(createMCPClient).not.toHaveBeenCalled();
  });

  it("Context isError: falls back to @sanity/client, marker names the failure, client closed", async () => {
    configure(true);
    const c = client(vi.fn().mockResolvedValue({ isError: true, content: [{ type: "text", text: "boom" }] }));
    createMCPClient.mockResolvedValue(c);
    mockFetch.mockResolvedValue(SFO_NRT_BUSINESS_ROWS);
    const out = await runTraversal(SFO_NRT_BUSINESS_PARAMS);
    expect(out.via).toBe("sanity-client (Context MCP failed: tool_error)");
    expect(out.rows).toEqual(SFO_NRT_BUSINESS_ROWS);
    expect(c.close).toHaveBeenCalledTimes(1);
  });

  it("Context returns a non-array result: treated as malformed, falls back", async () => {
    configure(true);
    createMCPClient.mockResolvedValue(client(vi.fn().mockResolvedValue({ structuredContent: { result: { x: 1 } } })));
    mockFetch.mockResolvedValue(SFO_NRT_BUSINESS_ROWS);
    const out = await runTraversal(SFO_NRT_BUSINESS_PARAMS);
    expect(out.via).toBe("sanity-client (Context MCP failed: malformed)");
  });

  it("gate fires first on Context-sourced fresh-seed rows (NOT_COMPUTED, no price)", async () => {
    configure(true);
    createMCPClient.mockResolvedValue(
      client(vi.fn().mockResolvedValue({ structuredContent: { result: SFO_NRT_BUSINESS_ROWS } })),
    );
    const { rows } = await runTraversal(SFO_NRT_BUSINESS_PARAMS);
    const r = solve({ origin: "SFO", destination: "NRT", cabin: "business", candidates: toCandidates(rows) });
    expect(r.kind).toBe("NOT_COMPUTED");
    if (r.kind === "NOT_COMPUTED") expect(r.reason).toBe("UNRESOLVED_CONTRADICTION");
    expect((r as unknown as Record<string, unknown>).chosen).toBeUndefined();
  });
});

describe("/api/traverse route", () => {
  const body = {
    currencyIds: ["cur.amex", "cur.chase"],
    origin: "SFO",
    destination: "NRT",
    cabin: "business",
  };
  const req = (b: unknown) =>
    new Request("http://localhost/api/traverse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(b),
    });

  it("not configured: keeps rows/query/params contract, adds via", async () => {
    configure(false);
    mockFetch.mockResolvedValue(SFO_NRT_BUSINESS_ROWS);
    const res = await traversePOST(req(body));
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(json.rows).toEqual(SFO_NRT_BUSINESS_ROWS);
    expect(json.query).toBe(TRAVERSE_ROUTINGS_QUERY);
    expect(json.params).toEqual(body);
    expect(json.via).toBe("sanity-client (Context not configured)");
  });

  it("configured: same contract, via context-mcp", async () => {
    configure(true);
    createMCPClient.mockResolvedValue(
      client(vi.fn().mockResolvedValue({ structuredContent: { result: SFO_NRT_BUSINESS_ROWS } })),
    );
    const res = await traversePOST(req(body));
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.rows).toEqual(SFO_NRT_BUSINESS_ROWS);
    expect(json.query).toBe(TRAVERSE_ROUTINGS_QUERY);
    expect(json.via).toBe("context-mcp");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("400 contract unchanged", async () => {
    configure(false);
    const res = await traversePOST(req({ origin: 1 }));
    expect(res.status).toBe(400);
  });
});

describe("Context literal safety", () => {
  it("strips Context's extra top-level _id so rows are identical", async () => {
    configure(true);
    const withIds = SFO_NRT_BUSINESS_ROWS.map((r) => ({ _id: r.transferPartnerId, ...r }));
    createMCPClient.mockResolvedValue(client(vi.fn().mockResolvedValue({ structuredContent: { result: withIds } })));
    const out = await runTraversal(SFO_NRT_BUSINESS_PARAMS);
    expect(out.rows).toEqual(SFO_NRT_BUSINESS_ROWS);
  });

  it("an injection attempt is never sent to Context; parameterized fallback serves it", async () => {
    configure(true);
    mockFetch.mockResolvedValue([]);
    const evil = { ...SFO_NRT_BUSINESS_PARAMS, origin: 'SFO" || true || "' };
    const out = await runTraversal(evil);
    expect(createMCPClient).not.toHaveBeenCalled();
    expect(out.via).toBe("sanity-client (Context MCP failed: malformed)");
    expect(mockFetch).toHaveBeenCalledWith(TRAVERSE_ROUTINGS_QUERY, evil);
  });
});
