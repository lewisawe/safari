// lib/markdownBlocks.test.ts — the safe Markdown tokenizer.
import { describe, it, expect } from "vitest";
import { markdownToBlocks, splitInline } from "./markdownBlocks";

describe("markdownToBlocks", () => {
  it("tokenizes headings, lists, paragraphs, quotes, and code", () => {
    const blocks = markdownToBlocks("# Title\n\n- one\n- two\n\nPara line\ncontinues\n\n> quote\n\n```\ncode\n```");
    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "Title" },
      { type: "listItem", text: "one" },
      { type: "listItem", text: "two" },
      { type: "paragraph", text: "Para line continues" },
      { type: "blockquote", text: "quote" },
      { type: "code", text: "code" },
    ]);
  });

  it("keeps raw HTML as literal text", () => {
    const [b] = markdownToBlocks("<script>alert(1)</script>");
    expect(b).toEqual({ type: "paragraph", text: "<script>alert(1)</script>" });
    expect(splitInline(b.text)).toEqual([{ type: "text", value: "<script>alert(1)</script>" }]);
  });
});

describe("splitInline", () => {
  it("only http(s) hrefs become links; javascript: becomes text", () => {
    expect(splitInline("see [doc](https://example.invalid/x) and [bad](javascript:alert(1))")).toEqual([
      { type: "text", value: "see " },
      { type: "link", text: "doc", href: "https://example.invalid/x" },
      { type: "text", value: " and " },
      { type: "text", value: "bad" },
      { type: "text", value: ")" },
    ]);
  });
});
