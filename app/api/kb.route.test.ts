// app/api/kb.route.test.ts — /api/kb is quiet and price-free (mocked MCP).
import { describe, it, expect, vi, beforeEach } from "vitest";

const createMCPClient = vi.fn();
vi.mock("@ai-sdk/mcp", () => ({ createMCPClient: (...a: unknown[]) => createMCPClient(...a) }));

import { GET as kbGET, POST as kbPOST } from "./kb/route";

const req = (b: unknown) =>
  new Request("http://localhost/api/kb", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof b === "string" ? b : JSON.stringify(b),
  });

const PRICE_KEYS = ["chosen", "proof", "costInUserCurrency", "effectivePointsCost", "chosenPointsCost", "pointsCost"];

beforeEach(() => {
  createMCPClient.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.SANITY_CONTEXT_MCP_URL;
  delete process.env.SANITY_CONTEXT_TOKEN;
  delete process.env.SANITY_KB_ID;
});

describe("/api/kb", () => {
  it("POST not configured -> 200 configured:false, no MCP call, no price keys", async () => {
    const res = await kbPOST(req({ origin: "SFO", destination: "NRT", programCodes: ["ANA"] }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.configured).toBe(false);
    expect(typeof json.message).toBe("string");
    for (const k of PRICE_KEYS) expect(json[k]).toBeUndefined();
    expect(createMCPClient).not.toHaveBeenCalled();
  });

  it("GET not configured -> 200 configured:false", async () => {
    const res = await kbGET();
    expect(res.status).toBe(200);
    expect(((await res.json()) as Record<string, unknown>).configured).toBe(false);
  });

  it("configured but -32005 -> 200 ok:false no_knowledge_base", async () => {
    process.env.SANITY_CONTEXT_MCP_URL = "https://api.sanity.io/context/mcp/ep1";
    process.env.SANITY_CONTEXT_TOKEN = "tok";
    process.env.SANITY_KB_ID = "kbSafari";
    createMCPClient.mockRejectedValue({ code: -32005, message: "no kb" });
    const res = await kbPOST(req({ origin: "SFO", destination: "NRT" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({ configured: true, ok: false, error: "no_knowledge_base" });
    for (const k of PRICE_KEYS) expect(json[k]).toBeUndefined();
  });

  it("bad body -> 400", async () => {
    expect((await kbPOST(req("not json"))).status).toBe(400);
    expect((await kbPOST(req({ origin: 1 }))).status).toBe(400);
  });
});
