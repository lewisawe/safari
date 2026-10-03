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
    <div
      style={{
        flex: "1 1 0",
        minWidth: 0,
        border: "1px solid #2a2a30",
        borderRadius: 8,
        padding: "1rem",
        background: "#141416",
      }}
    >
      <div
        style={{
          fontSize: "0.72rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#8a8a90",
          marginBottom: "0.4rem",
        }}
      >
        Claim {label}
      </div>
      <div
        style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e8e8ea" }}
      >
        {claim.pointsCost.toLocaleString("en-US")}
        <span style={{ fontSize: "0.9rem", color: "#9a9aa2" }}> points</span>
      </div>
      <div style={{ marginTop: "0.3rem", color: "#c7c7cd", fontSize: "0.9rem" }}>
        {claim.label}
      </div>
      <dl style={{ margin: "0.75rem 0 0", fontSize: "0.82rem", lineHeight: 1.5 }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <dt style={{ color: "#8a8a90", minWidth: 76 }}>Source</dt>
          <dd style={{ margin: 0, color: "#d7d7dc" }}>{claim.source.title}</dd>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <dt style={{ color: "#8a8a90", minWidth: 76 }}>Authority</dt>
          <dd style={{ margin: 0, color: "#d7d7dc" }}>
            <code>{claim.source.authority}</code>
          </dd>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <dt style={{ color: "#8a8a90", minWidth: 76 }}>Effective</dt>
          <dd style={{ margin: 0, color: "#d7d7dc" }}>
            {formatDate(claim.effectiveDate)}
          </dd>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <dt style={{ color: "#8a8a90", minWidth: 76 }}>Published</dt>
          <dd style={{ margin: 0, color: "#d7d7dc" }}>
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
      <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.25rem", color: "#cfcfd4" }}>
        Knowledge Base contradiction
      </h3>
      <p style={{ margin: "0 0 0.75rem", color: "#e8e8ea", fontWeight: 600 }}>
        {title}
      </p>
      {explanation ? (
        <p
          style={{
            margin: "0 0 1rem",
            color: "#9a9aa2",
            fontSize: "0.88rem",
            lineHeight: 1.55,
          }}
        >
          {explanation}
        </p>
      ) : null}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          alignItems: "stretch",
        }}
      >
        <ClaimColumn label="A" claim={claimA} />
        <ClaimColumn label="B" claim={claimB} />
      </div>
    </section>
  );
}
