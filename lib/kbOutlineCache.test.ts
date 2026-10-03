// lib/kbOutlineCache.test.ts — TTL + single-flight cache for the KB outline
// (mocked contextKbOutline; no network).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const contextKbOutline = vi.fn();
vi.mock("./context", () => ({
  contextKbOutline: (...a: unknown[]) => contextKbOutline(...a),
}));

import { getKbOutlineCached, resetKbOutlineCache, KB_OUTLINE_TTL_MS } from "./kbOutlineCache";
import type { ContextConfig } from "./context";

const CFG: ContextConfig = { url: "https://api.sanity.io/context/mcp/ep1", token: "tok", kbId: "kbSafari" };
const OUTLINE = { text: "# Safari KB\n- `a.md` — entry", kbId: "kbSafari" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  contextKbOutline.mockReset();
  resetKbOutlineCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getKbOutlineCached", () => {
  it("a second call within the TTL does not refetch", async () => {
    contextKbOutline.mockResolvedValue(OUTLINE);
    await expect(getKbOutlineCached(CFG)).resolves.toEqual(OUTLINE);
    vi.advanceTimersByTime(KB_OUTLINE_TTL_MS - 1000);
    await expect(getKbOutlineCached(CFG)).resolves.toEqual(OUTLINE);
    expect(contextKbOutline).toHaveBeenCalledTimes(1);
    expect(contextKbOutline).toHaveBeenCalledWith(expect.objectContaining({ cfg: CFG }));
  });

  it("refetches after the TTL expires", async () => {
    contextKbOutline.mockResolvedValue(OUTLINE);
    await getKbOutlineCached(CFG);
    vi.advanceTimersByTime(KB_OUTLINE_TTL_MS + 1);
    await getKbOutlineCached(CFG);
    expect(contextKbOutline).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failure; the next call retries", async () => {
    contextKbOutline.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(OUTLINE);
    await expect(getKbOutlineCached(CFG)).rejects.toThrow("boom");
    await expect(getKbOutlineCached(CFG)).resolves.toEqual(OUTLINE);
    expect(contextKbOutline).toHaveBeenCalledTimes(2);
  });

  it("concurrent first callers share one in-flight fetch", async () => {
    let release!: (v: typeof OUTLINE) => void;
    contextKbOutline.mockImplementation(
      () => new Promise<typeof OUTLINE>((r) => { release = r; }),
    );
    const a = getKbOutlineCached(CFG);
    const b = getKbOutlineCached(CFG);
    const c = getKbOutlineCached(CFG);
    release(OUTLINE);
    await expect(Promise.all([a, b, c])).resolves.toEqual([OUTLINE, OUTLINE, OUTLINE]);
    expect(contextKbOutline).toHaveBeenCalledTimes(1);
  });

  it("keys by KB id + endpoint URL", async () => {
    contextKbOutline.mockResolvedValue(OUTLINE);
    await getKbOutlineCached(CFG);
    await getKbOutlineCached({ ...CFG, kbId: "kbOther" });
    await getKbOutlineCached({ ...CFG, url: "https://api.sanity.io/context/mcp/ep2" });
    expect(contextKbOutline).toHaveBeenCalledTimes(3);
  });
});
