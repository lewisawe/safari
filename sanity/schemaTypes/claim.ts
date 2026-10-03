// sanity/schemaTypes/claim.ts
//
// Inline object type `claim`, used by BOTH `contradiction.claimA` and
// `contradiction.claimB` (design §4.6). Defined once and referenced by name so
// the two disagreeing claims are structurally identical. Each claim carries its
// own number, its provenance `source` reference, its effective date, and a
// human label — so the two numbers + sources + dates travel together as one
// atomic claim exactly as the Knowledge-Base "Issues" view presents them.

import { defineType, defineField } from "sanity";

export const claim = defineType({
  name: "claim",
  title: "Claim",
  type: "object",
  fields: [
    defineField({
      name: "pointsCost",
      title: "Points Cost",
      type: "number",
      description: "Integer program points for this claim (e.g. 85000).",
      validation: (Rule) => Rule.required().integer().positive(),
    }),
    defineField({
      name: "source",
      title: "Source",
      // NIT-C: reference the `source` type BY NAME with the same `to` target
      // used by resolution.chosenSource, so both inline objects stay in sync.
      type: "reference",
      to: [{ type: "source" }],
      description: "Provenance for this claim's number.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "effectiveDate",
      title: "Effective Date",
      type: "datetime",
      description: "When this claim's value took effect.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "label",
      title: "Label",
      type: "string",
      description: 'Human label, e.g. "Printed award chart".',
      validation: (Rule) => Rule.required(),
    }),
  ],
});
