/**
 * Persistent synthetic-data label (FR-11). Rendered in the root layout so it
 * appears on every screen. The dataset Safari reasons over is engineered, not
 * real award pricing; this banner states that plainly and permanently.
 */
export function SyntheticBanner() {
  return (
    <div
      role="note"
      aria-label="Synthetic dataset notice"
      style={{
        padding: "0.5rem 1rem",
        background: "#2a1a00",
        color: "#ffd27f",
        fontSize: "0.85rem",
        textAlign: "center",
        borderBottom: "1px solid #5a3a00",
      }}
    >
      Synthetic dataset — not real award pricing
    </div>
  );
}
