// lib/markdownBlocks.ts
//
// Minimal, SAFE Markdown tokenizer for rendering Knowledge Base entries as
// React text nodes. No HTML is ever produced: raw HTML in the input stays
// literal text, and only http(s) links become link tokens (javascript:,
// data:, etc. render as plain text). Pure; no dependencies.

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "listItem"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "code"; text: string };

export type Inline = { type: "text"; value: string } | { type: "link"; text: string; href: string };

export function markdownToBlocks(md: string): Block[] {
  const lines = (md ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let code: string[] | null = null;

  const flush = () => {
    if (para.length > 0) {
      blocks.push({ type: "paragraph", text: para.join(" ") });
      para = [];
    }
  };

  for (const line of lines) {
    if (code !== null) {
      if (/^\s*```/.test(line)) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      flush();
      code = [];
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flush();
      const level = Math.min(4, h[1].length) as 1 | 2 | 3 | 4;
      blocks.push({ type: "heading", level, text: h[2].trim() });
      continue;
    }
    const li = /^([-*+]|\d+[.)])\s+(.*)$/.exec(trimmed);
    if (li) {
      flush();
      blocks.push({ type: "listItem", text: li[2] });
      continue;
    }
    const bq = /^>\s?(.*)$/.exec(trimmed);
    if (bq) {
      flush();
      blocks.push({ type: "blockquote", text: bq[1] });
      continue;
    }
    para.push(trimmed);
  }
  if (code !== null) blocks.push({ type: "code", text: code.join("\n") });
  flush();
  return blocks;
}

/** Split text into plain text and http(s) link tokens. Strips **bold** / `code` markers. */
export function splitInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (value: string) => {
    const clean = value.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
    if (clean) out.push({ type: "text", value: clean });
  };
  while ((m = re.exec(text)) !== null) {
    push(text.slice(last, m.index));
    const href = m[2];
    if (/^https?:\/\//i.test(href)) {
      out.push({ type: "link", text: m[1], href });
    } else {
      push(m[1]);
    }
    last = m.index + m[0].length;
  }
  push(text.slice(last));
  return out;
}
