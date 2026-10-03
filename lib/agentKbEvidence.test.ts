// lib/agentKbEvidence.test.ts — server-side KB evidence for traverseRoutings.
import { describe, it, expect, vi, beforeEach } from "vitest";

const getKbOutlineCached = vi.fn();
vi.mock("./kbOutlineCache", () => ({
  getKbOutlineCached: (...a: unknown[]) => getKbOutlineCached(...a),
}));
const contextKbRead = vi.fn();
const contextKbSearch = vi.fn();
vi.mock("./context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./context")>();
  return {
    ...actual,
    contextKbRead: (...a: unknown[]) => contextKbRead(...a),
    contextKbSearch: (...a: unknown[]) => contextKbSearch(...a),
  };
});

import { ContextError, type ContextConfig } from "./context";
import { AGENT_KB_VIA, contradictedProgramCodes, readAgentKbEvidence } from "./agentKbEvidence";
import { SFO_NRT_BUSINESS_ROWS } from "./fixtures/sfo-nrt-business.rows";

const CFG = { url: "https://api.sanity.io/context/mcp/ep1", token: "tok", kbId: "kbSafari" } as ContextConfig;
const OUTLINE = [
  "# Safari KB",
  "- `award_pricing/devaluations` — ANA devaluation notices",
  "- `transfers/ratios.md` — transfer ratio table",
].join("\n");
const REQ = { origin: "SFO", destination: "NRT", programCodes: ["ANA"] };

beforeEach(() => {
  getKbOutlineCached.mockReset();
  contextKbRead.mockReset();
  contextKbSearch.mockReset();
  // Default: search unavailable -> the outline fallback (cached outline).
  contextKbSearch.mockRejectedValue(new ContextError("tool_error", "knowledge_base_search is not available"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("contradictedProgramCodes", () => {
  it("returns only programs whose chart entry carries a contradiction", () => {
    expect(contradictedProgramCodes(SFO_NRT_BUSINESS_ROWS)).toEqual(["ANA"]);
  });
  it("is empty when nothing is contradicted", () => {
    const rows = SFO_NRT_BUSINESS_ROWS.map((r) => ({
      ...r,
      chartEntries: r.chartEntries.map((e) => ({ ...e, contradictions: [] })),
    }));
    expect(contradictedProgramCodes(rows)).toEqual([]);
  });
});

describe("readAgentKbEvidence", () => {
  it("reads the deterministically selected path and returns evidence", async () => {
    getKbOutlineCached.mockResolvedValue({ text: OUTLINE, kbId: "kbSafari" });
    contextKbRead.mockResolvedValue({ markdown: "# Devaluation\n[ANA](https://example.invalid/a)" });
    const ev = await readAgentKbEvidence(CFG, REQ);
    expect(contextKbRead).toHaveBeenCalledWith(["award_pricing/devaluations"], expect.objectContaining({ cfg: CFG }));
    expect(ev).toEqual({
      via: AGENT_KB_VIA,
      paths: ["award_pricing/devaluations"],
      markdown: "# Devaluation\n[ANA](https://example.invalid/a)",
      citations: [{ text: "ANA", url: "https://example.invalid/a" }],
      presentationOnly: true,
    });
  });

  it("prefers knowledge_base_search: route entry + contradiction context, outline untouched", async () => {
    contextKbSearch.mockResolvedValue({
      text: "",
      results: [
        { path: "award_prices/transpacific_sfonrt", title: "SFO–NRT Award Prices", summary: "SFO to NRT: ANA", score: 15.5 },
        { path: "devaluation_notices", title: "Devaluation & Repricing Notices", summary: "changes", score: 3.98 },
        { path: "transfer_partners", title: "Transfer Partners", summary: "ratios", score: 0.88 },
      ],
    });
    contextKbRead.mockResolvedValue({ markdown: "# SFO" });
    const ev = await readAgentKbEvidence(CFG, REQ);
    expect(ev).toMatchObject({ paths: ["award_prices/transpacific_sfonrt", "devaluation_notices"] });
    expect(contextKbSearch).toHaveBeenCalledWith("SFO NRT ANA", expect.objectContaining({ cfg: CFG }));
    expect(getKbOutlineCached).not.toHaveBeenCalled();
  });

  it("maps a Context error to a typed error, never throws", async () => {
    getKbOutlineCached.mockRejectedValue(new ContextError("unauthorized", "401"));
    const ev = await readAgentKbEvidence(CFG, REQ);
    expect(ev).toMatchObject({ error: { kind: "unauthorized" }, presentationOnly: true });
    expect(contextKbRead).not.toHaveBeenCalled();
  });

  it("no matching entry -> typed tool_error", async () => {
    getKbOutlineCached.mockResolvedValue({ text: "# KB\n- `misc/other.md` — unrelated", kbId: null });
    const ev = await readAgentKbEvidence(CFG, { origin: "XXX", destination: "YYY", programCodes: [] });
    expect(ev).toMatchObject({ error: { kind: "tool_error" } });
  });

  it("times out to a typed transport error", async () => {
    getKbOutlineCached.mockResolvedValue({ text: OUTLINE, kbId: null });
    contextKbRead.mockReturnValue(new Promise(() => {}));
    const ev = await readAgentKbEvidence(CFG, REQ, { timeoutMs: 20 });
    expect(ev).toMatchObject({ error: { kind: "transport" } });
    if ("error" in ev) expect(ev.error.message).toMatch(/timed out/);
  });
});
