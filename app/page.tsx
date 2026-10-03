import Link from "next/link";

/**
 * Cinematic light-theme landing page (FEAT-002).
 *
 * Built per /home/sierra/Desktop/projects/devTo/sanity/DESIGN.md:
 * - "Cinematic Full-Bleed Hero": the headline floats directly over the
 *   background in jobyDisplay weight 500 with tight tracking — NO scrim,
 *   NO plate, NO card. The contrast is designed into the gradient itself.
 * - Gradient-first imagery: the hero is a pure CSS golden-hour gradient
 *   (warm amber highlights -> cool dusk blue-grey) echoing the
 *   Parchment Cream / Carbon Ink duotone. A documented photo slot lets a
 *   real optimized photograph be dropped in later without touching markup.
 * - Outlined/ghost pill CTAs only (DESIGN.md Do/Don't: never a filled
 *   rectangular button). Electric Blue stays isolated punctuation.
 *
 * This page is presentation-only. It does NOT call the real pipeline; the
 * demo preview below is a hand-built static snapshot on the palette.
 */

/*
 * Hero golden-hour treatment.
 *
 * `--hero-photo` is the documented photo slot. It defaults to `none` so the
 * hero ships from CSS alone (no raster shipped). To use a real photograph
 * later, set this variable to a `url(...)` pointing at an optimized image:
 *
 *   DROP AN OPTIMIZED PHOTO HERE — <=2560px wide, <4MB, golden-hour aerial
 *   cockpit-over-a-sleeping-city shot with the warm/cool duotone baked in.
 *   e.g.  "--hero-photo": "url('/hero.jpg')"
 *
 * When a photo is present it layers ABOVE the gradient (which then acts as a
 * fallback), so the composition degrades gracefully if the image is missing.
 * The gradient is deepened toward the lower-centre where the headline sits so
 * Parchment-Cream text keeps >=4.5:1 contrast with NO dark scrim added.
 */
const heroStyle: React.CSSProperties & Record<string, string> = {
  "--hero-photo": "none",
  backgroundImage:
    "var(--hero-photo)," +
    // deepen toward the headline anchor (lower-centre) for text contrast
    "radial-gradient(120% 95% at 50% 118%, rgba(14,22,32,0.92) 0%, rgba(14,22,32,0.62) 34%, rgba(14,22,32,0) 66%)," +
    // golden-hour: warm amber crown -> cool dusk blue-grey base
    "linear-gradient(180deg, #eb6110 0%, #f0914b 20%, #c98a63 42%, #5f6f85 68%, #2b3a52 86%, #0e1620 100%)",
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
};

type Beat = {
  step: string;
  title: string;
  body: string;
};

const BEATS: Beat[] = [
  {
    step: "01",
    title: "Typed graph traversal",
    body: "A GROQ query walks a bounded, typed reference graph in Sanity to enumerate every candidate award routing — no free-text guessing, just the documents and the edges between them.",
  },
  {
    step: "02",
    title: "Contradiction pauses pricing",
    body: "The traversal hits an engineered contradiction — a printed award chart says 85k, a devaluation notice says 90k. Pricing stops. Nothing is priced until the disagreement is resolved against the authoritative source.",
  },
  {
    step: "03",
    title: "Deterministic proof",
    body: "A deterministic TypeScript solver returns the single cheapest valid routing and a minimality proof: every other valid routing, priced higher. The model does no arithmetic.",
  },
];

