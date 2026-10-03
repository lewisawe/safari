/**
 * KBEvidencePanel — "Knowledge Base (via Context MCP)" Warm Card.
 *
 * PRESENTATION ONLY. Renders KB entries read through Sanity Context MCP
 * (Knowledge Base mode) as cited evidence about the contradicted routing. It
 * never supplies a price and never gates: prices come only from the
 * deterministic solver. Markdown is rendered SAFELY as React text nodes via
 * lib/markdownBlocks (never injects raw HTML; only http(s) links).
 */
import type { KbEvidence } from "@/lib/kbEvidence";
import { markdownToBlocks, splitInline, type Block } from "@/lib/markdownBlocks";

export interface KBEvidencePanelProps {
  evidence?: KbEvidence | null;
  loading?: boolean;
}

const CARD_CLASS =
  "rounded-[var(--radius-2xl)] border border-[color-mix(in_srgb,var(--color-carbon-ink)_12%,transparent)] bg-[var(--color-parchment-cream)] p-[var(--spacing-40)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]";
const KICKER_CLASS =
  "font-[family-name:var(--font-joby-sans-display)] text-[length:var(--text-caption)] font-medium tracking-[var(--tracking-caption)] text-[var(--color-outlined-action)]";
const HEADING_CLASS =
  "mt-[var(--spacing-16)] font-[family-name:var(--font-jobydisplay)] text-[length:var(--text-subheading)] font-medium leading-[var(--leading-subheading)] tracking-[var(--tracking-subheading)] text-[var(--color-carbon-ink)]";
const MUTED_CLASS =
  "text-[length:var(--text-body-sm)] font-[450] tracking-[var(--tracking-body-sm)] text-[color-mix(in_srgb,var(--color-carbon-ink)_65%,transparent)]";
const BODY_CLASS =
  "font-[family-name:var(--font-jobytext)] text-[length:var(--text-body)] font-[450] leading-[var(--leading-body)] tracking-[var(--tracking-body)] text-[var(--color-carbon-ink)]";
const LINK_CLASS =
  "text-[var(--color-outlined-action)] underline underline-offset-2";

function InlineText({ text }: { text: string }) {
  return (
    <>
      {splitInline(text).map((part, i) =>
        part.type === "link" ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "heading":
      return (
        <p className="m-0 mt-[var(--spacing-8)] font-[family-name:var(--font-jobydisplay)] text-[length:var(--text-body-lg)] font-medium text-[var(--color-carbon-ink)]">
          <InlineText text={block.text} />
        </p>
      );
    case "listItem":
      return (
        <p className={`m-0 pl-[var(--spacing-16)] ${BODY_CLASS}`}>
          <span aria-hidden="true">• </span>
          <InlineText text={block.text} />
        </p>
      );
    case "blockquote":
      return (
        <p className={`m-0 border-l-[3px] border-[var(--color-outlined-action)] pl-[var(--spacing-16)] ${BODY_CLASS}`}>
          <InlineText text={block.text} />
        </p>
      );
    case "code":
      return (
        <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-carbon-ink)_12%,transparent)] p-[var(--spacing-16)] text-[length:var(--text-body-sm)] text-[var(--color-carbon-ink)]">
          <code>{block.text}</code>
        </pre>
      );
    default:
      return (
        <p className={`m-0 ${BODY_CLASS}`}>
          <InlineText text={block.text} />
        </p>
      );
  }
}

export function KBEvidencePanel({ evidence, loading }: KBEvidencePanelProps) {
  const header = (
    <>
      <p className={KICKER_CLASS}>KNOWLEDGE BASE · VIA CONTEXT MCP</p>
      <h3 className={HEADING_CLASS}>Knowledge Base (via Context MCP)</h3>
    </>
  );

  if (loading) {
    return (
      <section aria-label="Knowledge Base evidence" className={CARD_CLASS}>
        {header}
        <p className={`mt-[var(--spacing-16)] mb-0 ${MUTED_CLASS}`}>Reading the Knowledge Base…</p>
      </section>
    );
  }

  if (!evidence || !evidence.configured || !evidence.ok) {
    const detail =
      evidence && evidence.configured && !evidence.ok ? evidence.message : null;
    return (
      <section aria-label="Knowledge Base evidence" className={CARD_CLASS}>
        {header}
        <p className={`mt-[var(--spacing-16)] mb-0 ${MUTED_CLASS}`}>
          Knowledge Base not connected yet.
          {detail ? ` ${detail}` : ""}
        </p>
      </section>
    );
  }

  const blocks = markdownToBlocks(evidence.markdown);
  return (
    <section aria-label="Knowledge Base evidence" className={CARD_CLASS}>
      {header}
      <p className={`mt-[var(--spacing-8)] mb-0 ${MUTED_CLASS}`}>
        Evidence only. Not a price; prices come only from the deterministic solver.
      </p>

      {evidence.entries.length > 0 ? (
        <ul className="m-0 mt-[var(--spacing-16)] flex list-none flex-wrap gap-[var(--spacing-8)] p-0">
          {evidence.entries.map((e) => (
            <li key={e.path}>
              <code className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--color-outlined-action)_55%,transparent)] px-[0.45rem] py-[0.1rem] text-[length:var(--text-caption)] font-medium tracking-[var(--tracking-caption)] text-[var(--color-outlined-action)]">
                {e.path}
              </code>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-[var(--spacing-24)] flex flex-col gap-[var(--spacing-8)]">
        {blocks.map((b, i) => (
          <BlockView key={i} block={b} />
        ))}
      </div>

      {evidence.citations.length > 0 ? (
        <div className="mt-[var(--spacing-24)] flex flex-wrap gap-[var(--spacing-8)]">
          {evidence.citations.map((c) => (
            <a
              key={`${c.text}|${c.url}`}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-[var(--radius-full)] border border-[var(--color-outlined-action)] bg-transparent px-[var(--spacing-16)] py-[var(--spacing-8)] text-[length:var(--text-body-sm)] font-medium text-[var(--color-outlined-action)] no-underline"
            >
              {c.text}
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}
