/**
 * Persistent synthetic-data label (FR-11). Rendered in the root layout so it
 * appears on every screen. The dataset Safari reasons over is engineered, not
 * real award pricing; this banner states that plainly and permanently.
 *
 * Styled per DESIGN.md "Saturated Banner Strip": a thin full-width Electric
 * Blue (#007ae5) band with centered Parchment Cream text in jobyText 16px,
 * weight 500, tracking -0.01em. No border, no rounded corners — a sharp,
 * on-palette color transition rather than the old brown dark bar.
 */
export function SyntheticBanner() {
  return (
    <div
      role="note"
      aria-label="Synthetic dataset notice"
      className="w-full bg-[var(--color-electric-blue)] px-[var(--spacing-16)] py-[var(--spacing-8)] text-center font-[family-name:var(--font-jobytext)] text-[var(--text-body)] font-medium tracking-[-0.01em] text-[var(--color-parchment-cream)]"
    >
      Synthetic dataset — not real award pricing
    </div>
  );
}
