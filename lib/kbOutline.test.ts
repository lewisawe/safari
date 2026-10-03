// lib/kbOutline.test.ts — deterministic outline parsing + entry-path selection.
import { describe, it, expect } from "vitest";
import { KB_DEFAULT_TERMS, parseKbOutline, pickRelevantPaths } from "./kbOutline";

// Synthetic sample outline (format is tolerant; mirrors a plausible
// initial_context listing).
const OUTLINE = [
  "# Safari award-travel KB (synthetic)",
  "Knowledge base id: kbSafari123",
  "",
  "## Entries",
  "- `programs/virgin-atlantic-chart.md` [core] — Virgin Atlantic partner chart: SFO→NRT business 95,000",
  "- `sources/ana-devaluation-notice.md` [core] — ANA devaluation notice: SFO→NRT business 90,000 effective 2026-09-25",
  "- `transfers/transfer-ratios.md` [peripheral] — Transfer partner ratio table (Amex MR, Chase UR)",
  "- `sources/ana-award-chart.md` [core] — ANA printed award chart: SFO→NRT business 85,000",
  "- `programs/aeroplan-chart.md` — Air Canada Aeroplan partner chart",
  "Some unrelated prose line without a path.",
].join("\n");

describe("parseKbOutline", () => {
  it("parses title, kbId, entries, and tags", () => {
    const o = parseKbOutline(OUTLINE);
    expect(o.title).toBe("Safari award-travel KB (synthetic)");
    expect(o.kbId).toBe("kbSafari123");
    expect(o.entries).toHaveLength(5);
    expect(o.entries[1]).toEqual({
      path: "sources/ana-devaluation-notice.md",
      summary: "ANA devaluation notice: SFO→NRT business 90,000 effective 2026-09-25",
      tag: "core",
    });
    expect(o.entries[4].tag).toBeUndefined();
  });

  it("tolerates lines without backticks", () => {
    const o = parseKbOutline("KB\n* notes/ana.md - ANA note\n* plain line");
    expect(o.entries).toEqual([{ path: "notes/ana.md", summary: "ANA note" }]);
  });
});

describe("pickRelevantPaths", () => {
  const { entries } = parseKbOutline(OUTLINE);

  it("ranks the ANA devaluation + chart entries first, deterministically", () => {
    const a = pickRelevantPaths(entries, [...KB_DEFAULT_TERMS, "SFO", "NRT", "ANA"]);
    const b = pickRelevantPaths(entries, [...KB_DEFAULT_TERMS, "SFO", "NRT", "ANA"]);
    expect(a).toEqual(b);
    expect(a.slice(0, 2)).toEqual([
      "sources/ana-devaluation-notice.md",
      "sources/ana-award-chart.md",
    ]);
  });

  it("does not match ANA inside 'Canada'", () => {
    expect(pickRelevantPaths(entries, ["ANA"])).not.toContain("programs/aeroplan-chart.md");
  });

  it("returns [] when nothing matches and respects max", () => {
    expect(pickRelevantPaths(entries, ["zzz"])).toEqual([]);
    expect(pickRelevantPaths(entries, KB_DEFAULT_TERMS, 2)).toHaveLength(2);
  });
});
