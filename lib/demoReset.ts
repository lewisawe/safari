// lib/demoReset.ts
//
// "Reset demo": the gate-reset half of scripts/seed.ts and nothing else. The
// seed restores the always-fires gate by deleting the derived userDecision and
// writing the contradiction with no committedResolution (status "unresolved").
// On the live dataset that is two mutations on two FIXED ids:
//
//   1. delete userDecision.contra.ana.sfonrt.business
//   2. patch  contra.ana.sfonrt.business: unset committedResolution,
//             status back to "unresolved" (the seeded value)
//
// No other document is touched and no caller input reaches the ids.

import type { SanityClient } from "@sanity/client";

export const DEMO_CONTRADICTION_ID = "contra.ana.sfonrt.business";
// Mirrors lib/resolution.ts userDecisionId and the seed's USER_DECISION_ID.
export const DEMO_USER_DECISION_ID = `userDecision.${DEMO_CONTRADICTION_ID}`;

export type ResetClient = Pick<SanityClient, "transaction">;

/** Apply the gate reset in one atomic transaction. */
export async function resetDemoGate(client: ResetClient): Promise<void> {
  await client
    .transaction()
    .delete(DEMO_USER_DECISION_ID)
    .patch(DEMO_CONTRADICTION_ID, (p) =>
      p.unset(["committedResolution"]).set({ status: "unresolved" }),
    )
    .commit();
}
