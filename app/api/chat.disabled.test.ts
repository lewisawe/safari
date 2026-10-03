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
// The write client is swapped per test: the disabled path must never reach it,
// and the enabled (bedrock) path gets a fake usage-counter client for the
// daily cap (lib/agentBudget.ts).
const writeClientFactory = vi.fn((): unknown => {
  throw new Error("write client must NOT be used on the disabled path");
});
vi.mock("@/lib/sanityClient", () => ({
  getReadClient: () => {
    throw new Error("read client must NOT be used on the disabled path");
  },
  getWriteClient: () => writeClientFactory(),
}));

/** A minimal usage-counter client: every commit bumps an in-memory count. */
function fakeUsageClient() {
  let count = 0;
  const tx = {
    createIfNotExists: () => tx,
    patch: () => tx,
    commit: async () => {
      count += 1;
      return {};
    },
  };
  return {
    transaction: () => tx,
    getDocument: async () => (count === 0 ? undefined : { count }),
  };
}

const ONE_MESSAGE = {
  messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "SFO to NRT business" }] }],
};

// Context MCP must not be touched on the disabled path either (the KB outline
// is fetched only AFTER the model-key check).
const createMCPClient = vi.fn(() => {
  throw new Error("Context MCP must NOT be used on the disabled path");
});
vi.mock("@ai-sdk/mcp", () => ({ createMCPClient: () => createMCPClient() }));

// Bedrock is enabled without any API key. The streamText call is stubbed so the
// enabled-path test never reaches AWS (no network, no credentials read).
const streamText = vi.fn(() => ({
  toUIMessageStreamResponse: () => new Response("stream", { status: 200 }),
}));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (...args: unknown[]) => streamText(...(args as [])) };
});
const bedrockModel = vi.fn((id: string) => ({ provider: "bedrock-mock", modelId: id }));
const createAmazonBedrock = vi.fn(() => bedrockModel);
vi.mock("@ai-sdk/amazon-bedrock", () => ({
  createAmazonBedrock: (...args: unknown[]) => createAmazonBedrock(...(args as [])),
}));
vi.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain: () => async () => {
    throw new Error("credentials must NOT be resolved in tests");
  },
}));

import { POST as chatPOST } from "./chat/route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ENV_KEYS = [
  "MODEL_PROVIDER_API_KEY",
  "MODEL_PROVIDER",
  "MODEL_NAME",
  "AGENT_ENABLED",
  "AGENT_DAILY_CAP",
  "AGENT_RATE_PER_HOUR",
] as const;
const prevEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function restoreEnv(): void {
  for (const k of ENV_KEYS) {
    const v = prevEnv[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("chat route — NFR-3 disabled path (no model key)", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(restoreEnv);

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

describe("chat route — MODEL_PROVIDER=bedrock (no API key needed)", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
    delete process.env.SANITY_CONTEXT_MCP_URL;
    delete process.env.SANITY_CONTEXT_TOKEN;
    delete process.env.SANITY_KB_ID;
    process.env.MODEL_PROVIDER = "bedrock";
    writeClientFactory.mockImplementation(() => fakeUsageClient());
    streamText.mockClear();
    createAmazonBedrock.mockClear();
    bedrockModel.mockClear();
  });

  afterEach(restoreEnv);

  it("is NOT disabled without MODEL_PROVIDER_API_KEY and streams via the Nova Pro default", async () => {
    const res = await chatPOST(jsonRequest(ONE_MESSAGE));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").not.toContain("application/json");
    expect(await res.text()).toBe("stream");
    expect(createAmazonBedrock).toHaveBeenCalledTimes(1);
    expect(bedrockModel).toHaveBeenCalledWith("us.amazon.nova-pro-v1:0");
    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it("wires the Nova hardening: thinking-strip transform + model-facing traverse output", async () => {
    await chatPOST(jsonRequest(ONE_MESSAGE));
    const opts = (streamText.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(typeof opts.experimental_transform).toBe("function");
    const tools = opts.tools as Record<string, { toModelOutput?: unknown }>;
    expect(typeof tools.traverseRoutings.toModelOutput).toBe("function");
  });

  it("honors MODEL_NAME for the Bedrock model id", async () => {
    process.env.MODEL_NAME = "us.amazon.nova-lite-v1:0";
    await chatPOST(jsonRequest(ONE_MESSAGE));
    expect(bedrockModel).toHaveBeenCalledWith("us.amazon.nova-lite-v1:0");
  });
});
