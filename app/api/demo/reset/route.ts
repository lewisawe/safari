// app/api/demo/reset/route.ts
//
// POST /api/demo/reset — puts the 85k vs 90k contradiction back to unresolved
// so the gate fires again for the next judge. Same two mutations as the seed's
// gate reset (lib/demoReset.ts), on fixed ids only; the request body is
// ignored. Rate-limited per IP (best-effort, in-memory) so it cannot be
// hammered. Typed JSON either way: { ok: true } or { ok: false, error, message }.

import { getWriteClient } from "@/lib/sanityClient";
import { resetDemoGate } from "@/lib/demoReset";
import { clientIp, createRateLimiter } from "@/lib/rateLimit";

const RESET_LIMIT_PER_MINUTE = 3;
const resetLimiter = createRateLimiter({
  limit: RESET_LIMIT_PER_MINUTE,
  windowMs: 60_000,
  maxKeys: 2000,
});

export type DemoResetResponse =
  | { ok: true }
  | { ok: false; error: "rate_limited" | "reset_failed"; message: string };

export async function POST(request: Request): Promise<Response> {
  if (!resetLimiter.check(clientIp(request)).allowed) {
    return Response.json(
      {
        ok: false,
        error: "rate_limited",
        message: `Reset is limited to ${RESET_LIMIT_PER_MINUTE} per minute. Wait a moment and try again.`,
      } satisfies DemoResetResponse,
      { status: 429 },
    );
  }
  try {
    await resetDemoGate(getWriteClient());
    return Response.json({ ok: true } satisfies DemoResetResponse);
  } catch (err) {
    console.error(
      "[demo/reset] failed:",
      err instanceof Error ? err.message : String(err),
    );
    return Response.json(
      {
        ok: false,
        error: "reset_failed",
        message: "Could not reset the demo right now. Try again in a moment.",
      } satisfies DemoResetResponse,
      { status: 503 },
    );
  }
}
