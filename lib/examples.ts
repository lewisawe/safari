// lib/examples.ts
//
// Example trips for the /solver chips and the /agent prompt chips. Each one
// exercises a different beat of the SYNTHETIC dataset (scripts/seed.ts).
// Presentation only: a chip fills the form or textarea and never submits.

import type { Cabin } from "../solver/types";

export interface ExampleTrip {
  /** Chip label. */
  label: string;
  /** What the example demonstrates (chip title / tooltip). */
  hint: string;
  origin: string;
  destination: string;
  cabin: Cabin;
  /** pointsCurrency _ids the user holds. */
  currencyIds: string[];
  /** Natural-language version for the agent textarea. */
  prompt: string;
}

export const EXAMPLE_TRIPS: ExampleTrip[] = [
  {
    label: "SFO→NRT business · Amex + Chase",
    hint: "The gate demo: a devaluation notice overrides the printed chart",
    origin: "SFO",
    destination: "NRT",
    cabin: "business",
    currencyIds: ["cur.amex", "cur.chase"],
    prompt:
      "SFO to NRT in business. I hold Amex MR (cur.amex) and Chase UR (cur.chase). Find the cheapest valid routing and prove it.",
  },
  {
    label: "JFK→LHR business · Capital One",
    hint: "Fewer program points can lose once the transfer ratio is applied",
    origin: "JFK",
    destination: "LHR",
    cabin: "business",
    currencyIds: ["cur.capone"],
    prompt:
      "I hold Capital One miles (cur.capone). Cheapest business-class award from JFK to LHR? Show your work.",
  },
  {
    label: "JFK→LHR economy · Amex",
    hint: "A newer points-blog report vs the official chart",
    origin: "JFK",
    destination: "LHR",
    cabin: "economy",
    currencyIds: ["cur.amex"],
    prompt:
      "I hold Amex MR (cur.amex). Cheapest economy award from JFK to LHR? A blog says it's on sale, so check the sources.",
  },
  {
    label: "LAX→SYD business · Chase + Capital One",
    hint: "Two currencies, two ratios",
    origin: "LAX",
    destination: "SYD",
    cabin: "business",
    currencyIds: ["cur.chase", "cur.capone"],
    prompt:
      "LAX to SYD in business. I hold Chase UR (cur.chase) and Capital One miles (cur.capone). Find the cheapest valid routing and prove it.",
  },
  {
    label: "SFO→NRT first · Chase",
    hint: "No valid routing: the answer is no answer",
    origin: "SFO",
    destination: "NRT",
    cabin: "first",
    currencyIds: ["cur.chase"],
    prompt:
      "SFO to NRT in first class. I only hold Chase UR (cur.chase). What's the cheapest award?",
  },
];

/** Outlined pill (DESIGN.md ghost action), compact for a chip row. */
export const EXAMPLE_CHIP_CLASS =
  "inline-flex items-center rounded-[var(--radius-full)] border border-[var(--color-outlined-action)] bg-transparent px-[var(--spacing-16)] py-[6px] font-[family-name:var(--font-jobytext)] text-[length:var(--text-body-sm)] font-medium tracking-[var(--tracking-body-sm)] text-[var(--color-outlined-action)] transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-outlined-action)] disabled:cursor-default disabled:opacity-55";
