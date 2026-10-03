// app/api/chat.disabled.test.ts
//
// NFR-3 (FEAT-006 acceptance #2): with MODEL_PROVIDER_API_KEY ABSENT, the chat
// (agent) route must return a TYPED "disabled" JSON response — never crash and
// never fabricate a price — so the model-free /solver path stays the working
// default. This runs fully offline: no network, no model key, and the Sanity
// client is mocked (it is never reached on the disabled path anyway).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The chat route imports the Sanity client at module load; mock it so importing
// the route needs no live Sanity. On the disabled path neither client is used.
vi.mock("@/lib/sanityClient", () => ({
  getReadClient: () => {
    throw new Error("read client must NOT be used on the disabled path");
  },
  getWriteClient: () => {
    throw new Error("write client must NOT be used on the disabled path");
  },
}));

// Context MCP must not be touched on the disabled path either (the KB outline
// is fetched only AFTER the model-key check).
const createMCPClient = vi.fn(() => {
  throw new Error("Context MCP must NOT be used on the disabled path");
});
vi.mock("@ai-sdk/mcp", () => ({ createMCPClient: () => createMCPClient() }));

import { POST as chatPOST } from "./chat/route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("chat route — NFR-3 disabled path (no model key)", () => {
  const prevKey = process.env.MODEL_PROVIDER_API_KEY;

  beforeEach(() => {
    delete process.env.MODEL_PROVIDER_API_KEY;
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.MODEL_PROVIDER_API_KEY;
    else process.env.MODEL_PROVIDER_API_KEY = prevKey;
  });

  it("returns a typed { disabled: true } JSON that points to /solver, and leaks no price", async () => {
    const res = await chatPOST(
      jsonRequest({
        messages: [
          { id: "1", role: "user", parts: [{ type: "text", text: "SFO to NRT business" }] },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("application/json");

    const payload = (await res.json()) as Record<string, unknown>;
    expect(payload.disabled).toBe(true);
    expect(payload.solverPath).toBe("/solver");
    expect(typeof payload.message).toBe("string");

    // Fail-closed: no numeric price fields on the disabled payload.
    for (const k of [
      "chosen",
      "proof",
      "costInUserCurrency",
      "effectivePointsCost",
      "chosenPointsCost",
    ]) {
      expect(payload[k]).toBeUndefined();
    }
  });

  it("does not crash on an empty messages probe (the agent page's up-front check)", async () => {
    const res = await chatPOST(jsonRequest({ messages: [] }));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as Record<string, unknown>;
    expect(payload.disabled).toBe(true);
  });

  it("stays disabled and never opens a Context MCP client even when Context + KB are configured", async () => {
    process.env.SANITY_CONTEXT_MCP_URL = "https://api.sanity.io/context/mcp/ep1";
    process.env.SANITY_CONTEXT_TOKEN = "tok";
    process.env.SANITY_KB_ID = "kbSafari";
    try {
      const res = await chatPOST(jsonRequest({ messages: [] }));
      const payload = (await res.json()) as Record<string, unknown>;
      expect(payload.disabled).toBe(true);
      expect(createMCPClient).not.toHaveBeenCalled();
    } finally {
      delete process.env.SANITY_CONTEXT_MCP_URL;
      delete process.env.SANITY_CONTEXT_TOKEN;
      delete process.env.SANITY_KB_ID;
    }
  });
});
