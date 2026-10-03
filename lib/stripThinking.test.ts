// lib/stripThinking.test.ts — server-side <thinking> removal (Nova).
import { describe, it, expect } from "vitest";
import { createThinkingStripper, stripThinkingText, stripThinkingTransform } from "./stripThinking";

function feed(chunks: string[]): string {
  const s = createThinkingStripper();
  return chunks.map((c) => s.push(c)).join("") + s.flush();
}

describe("createThinkingStripper", () => {
  it("passes text without tags through unchanged, across chunks", () => {
    expect(feed(["The cheapest ", "routing is ", "below.", " 1 < 2"])).toBe(
      "The cheapest routing is below. 1 < 2",
    );
  });

  it("removes a complete block in one chunk and the whitespace after it", () => {
    expect(feed(["<thinking>plan the tools</thinking>\n\nHere is the answer."])).toBe(
      "Here is the answer.",
    );
  });

  it("removes a block whose open and close tags are split across chunks", () => {
    expect(
      feed(["Intro. <thi", "nking>ANA costs 85,000 per", " the chart</thin", "king> Done."]),
    ).toBe("Intro. Done.");
  });

  it("handles every possible split point of the tags", () => {
    const text = "A<thinking>secret 85000</thinking>B";
    for (let i = 1; i < text.length; i++) {
      for (let j = i + 1; j < text.length; j++) {
        expect(feed([text.slice(0, i), text.slice(i, j), text.slice(j)])).toBe("AB");
      }
    }
  });

  it("drops an unclosed block at the end", () => {
    expect(feed(["Answer first. ", "<thinking>still reasoning about 85,000"])).toBe("Answer first. ");
  });

  it("drops an unclosed block whose close tag is only partially streamed", () => {
    expect(feed(["<thinking>x</thin"])).toBe("");
  });

  it("emits a held-back partial open tag that never completes", () => {
    expect(feed(["a <thin"])).toBe("a <thin");
    expect(feed(["a <thin", "g b"])).toBe("a <thing b");
  });

  it("removes multiple blocks and is case-insensitive", () => {
    expect(stripThinkingText("<THINKING>a</THINKING>one <thinking>b</thinking>two")).toBe("one two");
  });
});

describe("stripThinkingTransform", () => {
  it("rewrites text-delta parts per text id and flushes before text-end", async () => {
    const parts = [
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", text: "<think" },
      { type: "text-delta", id: "t1", text: "ing>plan</think" },
      { type: "text-delta", id: "t1", text: "ing>\nResult: see runSolver. <" },
      { type: "text-end", id: "t1" },
      { type: "finish-step" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ts = stripThinkingTransform<any>()({ tools: {}, stopStream: () => {} });
    const out: { type: string; id?: string; text?: string }[] = [];
    const writer = ts.writable.getWriter();
    const reading = (async () => {
      const reader = ts.readable.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        out.push(value as { type: string; id?: string; text?: string });
      }
    })();
    for (const p of parts) await writer.write(p as never);
    await writer.close();
    await reading;

    const text = out.filter((p) => p.type === "text-delta").map((p) => p.text).join("");
    expect(text).toBe("Result: see runSolver. <");
    expect(out.map((p) => p.type)).toEqual([
      "text-start",
      "text-delta",
      "text-delta",
      "text-end",
      "finish-step",
    ]);
    expect(out.every((p) => !p.text?.includes("thinking"))).toBe(true);
  });
});
