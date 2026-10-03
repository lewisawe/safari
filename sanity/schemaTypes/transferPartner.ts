// sanity/schemaTypes/transferPartner.ts
//
// A directed transfer relationship: a currency transfers into a program at a
// ratio — design §4.4. Ratio is points-out-per-point-in, so a worse ratio (<1)
// correctly costs the user more currency. The solver cost in the user's
// currency = ceil(pointsCost / ratio).

import { defineType, defineField } from "sanity";

export const transferPartner = defineType({
  name: "transferPartner",
  title: "Transfer Partner",
  type: "document",
  fields: [
    defineField({
      name: "fromCurrency",
      title: "From Currency",
      type: "reference",
      to: [{ type: "pointsCurrency" }],
      description: "Source currency.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "toProgram",
      title: "To Program",
      type: "reference",
      to: [{ type: "program" }],
      description: "Destination program.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "ratio",
      title: "Ratio",
      type: "number",
      description: "Points-out per point-in; 1.0 = 1:1, 0.8 = 5:4 against the user.",
      validation: (Rule) => Rule.required().positive(),
    }),
    defineField({
      name: "transferTimeHours",
      title: "Transfer Time (hours)",
      type: "number",
      description: "Informational (e.g. 0 instant, 48).",
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "sourceRef",
      title: "Source",
      type: "reference",
      to: [{ type: "source" }],
      description: "Provenance for this ratio.",
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
