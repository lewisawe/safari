// app/api/chat.guard.test.ts
//
// Route-level cost guard for /api/chat (public demo): every limit is checked
// BEFORE any model call and answers with the typed disabled payload. Offline:
// streamText, Bedrock, the AWS credential chain and Sanity are all mocked.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let counterMode: "ok" | "fail" = "ok";
let count = 0;
const commit = vi.fn(async () => {
  if (counterMode === "fail") throw new Error("Sanity down");
  count += 1;
  return {};
});
vi.mock("@/lib/sanityClient", () => ({
  getReadClient: () => {
    throw new Error("read client not expected");
  },
  getWriteClient: () => {
    const tx = { createIfNotExists: () => tx, patch: () => tx, commit };
    return {
      transaction: () => tx,
      getDocument: async () => {
        if (counterMode === "fail") throw new Error("Sanity down");
        return count === 0 ? undefined : { count };
      },
    };
  },
}));
vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: () => {
    throw new Error("Context MCP not expected");
  },
}));
const streamText = vi.fn(() => ({
  toUIMessageStreamResponse: () => new Response("stream", { status: 200 }),
}));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (...args: unknown[]) => streamText(...(args as [])) };
});
vi.mock("@ai-sdk/amazon-bedrock", () => ({
  createAmazonBedrock: () => (id: string) => ({ provider: "bedrock-mock", modelId: id }),
}));
vi.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain: () => async () => {
    throw new Error("credentials must NOT be resolved in tests");
  },
}));

import { POST } from "./chat/route";

const ENV_KEYS = [
  "MODEL_PROVIDER",
  "MODEL_PROVIDER_API_KEY",
  "MODEL_NAME",
  "AGENT_ENABLED",
  "AGENT_DAILY_CAP",
  "AGENT_RATE_PER_HOUR",
  "SANITY_CONTEXT_MCP_URL",
  "SANITY_CONTEXT_TOKEN",
  "SANITY_KB_ID",
] as const;
const prev = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

let ipSeq = 0;
function freshIp(): string {
  ipSeq += 1;
  return `203.0.113.${ipSeq}`;
}

function chat(body: unknown, ip: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `${ip}, 10.0.0.1` },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const userMsg = (text: string, id = "u1") => ({ id, role: "user", parts: [{ type: "text", text }] });
const ASK = { messages: [userMsg("SFO to NRT business")] };

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.MODEL_PROVIDER = "bedrock";
  counterMode = "ok";
  count = 0;
  streamText.mockClear();
  commit.mockClear();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
});

describe("chat cost guard", () => {
  it("happy path streams with maxOutputTokens and a step cap <= 8", async () => {
    const res = await chat(ASK, freshIp());
    expect(await res.text()).toBe("stream");
    const opts = (streamText.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(opts.maxOutputTokens).toBe(1200);
    expect(opts.stopWhen).toBeDefined();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("AGENT_ENABLED=false -> disabled_by_operator, no model call, no counter", async () => {
    process.env.AGENT_ENABLED = "false";
    const p = await json(await chat(ASK, freshIp()));
    expect(p).toMatchObject({ disabled: true, reason: "disabled_by_operator", solverPath: "/solver" });
    expect(streamText).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("per-IP rate limit: the request over AGENT_RATE_PER_HOUR gets rate_limited", async () => {
    process.env.AGENT_RATE_PER_HOUR = "1";
    const ip = freshIp();
    expect(await (await chat(ASK, ip)).text()).toBe("stream");
    const p = await json(await chat(ASK, ip));
    expect(p).toMatchObject({ disabled: true, reason: "rate_limited", solverPath: "/solver" });
    expect(typeof p.message).toBe("string");
    expect(streamText).toHaveBeenCalledTimes(1);
    // A different visitor is unaffected.
    expect(await (await chat(ASK, freshIp())).text()).toBe("stream");
  });

  it("daily cap: AGENT_DAILY_CAP=0 -> daily_cap before any model call", async () => {
    process.env.AGENT_DAILY_CAP = "0";
    const p = await json(await chat(ASK, freshIp()));
    expect(p).toMatchObject({ disabled: true, reason: "daily_cap", solverPath: "/solver" });
    expect(String(p.message)).toContain("/solver");
    expect(streamText).not.toHaveBeenCalled();
  });

  it("daily cap: the run that pushes the shared count over the cap is refused", async () => {
    process.env.AGENT_DAILY_CAP = "1";
    expect(await (await chat(ASK, freshIp())).text()).toBe("stream");
    const p = await json(await chat(ASK, freshIp()));
    expect(p).toMatchObject({ disabled: true, reason: "daily_cap" });
    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it("fails CLOSED when the usage counter cannot be written", async () => {
    counterMode = "fail";
    const p = await json(await chat(ASK, freshIp()));
    expect(p).toMatchObject({ disabled: true, reason: "daily_cap" });
    expect(streamText).not.toHaveBeenCalled();
  });

  it("probe (no messages) never calls the model or spends budget", async () => {
    const res = await chat({ messages: [] }, freshIp());
    expect(await json(res)).toEqual({ disabled: false });
    expect(streamText).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("probe reports the cap and the rate limit without counting", async () => {
    process.env.AGENT_DAILY_CAP = "0";
    expect(await json(await chat({ messages: [] }, freshIp()))).toMatchObject({ reason: "daily_cap" });
    delete process.env.AGENT_DAILY_CAP;
    process.env.AGENT_RATE_PER_HOUR = "1";
    const ip = freshIp();
    expect(await json(await chat({ messages: [] }, ip))).toEqual({ disabled: false });
    await chat(ASK, ip);
    expect(await json(await chat({ messages: [] }, ip))).toMatchObject({ reason: "rate_limited" });
  });

  it("rejects more than 12 messages with a typed 400", async () => {
    const messages = Array.from({ length: 13 }, (_, i) => userMsg("hi", `m${i}`));
    const res = await chat({ messages }, freshIp());
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: "too_many_messages" });
    expect(streamText).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("rejects user text over 2000 chars with a typed 400", async () => {
    const res = await chat({ messages: [userMsg("x".repeat(2001))] }, freshIp());
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: "message_too_long" });
    expect(streamText).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON with a typed 400", async () => {
    const res = await chat("{not json", freshIp());
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: "invalid_json" });
  });
});
