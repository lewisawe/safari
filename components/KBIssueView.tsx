/**
 * KBIssueView — the Knowledge-Base "Issues" presentation (FR-4): the two
 * disagreeing claims shown side-by-side with each claim's source title,
 * authority, and dates. Per design A2 this is driven from the §6 embedded
 * claimA/claimB (which carry dereferenced sources) so it works even if a hosted
 * "Issues" view is unavailable. This view is PRESENTATION-ONLY (§8.1a): it
 * never gates pricing.
 */
import type { ClaimProjection } from "@/lib/fixtures/sfo-nrt-business.rows";

export interface KBIssueViewProps {
  title: string;
  explanation?: string;
  claimA: ClaimProjection;
  claimB: ClaimProjection;
}

function formatDate(iso: string): string {
  // Deterministic ISO date (YYYY-MM-DD) — no locale, so SSR and client agree.
  return iso.slice(0, 10);
}

function ClaimColumn({ label, claim }: { label: string; claim: ClaimProjection }) {
  return (
    <div className="flex min-w-0 flex-[1_1_0] flex-col rounded-[var(--radius-2xl)] border border-[color-mix(in_srgb,var(--color-carbon-ink)_12%,transparent)] bg-[var(--color-parchment-cream)] p-[var(--spacing-32)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]">
      <div className="mb-[var(--spacing-16)] text-[0.72rem] uppercase tracking-[0.05em] text-[color-mix(in_srgb,var(--color-carbon-ink)_60%,transparent)]">
        Claim {label}
      </div>
      {/* The disagreeing number — large, display-scale, tabular, medium weight. */}
      <div className="font-[family-name:var(--font-jobydisplay)] text-[clamp(48px,7vw,80px)] font-medium leading-[1] tracking-[var(--tracking-heading-lg)] text-[var(--color-carbon-ink)] [font-variant-numeric:tabular-nums]">
        {claim.pointsCost.toLocaleString("en-US")}
      </div>
      <div className="mt-[var(--spacing-8)] text-[0.9rem] font-medium tracking-[var(--tracking-body-sm)] text-[color-mix(in_srgb,var(--color-carbon-ink)_75%,transparent)]">
        points
      </div>
      <div className="mt-[var(--spacing-16)] text-[var(--text-body)] text-[var(--color-carbon-ink)]">
        {claim.label}
      </div>
      <dl className="m-0 mt-[var(--spacing-24)] text-[0.82rem] leading-[1.5]">
        <div className="flex gap-2">
          <dt className="min-w-[76px] text-[color-mix(in_srgb,var(--color-carbon-ink)_60%,transparent)]">
            Source
          </dt>
          <dd className="m-0 text-[var(--color-carbon-ink)]">{claim.source.title}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-[76px] text-[color-mix(in_srgb,var(--color-carbon-ink)_60%,transparent)]">
            Authority
          </dt>
          <dd className="m-0 text-[var(--color-carbon-ink)]">
            <code>{claim.source.authority}</code>
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-[76px] text-[color-mix(in_srgb,var(--color-carbon-ink)_60%,transparent)]">
            Effective
          </dt>
          <dd className="m-0 text-[var(--color-carbon-ink)]">
            {formatDate(claim.effectiveDate)}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="min-w-[76px] text-[color-mix(in_srgb,var(--color-carbon-ink)_60%,transparent)]">
            Published
          </dt>
          <dd className="m-0 text-[var(--color-carbon-ink)]">
            {formatDate(claim.source.publishedDate)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function KBIssueView({
  title,
  explanation,
  claimA,
  claimB,
}: KBIssueViewProps) {
  return (
    <section aria-label="Knowledge Base contradiction">
      <h3 className="m-0 mb-[var(--spacing-8)] text-[0.72rem] uppercase tracking-[0.05em] text-[color-mix(in_srgb,var(--color-carbon-ink)_60%,transparent)]">
        Knowledge Base contradiction
      </h3>
      {/* Heaviest result component: display-scale headline carries the disagreement. */}
      <p className="m-0 mb-[var(--spacing-16)] font-[family-name:var(--font-jobydisplay)] text-[var(--text-subheading)] font-medium leading-[var(--leading-subheading)] tracking-[var(--tracking-subheading)] text-[var(--color-carbon-ink)]">
        {title}
      </p>
      {explanation ? (
        <p className="m-0 mb-[var(--spacing-24)] max-w-[640px] text-[0.88rem] leading-[1.55] text-[color-mix(in_srgb,var(--color-carbon-ink)_70%,transparent)]">
          {explanation}
        </p>
      ) : null}
      <div className="flex flex-wrap items-stretch gap-[var(--spacing-16)]">
        <ClaimColumn label="A" claim={claimA} />
        {/* Disagreement affordance: a centered 'vs' between the two claims. */}
        <div
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center self-center font-[family-name:var(--font-jobydisplay)] text-[var(--text-heading-sm)] font-medium leading-[1] tracking-[var(--tracking-heading-sm)] text-[var(--color-electric-blue)]"
        >
          vs
        </div>
        <ClaimColumn label="B" claim={claimB} />
      </div>
    </section>
  );
}
