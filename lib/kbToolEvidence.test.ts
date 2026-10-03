// lib/kbToolEvidence.test.ts — readKnowledgeBase tool output -> KbEvidence.
import { describe, it, expect } from "vitest";
import { kbToolOutputToEvidence, cleanKbMessage, kbErrorTitle } from "./kbToolEvidence";

const PRICE_KEYS = ["chosen", "proof", "costInUserCurrency", "effectivePointsCost", "chosenPointsCost", "pointsCost"];

describe("kbToolOutputToEvidence", () => {
  it.each(["not_configured", "unauthorized", "unknown_kb", "transport", "grant_required"])(
    "keeps the typed error kind %s and its message",
    (kind) => {
      const ev = kbToolOutputToEvidence({ error: kind, message: `msg for ${kind}`, presentationOnly: true });
      expect(ev).toEqual({ configured: true, ok: false, error: kind, message: `msg for ${kind}` });
    },
  );

  it("maps an unknown kind to tool_error and a missing message to a fallback", () => {
    expect(kbToolOutputToEvidence({ error: "weird", presentationOnly: true })).toEqual({
      configured: true,
      ok: false,
      error: "tool_error",
      message: "Knowledge Base read failed.",
    });
  });

  it("strips stack lines and bearer tokens from the message", () => {
    const msg = cleanKbMessage(
      "Context MCP rejected the token (Bearer sk.abc123)\n    at foo (/x.js:1:1)\n    at bar (/y.js:2:2)",
    );
    expect(msg).toBe("Context MCP rejected the token (Bearer [redacted])");
    expect(msg).not.toContain("sk.abc123");
    expect(msg).not.toMatch(/\bat foo\b/);
  });

  it("gives each typed kind a human title", () => {
    expect(kbErrorTitle("unauthorized")).toBe("Knowledge Base token rejected");
    expect(kbErrorTitle("unknown_kb")).toBe("Unknown Knowledge Base id");
  });

  it("maps a success output to ok evidence with entries and no price fields", () => {
    const ev = kbToolOutputToEvidence({
      markdown: "# ANA\nSYNTHETIC",
      paths: ["award_pricing/devaluations"],
      via: "context-mcp (knowledge_base)",
      presentationOnly: true,
    });
    expect(ev).toMatchObject({
      configured: true,
      ok: true,
      entries: [{ path: "award_pricing/devaluations", summary: "" }],
      markdown: "# ANA\nSYNTHETIC",
    });
    for (const k of PRICE_KEYS) expect(ev).not.toHaveProperty(k);
  });
});

describe("agentKbToEvidence (traverseRoutings.knowledgeBase)", () => {
  it("maps success to ok evidence with paths and http citations only", async () => {
    const { agentKbToEvidence } = await import("./kbToolEvidence");
    const ev = agentKbToEvidence({
      via: "context-mcp (knowledge_base mode)",
      paths: ["award_pricing/devaluations"],
      markdown: "# Devaluation",
      citations: [
        { text: "ok", url: "https://example.invalid/a" },
        { text: "bad", url: "javascript:alert(1)" },
      ],
      presentationOnly: true,
    });
    expect(ev).toEqual({
      configured: true,
      ok: true,
      via: "context-mcp (knowledge_base)",
      kbId: null,
      outlineTitle: null,
      entries: [{ path: "award_pricing/devaluations", summary: "" }],
      markdown: "# Devaluation",
      citations: [{ text: "ok", url: "https://example.invalid/a" }],
    });
  });

  it("keeps the typed nested error kind and a cleaned message", async () => {
    const { agentKbToEvidence } = await import("./kbToolEvidence");
    expect(
      agentKbToEvidence({ error: { kind: "transport", message: "timed out\n    at x" }, presentationOnly: true }),
    ).toEqual({ configured: true, ok: false, error: "transport", message: "timed out" });
    expect(agentKbToEvidence({ error: { kind: "weird" } })).toMatchObject({ ok: false, error: "tool_error" });
  });
});
