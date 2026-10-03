// lib/stripThinking.ts
//
// Server-side removal of `<thinking>…</thinking>` blocks from streamed model
// text. Amazon Nova writes its chain of thought inline in the text stream and
// ignores the prompt rule against it, so /api/chat strips it before the UI
// message stream is written (streamText `experimental_transform`).
//
// The stripper is incremental: tags may be split across chunks ("<thin" +
// "king>"), so a trailing partial tag is held back until the next chunk
// decides it. An unclosed block at the end of a text part is dropped.
// Whitespace right after a removed block is dropped too, so the answer does
// not start with blank lines. Tag match is case-insensitive.

import type { StreamTextTransform, ToolSet } from "ai";

const OPEN = "<thinking>";
const CLOSE = "</thinking>";

/** Length of the longest suffix of `s` that is a proper prefix of `tag`. */
function partialTagSuffix(s: string, tag: string): number {
  const lower = s.toLowerCase();
  for (let n = Math.min(tag.length - 1, lower.length); n > 0; n--) {
    if (tag.startsWith(lower.slice(lower.length - n))) return n;
  }
  return 0;
}

export interface ThinkingStripper {
  /** Feed a chunk; returns the text that is safe to emit now. */
  push(chunk: string): string;
  /** End of the text part: returns any held-back text (never thinking). */
  flush(): string;
}

export function createThinkingStripper(): ThinkingStripper {
  let inside = false;
  let buf = "";
  let trimLeading = false;

  function emit(s: string): string {
    if (!trimLeading) return s;
    const t = s.replace(/^\s+/, "");
    if (t.length > 0) trimLeading = false;
    return t;
  }

  return {
    push(chunk: string): string {
      buf += chunk;
      let out = "";
      for (;;) {
        const lower = buf.toLowerCase();
        if (!inside) {
          const i = lower.indexOf(OPEN);
          if (i >= 0) {
            out += emit(buf.slice(0, i));
            buf = buf.slice(i + OPEN.length);
            inside = true;
            continue;
          }
          const hold = partialTagSuffix(buf, OPEN);
          out += emit(buf.slice(0, buf.length - hold));
          buf = buf.slice(buf.length - hold);
          return out;
        }
        const j = lower.indexOf(CLOSE);
        if (j >= 0) {
          buf = buf.slice(j + CLOSE.length);
          inside = false;
          trimLeading = true;
          continue;
        }
        // Discard thinking text, keep only a possible partial close tag.
        buf = buf.slice(buf.length - partialTagSuffix(buf, CLOSE));
        return out;
      }
    },
    flush(): string {
      const rest = inside ? "" : emit(buf);
      buf = "";
      inside = false;
      return rest;
    },
  };
}

/** Strip thinking blocks from a complete string (same rules as the stream). */
export function stripThinkingText(text: string): string {
  const s = createThinkingStripper();
  return s.push(text) + s.flush();
}

/**
 * streamText transform: rewrites `text-delta` parts per text id and flushes
 * held-back text before the matching `text-end`. Empty deltas are dropped.
 */
export function stripThinkingTransform<TOOLS extends ToolSet>(): StreamTextTransform<TOOLS> {
  return () => {
    const strippers = new Map<string, ThinkingStripper>();
    return new TransformStream({
      transform(part, controller) {
        if (part.type === "text-delta") {
          let s = strippers.get(part.id);
          if (!s) {
            s = createThinkingStripper();
            strippers.set(part.id, s);
          }
          const text = s.push(part.text);
          if (text) controller.enqueue({ ...part, text });
          return;
        }
        if (part.type === "text-end") {
          const s = strippers.get(part.id);
          if (s) {
            const rest = s.flush();
            strippers.delete(part.id);
            if (rest) controller.enqueue({ type: "text-delta", id: part.id, text: rest });
          }
        }
        controller.enqueue(part);
      },
      flush(controller) {
        for (const [id, s] of strippers) {
          const rest = s.flush();
          if (rest) controller.enqueue({ type: "text-delta", id, text: rest });
        }
        strippers.clear();
      },
    });
  };
}
