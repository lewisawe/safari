import { describe, it, expect, vi, beforeEach } from "vitest";

const committed: Array<Array<Record<string, unknown>>> = [];
let failCommit = false;
vi.mock("@/lib/sanityClient", () => ({
  getReadClient: () => {
    throw new Error("read client not expected");
  },
  getWriteClient: () => ({
    transaction() {
      const ops: Array<Record<string, unknown>> = [];
      const tx = {
        delete(id: string) {
          ops.push({ delete: id });
          return tx;
        },
        patch(id: string) {
          ops.push({ patch: id });
          return tx;
        },
        async commit() {
          if (failCommit) throw new Error("Sanity down");
          committed.push(ops);
          return {};
        },
      };
      return tx;
    },
  }),
}));

import { POST } from "./demo/reset/route";

function reset(ip: string, body: unknown = {}): Promise<Response> {
  return POST(
    new Request("http://localhost/api/demo/reset", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  committed.length = 0;
  failCommit = false;
});

describe("POST /api/demo/reset", () => {
  it("returns { ok: true } and touches only the two fixed ids, ignoring the body", async () => {
    const res = await reset("198.51.100.1", { contradictionId: "something.else", id: "x" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(committed).toEqual([
      [
        { delete: "userDecision.contra.ana.sfonrt.business" },
        { patch: "contra.ana.sfonrt.business" },
      ],
    ]);
  });

  it("rate-limits to 3 per minute per IP with a typed error", async () => {
    const ip = "198.51.100.2";
    for (let i = 0; i < 3; i++) expect((await reset(ip)).status).toBe(200);
    const res = await reset(ip);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, error: "rate_limited" });
    expect((await reset("198.51.100.3")).status).toBe(200);
  });

  it("returns a typed error when the write fails", async () => {
    failCommit = true;
    const res = await reset("198.51.100.4");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, error: "reset_failed" });
  });
});
