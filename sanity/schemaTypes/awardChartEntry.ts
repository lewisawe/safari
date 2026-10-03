// sanity/schemaTypes/awardChartEntry.ts
//
// A priced award for an origin/destination/cabin on a program's chart —
// design §4.5. `pointsCost` is the NOMINAL chart number; for an entry under a
// contradiction the resolved claim's number supersedes it (§4.6), and the
// solver prices from the resolved claim, never from this entry's effectiveDate.

import { defineType, defineField } from "sanity";

export const awardChartEntry = defineType({
  name: "awardChartEntry",
  title: "Award Chart Entry",
  type: "document",
  fields: [
    defineField({
      name: "program",
      title: "Program",
      type: "reference",
      to: [{ type: "program" }],
      description: "Which program's chart.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "origin",
      title: "Origin",
      type: "string",
      description: "IATA, e.g. SFO.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "destination",
      title: "Destination",
      type: "string",
      description: "IATA, e.g. NRT.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "cabin",
      title: "Cabin",
      type: "string",
      options: {
        list: [
          { title: "Economy", value: "economy" },
          { title: "Premium", value: "premium" },
          { title: "Business", value: "business" },
          { title: "First", value: "first" },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "pointsCost",
      title: "Points Cost (nominal)",
      type: "number",
      description: "Program points required (the nominal chart number).",
      validation: (Rule) => Rule.required().integer().positive(),
    }),
    defineField({
      name: "taxesUsd",
      title: "Taxes (USD)",
      type: "number",
      description: "Informational cash co-pay, not optimized over.",
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "sourceRef",
      title: "Source",
      type: "reference",
      to: [{ type: "source" }],
      description: "The chart source for this nominal number.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "effectiveDate",
      title: "Effective Date",
      type: "datetime",
      description:
        "When this chart value took effect. For an entry under contradiction this is informational; the resolved claim supersedes it.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "synthetic",
      title: "Synthetic",
      type: "boolean",
      initialValue: true,
      validation: (Rule) => Rule.required(),
    }),
  ],
});
