// lib/context.test.ts — Context MCP helpers with a MOCKED @ai-sdk/mcp client.
import { describe, it, expect, vi, beforeEach } from "vitest";

const createMCPClient = vi.fn();
vi.mock("@ai-sdk/mcp", () => ({ createMCPClient: (...a: unknown[]) => createMCPClient(...a) }));

import {
  ContextError,
  buildGroqUrl,
  buildKbUrl,
  contextConfig,
  contextGroqQuery,
  contextKbOutline,
  contextKbRead,
  openKbContext,
  mapContextError,
} from "./context";
import { SFO_NRT_BUSINESS_ROWS } from "./fixtures/sfo-nrt-business.rows";

const TOKEN = "sk-secret-token-value-123";

function fakeClient(over: Partial<Record<"callTool" | "listTools", ReturnType<typeof vi.fn>>> = {}) {
  return {
    callTool: over.callTool ?? vi.fn(),
    listTools: over.listTools ?? vi.fn().mockResolvedValue({ tools: [] }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  createMCPClient.mockReset();
  process.env.SANITY_CONTEXT_MCP_URL = "https://api.sanity.io/context/mcp/ep1?perspective=published";
  process.env.SANITY_CONTEXT_TOKEN = TOKEN;
  process.env.SANITY_KB_ID = "kbAbc";
});

describe("contextConfig", () => {
  it("is null without URL or without token; kbId null without SANITY_KB_ID", () => {
    delete process.env.SANITY_CONTEXT_MCP_URL;
    expect(contextConfig()).toBeNull();
    process.env.SANITY_CONTEXT_MCP_URL = "https://h/x";
    delete process.env.SANITY_CONTEXT_TOKEN;
    expect(contextConfig()).toBeNull();
    process.env.SANITY_CONTEXT_TOKEN = "  ";
    expect(contextConfig()).toBeNull();
    process.env.SANITY_CONTEXT_TOKEN = TOKEN;
    delete process.env.SANITY_KB_ID;
    expect(contextConfig()).toEqual({ url: "https://h/x", token: TOKEN, kbId: null });
  });
});

describe("URL builders", () => {
  it("buildKbUrl keeps existing params and sets mode + knowledgeBases", () => {
    const u = new URL(buildKbUrl("https://h/x?perspective=published", "kbAbc"));
    expect(u.searchParams.get("perspective")).toBe("published");
    expect(u.searchParams.get("mode")).toBe("knowledge_base");
    expect(u.searchParams.get("knowledgeBases")).toBe("kbAbc");
    expect(u.pathname).toBe("/x");
  });
  it("buildGroqUrl sets mode=groq and an optional tools allowlist", () => {
    const u = new URL(buildGroqUrl("https://h/x?a=1", ["groq_query"]));
    expect(u.searchParams.get("a")).toBe("1");
    expect(u.searchParams.get("mode")).toBe("groq");
    expect(u.searchParams.get("tools")).toBe("groq_query");
    expect(new URL(buildGroqUrl("https://h/x")).searchParams.has("tools")).toBe(false);
  });
});

describe("contextGroqQuery", () => {
  it("connects over http with a bearer header and mode=groq", async () => {
    const c = fakeClient({
      callTool: vi.fn().mockResolvedValue({ content: [], structuredContent: { result: [] } }),
    });
    createMCPClient.mockResolvedValue(c);
    await contextGroqQuery("*[]", {});
    const cfg = createMCPClient.mock.calls[0][0] as {
      transport: { type: string; url: string; headers: Record<string, string> };
    };
    expect(cfg.transport.type).toBe("http");
    expect(cfg.transport.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
    const u = new URL(cfg.transport.url);
    expect(u.searchParams.get("mode")).toBe("groq");
    expect(u.searchParams.get("perspective")).toBe("published");
  });

  it("unwraps structuredContent.result into the identical row shape", async () => {
    const c = fakeClient({
      callTool: vi.fn().mockResolvedValue({
        content: [],
        structuredContent: { result: SFO_NRT_BUSINESS_ROWS, meta: { executedQuery: "Q", resultCount: 3, returnedCount: 3 } },
      }),
    });
    createMCPClient.mockResolvedValue(c);
    const { result, meta } = await contextGroqQuery("*[]", { x: 1 });
    expect(result).toEqual(SFO_NRT_BUSINESS_ROWS);
    expect(meta.executedQuery).toBe("Q");
    expect(c.callTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "groq_query", arguments: { query: "*[]", params: { x: 1 } } }),
    );
    expect(c.close).toHaveBeenCalledTimes(1);
  });

  it("unwraps text-JSON content", async () => {
    const c = fakeClient({
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ result: SFO_NRT_BUSINESS_ROWS }) }],
      }),
    });
    createMCPClient.mockResolvedValue(c);
    const { result } = await contextGroqQuery("*[]", {});
    expect(result).toEqual(SFO_NRT_BUSINESS_ROWS);
  });

  it("an isError result throws tool_error and fabricates no rows; close still called", async () => {
    const c = fakeClient({
      callTool: vi.fn().mockResolvedValue({ isError: true, content: [{ type: "text", text: "bad query" }] }),
    });
    createMCPClient.mockResolvedValue(c);
    await expect(contextGroqQuery("*[]", {})).rejects.toMatchObject({ kind: "tool_error" });
    expect(c.close).toHaveBeenCalledTimes(1);
  });

  it("non-JSON text is malformed", async () => {
    const c = fakeClient({
      callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "not json" }] }),
    });
    createMCPClient.mockResolvedValue(c);
    await expect(contextGroqQuery("*[]", {})).rejects.toMatchObject({ kind: "malformed" });
  });

  it("returnedCount < resultCount throws truncated", async () => {
    const c = fakeClient({
      callTool: vi.fn().mockResolvedValue({
        structuredContent: { result: [1], meta: { resultCount: 4, returnedCount: 1 } },
      }),
    });
    createMCPClient.mockResolvedValue(c);
    await expect(contextGroqQuery("*[]", {})).rejects.toMatchObject({ kind: "truncated" });
  });

  it("close is called once when callTool throws", async () => {
    const c = fakeClient({ callTool: vi.fn().mockRejectedValue(new Error("socket hang up")) });
    createMCPClient.mockResolvedValue(c);
    await expect(contextGroqQuery("*[]", {})).rejects.toMatchObject({ kind: "transport" });
    expect(c.close).toHaveBeenCalledTimes(1);
  });

  it("maps 403 contextGrantRequired / -32004 / -32005 from createMCPClient", async () => {
    createMCPClient.mockRejectedValueOnce({
      statusCode: 403,
      responseBody: '{"code":"contextGrantRequired"}',
      message: `MCP HTTP Transport Error: POSTing to endpoint (HTTP 403): Bearer ${TOKEN}`,
    });
    const e1 = await contextGroqQuery("*[]", {}).catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(ContextError);
    expect((e1 as ContextError).kind).toBe("grant_required");
    expect((e1 as ContextError).message).toContain("ORGANIZATION token");
    expect((e1 as ContextError).message).not.toContain(TOKEN);

    createMCPClient.mockRejectedValueOnce({ code: -32004, message: "schema" });
    await expect(contextGroqQuery("*[]", {})).rejects.toMatchObject({ kind: "schema_not_deployed" });
    createMCPClient.mockRejectedValueOnce({ code: -32005, message: "kb" });
    await expect(contextGroqQuery("*[]", {})).rejects.toMatchObject({ kind: "no_knowledge_base" });
    createMCPClient.mockRejectedValueOnce({ statusCode: 401, message: "nope" });
    await expect(contextGroqQuery("*[]", {})).rejects.toMatchObject({ kind: "unauthorized" });
  });

  it("error messages never include the token or the URL query string", () => {
    const e = mapContextError(
      new Error(`failed https://h/x?mode=groq&secret=1 with ${TOKEN}`),
    );
    expect(e.message).not.toContain(TOKEN);
    expect(e.message).not.toContain("secret=1");
  });

  it("not configured throws not_configured without connecting", async () => {
    delete process.env.SANITY_CONTEXT_TOKEN;
    await expect(contextGroqQuery("*[]", {})).rejects.toMatchObject({ kind: "not_configured" });
    expect(createMCPClient).not.toHaveBeenCalled();
  });
});