export default function HomePage() {
  return (
    <main className="font-[family-name:var(--font-jobytext)] text-[var(--color-carbon-ink)]">
      {/* ---------------------------------------------------------------- */}
      {/* Cinematic full-bleed hero — text floats on the gradient, no scrim */}
      {/* ---------------------------------------------------------------- */}
      <section
        style={heroStyle}
        className="relative flex min-h-[72vh] w-full flex-col justify-end px-[var(--spacing-24)] pb-[var(--spacing-56)] pt-[var(--spacing-80)] sm:px-[var(--spacing-40)]"
      >
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[var(--spacing-24)]">
          <h1 className="max-w-[18ch] font-[family-name:var(--font-jobydisplay)] text-[clamp(40px,8vw,80px)] font-medium leading-[1.02] tracking-[var(--tracking-heading-lg)] text-[var(--color-parchment-cream)]">
            Proves the cheapest award‑travel routing. Won&rsquo;t guess when
            sources disagree.
          </h1>
          <p className="max-w-[46ch] font-[family-name:var(--font-jobytext)] text-[var(--text-body-lg)] font-[450] leading-[var(--leading-body-lg)] tracking-[var(--tracking-body-lg)] text-[var(--color-parchment-cream)]">
            An agent that walks a typed Sanity knowledge graph, pauses the
            moment its sources contradict each other, and hands the arithmetic
            to a deterministic solver that shows its proof.
          </p>

          {/* Two outlined/ghost CTAs — never filled rectangles */}
          <div className="flex flex-wrap items-center gap-[var(--spacing-16)]">
            <Link
              href="/solver"
              className="inline-flex items-center rounded-[var(--radius-full)] border border-[var(--color-outlined-action)] bg-transparent px-[var(--spacing-24)] py-[var(--spacing-8)] font-[family-name:var(--font-jobytext)] text-[var(--text-body)] font-medium tracking-[var(--tracking-body)] text-[var(--color-parchment-cream)] no-underline"
            >
              Model‑free solver →
            </Link>
            <Link
              href="/agent"
              className="inline-flex items-center rounded-[var(--radius-full)] border border-[var(--color-outlined-action)] bg-transparent px-[var(--spacing-24)] py-[var(--spacing-8)] font-[family-name:var(--font-jobytext)] text-[var(--text-body)] font-medium tracking-[var(--tracking-body)] text-[var(--color-parchment-cream)] no-underline"
            >
              Agent path →
            </Link>
          </div>

          {/* Synthetic-data framing as a bordered caption (not a second bar) */}
          <p className="mt-[var(--spacing-8)] max-w-[52ch] border-l-[3px] border-[var(--color-parchment-cream)] pl-[var(--spacing-16)] font-[family-name:var(--font-jobytext)] text-[var(--text-body-sm)] font-[450] leading-[var(--leading-body-sm)] tracking-[var(--tracking-body-sm)] text-[var(--color-parchment-cream)]">
            Every routing, chart, and contradiction here is a synthetic dataset
            built to exercise the reasoning — not real award pricing. The
            discipline is the point.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* How it works — three beats on the cream canvas                    */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-[1200px] px-[var(--spacing-24)] py-[var(--spacing-80)] sm:px-[var(--spacing-40)]">
        <h2 className="font-[family-name:var(--font-jobydisplay)] text-[var(--text-heading-sm)] font-medium leading-[var(--leading-heading-sm)] tracking-[var(--tracking-heading-sm)] text-[var(--color-carbon-ink)]">
          How it works
        </h2>

        <div className="mt-[var(--spacing-40)] grid grid-cols-1 gap-[var(--spacing-24)] md:grid-cols-3">
          {BEATS.map((beat) => (
            <article
              key={beat.step}
              className="rounded-[var(--radius-2xl)] bg-[var(--color-parchment-cream)] p-[var(--spacing-40)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]"
            >
              <p className="font-[family-name:var(--font-joby-sans-display)] text-[var(--text-caption)] font-medium tracking-[var(--tracking-caption)] text-[var(--color-outlined-action)]">
                STEP {beat.step}
              </p>
              <h3 className="mt-[var(--spacing-16)] font-[family-name:var(--font-jobydisplay)] text-[var(--text-subheading)] font-medium leading-[var(--leading-subheading)] tracking-[var(--tracking-subheading)] text-[var(--color-carbon-ink)]">
                {beat.title}
              </h3>
              <p className="mt-[var(--spacing-16)] font-[family-name:var(--font-jobytext)] text-[var(--text-body)] font-[450] leading-[var(--leading-body)] tracking-[var(--tracking-body)] text-[var(--color-carbon-ink)]">
                {beat.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Hairline divider */}
      <div className="mx-auto w-full max-w-[1200px] px-[var(--spacing-24)] sm:px-[var(--spacing-40)]">
        <hr className="border-0 border-t border-[color-mix(in_srgb,var(--color-carbon-ink)_15%,transparent)]" />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Demo preview — STATIC styled snapshot of the money-shot           */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-[1200px] px-[var(--spacing-24)] py-[var(--spacing-80)] sm:px-[var(--spacing-40)]">
        <div className="max-w-[52ch]">
          <h2 className="font-[family-name:var(--font-jobydisplay)] text-[var(--text-heading-sm)] font-medium leading-[var(--leading-heading-sm)] tracking-[var(--tracking-heading-sm)] text-[var(--color-carbon-ink)]">
            The moment it refuses to guess
          </h2>
          <p className="mt-[var(--spacing-16)] font-[family-name:var(--font-jobytext)] text-[var(--text-body)] font-[450] leading-[var(--leading-body)] tracking-[var(--tracking-body)] text-[var(--color-carbon-ink)]">
            Two sources disagree on the same award. Below is a static preview of
            what the solver surfaces — the live tools render the real thing.
          </p>
        </div>

        {/* Two contradicting claims, side by side (static mock) */}
        <div className="mt-[var(--spacing-40)] grid grid-cols-1 gap-[var(--spacing-24)] md:grid-cols-2">
          <article className="rounded-[var(--radius-2xl)] bg-[var(--color-parchment-cream)] p-[var(--spacing-40)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]">
            <p className="font-[family-name:var(--font-joby-sans-display)] text-[var(--text-caption)] font-medium tracking-[var(--tracking-caption)] text-[var(--color-outlined-action)]">
              SOURCE A · AWARD CHART
            </p>
            <p className="mt-[var(--spacing-16)] font-[family-name:var(--font-jobydisplay)] text-[var(--text-heading-sm)] font-medium leading-[var(--leading-heading-sm)] tracking-[var(--tracking-heading-sm)] text-[var(--color-carbon-ink)]">
              85,000
            </p>
            <p className="mt-[var(--spacing-8)] font-[family-name:var(--font-jobytext)] text-[var(--text-body-sm)] font-[450] tracking-[var(--tracking-body-sm)] text-[var(--color-carbon-ink)]">
              SFO → NRT business · printed chart
            </p>
          </article>

          <article className="rounded-[var(--radius-2xl)] bg-[var(--color-parchment-cream)] p-[var(--spacing-40)] shadow-[0px_0px_40px_0px_rgba(171,171,156,0.4)]">
            <p className="font-[family-name:var(--font-joby-sans-display)] text-[var(--text-caption)] font-medium tracking-[var(--tracking-caption)] text-[var(--color-outlined-action)]">
              SOURCE B · DEVALUATION NOTICE
            </p>
            <p className="mt-[var(--spacing-16)] font-[family-name:var(--font-jobydisplay)] text-[var(--text-heading-sm)] font-medium leading-[var(--leading-heading-sm)] tracking-[var(--tracking-heading-sm)] text-[var(--color-carbon-ink)]">
              90,000
            </p>
            <p className="mt-[var(--spacing-8)] font-[family-name:var(--font-jobytext)] text-[var(--text-body-sm)] font-[450] tracking-[var(--tracking-body-sm)] text-[var(--color-carbon-ink)]">
              SFO → NRT business · updated notice
            </p>
          </article>
        </div>

        {/* Outcome caption — bordered block, no box, no guessed price */}
        <p className="mt-[var(--spacing-24)] max-w-[52ch] border-l-[3px] border-[var(--color-outlined-action)] pl-[var(--spacing-16)] font-[family-name:var(--font-jobytext)] text-[var(--text-body)] font-[450] leading-[var(--leading-body)] tracking-[var(--tracking-body)] text-[var(--color-carbon-ink)]">
          Pricing pauses here. The agent resolves the conflict against the
          authoritative source before the deterministic solver returns a single
          proven routing — it never averages the two or picks one at random.
        </p>

        {/* Repeat the two ghost CTAs at the foot of the page */}
        <div className="mt-[var(--spacing-40)] flex flex-wrap items-center gap-[var(--spacing-16)]">
          <Link
            href="/solver"
            className="inline-flex items-center rounded-[var(--radius-full)] border border-[var(--color-outlined-action)] bg-transparent px-[var(--spacing-24)] py-[var(--spacing-8)] font-[family-name:var(--font-jobytext)] text-[var(--text-body)] font-medium tracking-[var(--tracking-body)] text-[var(--color-outlined-action)] no-underline"
          >
            Model‑free solver →
          </Link>
          <Link
            href="/agent"
            className="inline-flex items-center rounded-[var(--radius-full)] border border-[var(--color-outlined-action)] bg-transparent px-[var(--spacing-24)] py-[var(--spacing-8)] font-[family-name:var(--font-jobytext)] text-[var(--text-body)] font-medium tracking-[var(--tracking-body)] text-[var(--color-outlined-action)] no-underline"
          >
            Agent path →
          </Link>
        </div>
      </section>
    </main>
  );
}
