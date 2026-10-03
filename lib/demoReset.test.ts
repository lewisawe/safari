import { describe, it, expect } from "vitest";
import { DEMO_CONTRADICTION_ID, DEMO_USER_DECISION_ID, resetDemoGate, type ResetClient } from "./demoReset";

/** Records every mutation a transaction would commit. */
function recordingClient() {
  const committed: Array<Array<Record<string, unknown>>> = [];
  const client = {
    transaction() {
      const ops: Array<Record<string, unknown>> = [];
      const tx = {
        delete(id: string) {
          ops.push({ delete: id });
          return tx;
        },
        patch(id: string, fn: (p: unknown) => unknown) {
          const patchOps: unknown[] = [];
          const p = {
            unset(v: unknown) {
              patchOps.push({ unset: v });
              return p;
            },
            set(v: unknown) {
              patchOps.push({ set: v });
              return p;
            },
          };
          fn(p);
          ops.push({ patch: id, ops: patchOps });
          return tx;
        },
        async commit() {
          committed.push(ops);
          return {};
        },
      };
      return tx;
    },
  } as unknown as ResetClient;
  return { client, committed };
}

describe("resetDemoGate", () => {
  it("issues exactly two mutations on the two fixed ids, in one transaction", async () => {
    const { client, committed } = recordingClient();
    await resetDemoGate(client);
    expect(committed).toHaveLength(1);
    expect(committed[0]).toEqual([
      { delete: "userDecision.contra.ana.sfonrt.business" },
      {
        patch: "contra.ana.sfonrt.business",
        ops: [{ unset: ["committedResolution"] }, { set: { status: "unresolved" } }],
      },
    ]);
  });

  it("uses the same ids as the seed's gate reset", () => {
    expect(DEMO_CONTRADICTION_ID).toBe("contra.ana.sfonrt.business");
    expect(DEMO_USER_DECISION_ID).toBe(`userDecision.${DEMO_CONTRADICTION_ID}`);
  });
});
