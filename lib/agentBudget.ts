// lib/agentBudget.ts
//
// Global daily cap on agent runs, shared across serverless instances. Every
// /agent question bills AWS Bedrock, so the counter lives somewhere every
// instance sees: a Sanity Content Lake document per UTC day,
//
//   _id: "demoUsage.agent.<YYYY-MM-DD>", _type: "demoUsage", count: <n>
//
// consumeAgentRun() increments it atomically (createIfNotExists + setIfMissing
// + inc in ONE transaction), then reads the committed count back. Concurrent
// runs can each read a count that already includes the other's increment, so a
// race over-counts slightly (a run may be refused one early) but never
// under-counts. Rejected runs still leave their increment in place for the same
// reason.
//
// FAIL CLOSED: if the counter cannot be written or read (Sanity down, missing
// write token, odd document), the run is refused. An outage must never turn
// into unlimited model spend.

import type { SanityClient } from "@sanity/client";

export const DEMO_USAGE_TYPE = "demoUsage";
export const DEFAULT_AGENT_DAILY_CAP = 50;

/** UTC calendar day, YYYY-MM-DD. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Fixed counter doc id for the UTC day of `now`. */
export function agentUsageDocId(now: Date = new Date()): string {
  return `demoUsage.agent.${utcDay(now)}`;
}

export type BudgetDecision =
  | { ok: true; count: number }
  | { ok: false; reason: "daily_cap"; count: number }
  | { ok: false; reason: "counter_unavailable" };

/** The slice of the Sanity client the counter uses (eases mocking). */
export type UsageClient = Pick<SanityClient, "transaction" | "getDocument">;

function readCount(doc: unknown): number | null {
  if (!doc || typeof doc !== "object") return null;
  const c = (doc as { count?: unknown }).count;
  return typeof c === "number" && Number.isFinite(c) ? c : null;
}

/**
 * Count one agent run against today's cap. Allowed while the committed count
 * (including this run) is <= cap. A cap of 0 refuses without writing.
 * `getClient` is called inside the try so a missing-token error fails closed.
 */
export async function consumeAgentRun(
  getClient: () => UsageClient,
  cap: number,
  now: Date = new Date(),
): Promise<BudgetDecision> {
  if (cap <= 0) return { ok: false, reason: "daily_cap", count: 0 };
  const id = agentUsageDocId(now);
  try {
    const client = getClient();
    await client
      .transaction()
      .createIfNotExists({ _id: id, _type: DEMO_USAGE_TYPE, day: utcDay(now), count: 0 })
      .patch(id, (p) => p.setIfMissing({ count: 0 }).inc({ count: 1 }))
      .commit();
    const count = readCount(await client.getDocument(id));
    if (count === null) return { ok: false, reason: "counter_unavailable" };
    return count > cap ? { ok: false, reason: "daily_cap", count } : { ok: true, count };
  } catch (err) {
    console.error(
      "[agentBudget] usage counter unavailable, failing closed:",
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, reason: "counter_unavailable" };
  }
}

/**
 * Read-only check used by the /agent page's up-front probe: is today's budget
 * already spent? Does not count a run. Fails closed like consumeAgentRun.
 */
export async function peekAgentBudget(
  getClient: () => UsageClient,
  cap: number,
  now: Date = new Date(),
): Promise<BudgetDecision> {
  if (cap <= 0) return { ok: false, reason: "daily_cap", count: 0 };
  try {
    const doc = await getClient().getDocument(agentUsageDocId(now));
    if (doc === undefined || doc === null) return { ok: true, count: 0 };
    const count = readCount(doc);
    if (count === null) return { ok: false, reason: "counter_unavailable" };
    return count >= cap ? { ok: false, reason: "daily_cap", count } : { ok: true, count };
  } catch (err) {
    console.error(
      "[agentBudget] usage counter unreadable, failing closed:",
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, reason: "counter_unavailable" };
  }
}
