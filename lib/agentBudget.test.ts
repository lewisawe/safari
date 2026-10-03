import { describe, it, expect, vi } from "vitest";
import {
  agentUsageDocId,
  consumeAgentRun,
  peekAgentBudget,
  type UsageClient,
} from "./agentBudget";

/**
 * Mocked Sanity client backed by a Map of counter docs. Records every
 * transaction's operations so the atomic createIfNotExists + patch shape can
 * be asserted.
 */
function mockClient(opts: { failCommit?: boolean; failGet?: boolean } = {}) {
  const docs = new Map<string, { _id: string; count?: number }>();
  const transactions: Array<Array<{ op: string; id: string; ops?: unknown[] }>> = [];

  function transaction() {
    const ops: Array<{ op: string; id: string; ops?: unknown[]; doc?: Record<string, unknown> }> = [];
    const tx = {
      createIfNotExists(doc: { _id: string } & Record<string, unknown>) {
        ops.push({ op: "createIfNotExists", id: doc._id, doc });
        return tx;
      },
      patch(id: string, fn: (p: unknown) => unknown) {
        const patchOps: unknown[] = [];
        const p = {
          setIfMissing(v: unknown) {
            patchOps.push({ setIfMissing: v });
            return p;
          },
          inc(v: unknown) {
            patchOps.push({ inc: v });
            return p;
          },
        };
        fn(p);
        ops.push({ op: "patch", id, ops: patchOps });
        return tx;
      },
      async commit() {
        if (opts.failCommit) throw new Error("Sanity unavailable");
        transactions.push(ops);
        for (const o of ops) {
          if (o.op === "createIfNotExists" && !docs.has(o.id)) {
            docs.set(o.id, { ...(o.doc as { _id: string }) });
          }
          if (o.op === "patch") {
            const d = docs.get(o.id)!;
            d.count = (d.count ?? 0) + 1;
          }
        }
        return {};
      },
    };
    return tx;
  }

  const client = {
    transaction,
    getDocument: vi.fn(async (id: string) => {
      if (opts.failGet) throw new Error("Sanity unavailable");
      return docs.get(id);
    }),
  } as unknown as UsageClient;
  return { client, docs, transactions };
}

const DAY1 = new Date("2026-05-01T12:00:00Z");

describe("agentUsageDocId", () => {
  it("is a fixed id per UTC day", () => {
    expect(agentUsageDocId(DAY1)).toBe("demoUsage.agent.2026-05-01");
    expect(agentUsageDocId(new Date("2026-05-01T23:59:59Z"))).toBe("demoUsage.agent.2026-05-01");
  });
});

describe("consumeAgentRun", () => {
  it("allows runs while the committed count is within the cap", async () => {
    const { client } = mockClient();
    const r1 = await consumeAgentRun(() => client, 2, DAY1);
    const r2 = await consumeAgentRun(() => client, 2, DAY1);
    expect(r1).toEqual({ ok: true, count: 1 });
    expect(r2).toEqual({ ok: true, count: 2 });
  });

  it("rejects once the committed count exceeds the cap", async () => {
    const { client } = mockClient();
    await consumeAgentRun(() => client, 2, DAY1);
    await consumeAgentRun(() => client, 2, DAY1);
    expect(await consumeAgentRun(() => client, 2, DAY1)).toEqual({
      ok: false,
      reason: "daily_cap",
      count: 3,
    });
  });

  it("increments atomically: createIfNotExists then setIfMissing+inc in ONE transaction", async () => {
    const { client, transactions } = mockClient();
    await consumeAgentRun(() => client, 5, DAY1);
    expect(transactions).toHaveLength(1);
    const [create, patch] = transactions[0];
    expect(create).toMatchObject({ op: "createIfNotExists", id: "demoUsage.agent.2026-05-01" });
    expect(patch).toEqual({
      op: "patch",
      id: "demoUsage.agent.2026-05-01",
      ops: [{ setIfMissing: { count: 0 } }, { inc: { count: 1 } }],
    });
  });

  it("fails CLOSED when the counter write fails", async () => {
    const { client } = mockClient({ failCommit: true });
    expect(await consumeAgentRun(() => client, 50, DAY1)).toEqual({
      ok: false,
      reason: "counter_unavailable",
    });
  });

  it("fails CLOSED when the read-back fails or the client cannot be built", async () => {
    const { client } = mockClient({ failGet: true });
    expect((await consumeAgentRun(() => client, 50, DAY1)).ok).toBe(false);
    const noToken = () => {
      throw new Error("missing required environment variable SANITY_API_WRITE_TOKEN");
    };
    expect(await consumeAgentRun(noToken, 50, DAY1)).toEqual({
      ok: false,
      reason: "counter_unavailable",
    });
  });

  it("cap 0 rejects without writing", async () => {
    const { client, transactions } = mockClient();
    expect(await consumeAgentRun(() => client, 0, DAY1)).toEqual({
      ok: false,
      reason: "daily_cap",
      count: 0,
    });
    expect(transactions).toHaveLength(0);
  });

  it("rolls over to a new doc id on a new UTC day", async () => {
    const { client, docs } = mockClient();
    await consumeAgentRun(() => client, 1, DAY1);
    expect((await consumeAgentRun(() => client, 1, DAY1)).ok).toBe(false);
    const next = await consumeAgentRun(() => client, 1, new Date("2026-05-02T00:00:01Z"));
    expect(next).toEqual({ ok: true, count: 1 });
    expect([...docs.keys()]).toEqual([
      "demoUsage.agent.2026-05-01",
      "demoUsage.agent.2026-05-02",
    ]);
  });
});

describe("peekAgentBudget", () => {
  it("treats a missing doc as zero and does not write", async () => {
    const { client, transactions } = mockClient();
    expect(await peekAgentBudget(() => client, 1, DAY1)).toEqual({ ok: true, count: 0 });
    expect(transactions).toHaveLength(0);
  });

  it("reports exhausted once count reaches the cap", async () => {
    const { client } = mockClient();
    await consumeAgentRun(() => client, 1, DAY1);
    expect(await peekAgentBudget(() => client, 1, DAY1)).toMatchObject({
      ok: false,
      reason: "daily_cap",
    });
  });

  it("fails closed on a read error", async () => {
    const { client } = mockClient({ failGet: true });
    expect(await peekAgentBudget(() => client, 5, DAY1)).toEqual({
      ok: false,
      reason: "counter_unavailable",
    });
  });
});
