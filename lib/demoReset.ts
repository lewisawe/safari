// lib/demoReset.ts
//
// "Reset demo": the gate-reset half of scripts/seed.ts and nothing else. The
// seed restores the always-fires gates by deleting the derived userDecisions
// and writing each contradiction with no committedResolution (status
// "unresolved"). On the live dataset that is two mutations per contradiction,
// all on FIXED ids, in ONE transaction:
//
//   for each id in DEMO_CONTRADICTION_IDS:
//     1. delete userDecision.<id>
//     2. patch  <id>: unset committedResolution, status back to "unresolved"
//
// No other document is touched and no caller input reaches the ids.

import type { SanityClient } from "@sanity/client";

/** The original SFO→NRT business gate (85k chart vs 90k devaluation). */
export const DEMO_CONTRADICTION_ID = "contra.ana.sfonrt.business";
// Mirrors lib/resolution.ts userDecisionId and the seed's USER_DECISION_ID.
export const DEMO_USER_DECISION_ID = `userDecision.${DEMO_CONTRADICTION_ID}`;

/** Every seeded contradiction the demo resets (fixed ids, seed order). */
export const DEMO_CONTRADICTION_IDS = [
  DEMO_CONTRADICTION_ID,
  "contra.vs.jfklhr.economy",
] as const;

/** Derived carry-forward decision id (same rule as lib/resolution.ts). */
export function demoUserDecisionId(contradictionId: string): string {
  return `userDecision.${contradictionId}`;
}

export type ResetClient = Pick<SanityClient, "transaction">;

/** Apply the gate reset for every demo contradiction in one atomic transaction. */
export async function resetDemoGate(client: ResetClient): Promise<void> {
  let tx = client.transaction();
  for (const id of DEMO_CONTRADICTION_IDS) {
    tx = tx
      .delete(demoUserDecisionId(id))
      .patch(id, (p) => p.unset(["committedResolution"]).set({ status: "unresolved" }));
  }
  await tx.commit();
}
