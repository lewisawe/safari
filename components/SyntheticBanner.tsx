/**
 * Persistent synthetic-data label (FR-11). Rendered in the root layout so it
 * appears on every screen. The dataset Safari reasons over is engineered, not
 * real award pricing; this banner states that plainly and permanently.
 *
 * Styled per DESIGN.md "Saturated Banner Strip": a thin full-width saturated
 * blue band with centered Parchment Cream text in jobyText 16px, weight 500,
 * tracking -0.01em. No border, no rounded corners — a sharp, on-palette color
 * transition rather than the old brown dark bar.
 *
 * A11y (FEAT-005): the band uses Deep Cobalt (#1c3f99) rather than Electric
 * Blue (#007ae5) so the Parchment Cream text clears 4.5:1 (8.51:1 vs 3.84:1).
 * Deep Cobalt is the DESIGN.md "darker register of the blue for layering"
 * token — still one saturated blue band, no scrim, no new color introduced.
 */
export function SyntheticBanner() {
  return (
    <div
      role="note"
      aria-label="Synthetic dataset notice"
      className="w-full bg-[var(--color-deep-cobalt)] px-[var(--spacing-16)] py-[var(--spacing-8)] text-center font-[family-name:var(--font-jobytext)] text-[length:var(--text-body)] font-medium tracking-[-0.01em] text-[var(--color-parchment-cream)]"
    >
      Synthetic dataset — not real award pricing
    </div>
  );
}