describe("Knowledge Base mode", () => {
  it("openKbContext without SANITY_KB_ID throws not_configured and never connects", async () => {
    delete process.env.SANITY_KB_ID;
    await expect(openKbContext()).rejects.toMatchObject({ kind: "not_configured" });
    expect(createMCPClient).not.toHaveBeenCalled();
  });

  it("contextKbOutline returns text, kbId from the outline, and uses KB-mode URL", async () => {
    const c = fakeClient({
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "# Safari KB\nKnowledge base id: kbXyz\n- `a/b.md` — x" }],
      }),
    });
    createMCPClient.mockResolvedValue(c);
    const out = await contextKbOutline();
    expect(out.kbId).toBe("kbXyz");
    expect(out.text).toContain("Safari KB");
    const url = new URL((createMCPClient.mock.calls[0][0] as { transport: { url: string } }).transport.url);
    expect(url.searchParams.get("mode")).toBe("knowledge_base");
    expect(url.searchParams.get("knowledgeBases")).toBe("kbAbc");
    expect(url.searchParams.get("perspective")).toBe("published");
    expect(c.close).toHaveBeenCalledTimes(1);
  });

  it("contextKbRead uses arg names discovered from inputSchema", async () => {
    const c = fakeClient({
      listTools: vi.fn().mockResolvedValue({
        tools: [
          {
            name: "knowledge_base_read",
            inputSchema: {
              type: "object",
              properties: { knowledgeBase: { type: "string" }, entryPaths: { type: "array" } },
              required: ["knowledgeBase", "entryPaths"],
            },
          },
        ],
      }),
      callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "# ANA\nbody" }] }),
    });
    createMCPClient.mockResolvedValue(c);
    const { markdown } = await contextKbRead(["ana/deval.md"]);
    expect(markdown).toContain("# ANA");
    expect(c.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "knowledge_base_read",
        arguments: { knowledgeBase: "kbAbc", entryPaths: ["ana/deval.md"] },
      }),
    );
    expect(c.close).toHaveBeenCalledTimes(1);
  });

  it("contextKbRead falls back to { knowledgeBaseId, paths } when the schema lacks them", async () => {
    const c = fakeClient({
      listTools: vi.fn().mockResolvedValue({ tools: [{ name: "knowledge_base_read", inputSchema: { type: "object" } }] }),
      callTool: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] }),
    });
    createMCPClient.mockResolvedValue(c);
    await contextKbRead(["x/y.md"]);
    expect(c.callTool).toHaveBeenCalledWith(
      expect.objectContaining({ arguments: { knowledgeBaseId: "kbAbc", paths: ["x/y.md"] } }),
    );
  });

  it("contextKbRead rejects 0 or >20 paths without connecting", async () => {
    await expect(contextKbRead([])).rejects.toBeInstanceOf(ContextError);
    await expect(contextKbRead(Array.from({ length: 21 }, (_, i) => `p${i}`))).rejects.toBeInstanceOf(
      ContextError,
    );
    expect(createMCPClient).not.toHaveBeenCalled();
  });

  it("an isError mentioning the knowledge base id maps to unknown_kb", async () => {
    const c = fakeClient({
      callTool: vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: "text", text: "Unknown knowledge base id kbAbc; valid ids: kb1" }],
      }),
    });
    createMCPClient.mockResolvedValue(c);
    await expect(contextKbRead(["a.md"])).rejects.toMatchObject({ kind: "unknown_kb" });
  });
});
