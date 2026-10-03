// app/api/routes.failclosed.test.ts
//
// Route-level fail-closed tests for the FEAT-004 error contract (design §7.3,
// §7.4): the solve and resolve routes must convert a caught SolverInvariantError
// into NOT_COMPUTED and NEVER return a numeric price in that path. These run
// fully offline — the solve route is exercised with a payload that makes
// toCandidates/solve throw; the resolve route mocks the Sanity client so a
// contradiction with an unknown authority drives resolve() to throw, and the
// write client is a spy that FAILS the test if it is ever called (proving no
// write / no leaked price on the invariant path).

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock the Sanity client module so the resolve route needs no live Sanity.
// getReadClient().fetch(...) returns our scripted read; getWriteClient() is a
// spy whose use would mean a write happened on the fail-closed path (a bug).
const mockFetch = vi.fn();
const mockWriteTransaction = vi.fn();

vi.mock("@/lib/sanityClient", () => ({
  getReadClient: () => ({ fetch: mockFetch }),
  getWriteClient: () => ({ transaction: mockWriteTransaction }),
}));

import { POST as solvePOST } from "./solve/route";
import { POST as resolvePOST } from "./resolve/route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Assert deeply that no numeric points/price value leaked into a payload. */
function assertNoPrice(payload: Record<string, unknown>): void {
  const priceKeys = [
    "chosen",
    "proof",
    "costInUserCurrency",
    "effectivePointsCost",
    "chosenPointsCost",
  ];
  for (const k of priceKeys) {
    expect(payload[k]).toBeUndefined();
  }
}

describe("solve route — fail-closed degradation (§7.3)", () => {
  it("degrades a bad-ratio rows payload to NOT_COMPUTED with no price", async () => {
    // One raw §6 row with a non-positive ratio -> toCandidates throws
    // SolverInvariantError -> route must return NOT_COMPUTED, never a price.
    const rows = [
      {
        transferPartnerId: "tp.bad",
        ratio: 0,
        transferTimeHours: 0,
        fromCurrency: { _id: "cur.x", code: "CUR_X", name: "X" },
        toProgram: { _id: "prog.x", code: "PX", name: "PX" },
        sourceRef: { _id: "src.t", title: "T", authority: "transfer-partner" },
        chartEntries: [
          {
            _id: "ace.x",
            pointsCost: 85000,
            taxesUsd: 100,
            effectiveDate: "2025-01-15T00:00:00.000Z",
            program: { _id: "prog.x", code: "PX", name: "PX" },
            source: {
              _id: "src.a",
              title: "A",
              authority: "official-program",
              publishedDate: "2025-01-15T00:00:00.000Z",
            },
            contradictions: [],
          },
        ],
      },
    ];

    const res = await solvePOST(
      jsonRequest({ origin: "SFO", destination: "NRT", cabin: "business", rows }),
    );
    const payload = (await res.json()) as Record<string, unknown>;

    expect(payload.kind).toBe("NOT_COMPUTED");
    expect(payload.reason).toBe("UNRESOLVED_CONTRADICTION");
    expect(typeof payload.message).toBe("string");
    assertNoPrice(payload);
  });

  it("degrades a resolved-without-number candidate to NOT_COMPUTED with no price", async () => {
    // A candidate flagged resolved but missing resolvedPointsCost -> solve()
    // throws its defensive guard -> route must degrade, never leak nominal.
    const candidates = [
      {
        id: "AMEX_MR->ANA",
        currencyCode: "AMEX_MR",
        programCode: "ANA",
        chartEntryId: "ace.ana",
        ratio: 1.0,
        nominalPointsCost: 85000,
        taxesUsd: 180,
        contradiction: { id: "contra.ana", status: "resolved" }, // no number!
      },
    ];

    const res = await solvePOST(
      jsonRequest({
        origin: "SFO",
        destination: "NRT",
        cabin: "business",
        candidates,
      }),
    );
    const payload = (await res.json()) as Record<string, unknown>;

    expect(payload.kind).toBe("NOT_COMPUTED");
    expect(payload.reason).toBe("UNRESOLVED_CONTRADICTION");
    assertNoPrice(payload);
  });

  it("returns the normal UNRESOLVED_CONTRADICTION gate value (no price) for an unresolved candidate", async () => {
    const candidates = [
      {
        id: "AMEX_MR->ANA",
        currencyCode: "AMEX_MR",
        programCode: "ANA",
        chartEntryId: "ace.ana",
        ratio: 1.0,
        nominalPointsCost: 85000,
        taxesUsd: 180,
        contradiction: { id: "contra.ana", status: "unresolved" },
      },
    ];
    const res = await solvePOST(
      jsonRequest({
        origin: "SFO",
        destination: "NRT",
        cabin: "business",
        candidates,
      }),
    );
    const payload = (await res.json()) as Record<string, unknown>;
    expect(payload.kind).toBe("NOT_COMPUTED");
    expect(payload.reason).toBe("UNRESOLVED_CONTRADICTION");
    expect(payload.blockingContradictionIds).toEqual(["contra.ana"]);
    assertNoPrice(payload);
  });
});

describe("resolve route — fail-closed degradation on unknown authority (§7.4)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockWriteTransaction.mockReset();
    // If the write client is ever touched on the invariant path, make it loud.
    mockWriteTransaction.mockImplementation(() => {
      throw new Error("write client must NOT be used on the fail-closed path");
    });
  });

  it("degrades an unknown source.authority to NOT_COMPUTED, writes nothing, leaks no price", async () => {
    // Read returns a contradiction whose claimB carries an authority not in
    // AUTHORITY_RANK -> resolve() throws SolverInvariantError via authorityRank.
    mockFetch.mockResolvedValue({
      contradiction: {
        _id: "contra.bad",
        claimA: {
          pointsCost: 85000,
          effectiveDate: "2025-01-15T00:00:00.000Z",
          label: "chart",
          source: {
            _id: "src.a",
            title: "A",
            authority: "official-program",
            publishedDate: "2025-01-15T00:00:00.000Z",
          },
        },
        claimB: {
          pointsCost: 90000,
          effectiveDate: "2026-09-25T00:00:00.000Z",
          label: "deval",
          source: {
            _id: "src.b",
            title: "B",
            authority: "totally-made-up-authority", // unknown => throws
            publishedDate: "2026-09-25T00:00:00.000Z",
          },
        },
      },
      prior: null,
    });

    const res = await resolvePOST(jsonRequest({ contradictionId: "contra.bad" }));
    const payload = (await res.json()) as Record<string, unknown>;

    expect(payload.kind).toBe("NOT_COMPUTED");
    expect(payload.reason).toBe("UNRESOLVED_CONTRADICTION");
    expect(payload.blockingContradictionIds).toEqual(["contra.bad"]);
    // Message names the bad authority.
    expect(String(payload.message)).toContain("totally-made-up-authority");
    assertNoPrice(payload);
    // Proven no write happened: the write transaction spy was never invoked
    // (if it had been, its throw-on-use would have surfaced a 500, not this).
    expect(mockWriteTransaction).not.toHaveBeenCalled();
  });
});
