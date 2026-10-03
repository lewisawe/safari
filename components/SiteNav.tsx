import Link from "next/link";

/**
 * Minimal top navigation per DESIGN.md "Centered Logomark Navigation":
 * a transparent bar — no filled background, no drop shadow, no hairline — with
 * a centered "Safari" wordmark in the display font and a single real text link.
 * The bar dissolves into the canvas rather than announcing itself.
 */
export function SiteNav() {
  return (
    <nav
      aria-label="Primary"
      className="relative flex items-center justify-center px-[var(--spacing-24)] py-[var(--spacing-16)]"
    >
      <Link
        href="/"
        aria-label="Safari home"
        className="font-[family-name:var(--font-jobydisplay)] text-[length:var(--text-subheading)] font-medium tracking-[var(--tracking-subheading)] text-[var(--color-carbon-ink)] no-underline"
      >
        Safari
      </Link>
      <Link
        href="/solver"
        className="absolute right-[var(--spacing-24)] font-[family-name:var(--font-jobytext)] text-[length:var(--text-body)] font-medium tracking-[var(--tracking-body)] text-[var(--color-outlined-action)]"
      >
        Solver ↗
      </Link>
    </nav>
  );
}
