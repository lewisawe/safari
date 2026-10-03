// sanity/schemaTypes/resolution.ts
//
// Inline object type `resolution`, used by `contradiction.committedResolution`
// (design §4.6). This object is ABSENT until a contradiction is resolved — its
// presence (with all four sub-fields set) is the "resolved" signal; its absence
// is the "unresolved" signal. Sanity has no null for an object field, so the
// seed simply omits this field for an unresolved contradiction.

import { defineType, defineField } from "sanity";

export const resolution = defineType({
  name: "resolution",
  title: "Committed Resolution",
  type: "object",
  fields: [
    defineField({
      name: "chosenClaim",
      title: "Chosen Claim",
      type: "string",
      options: {
        list: [
          { title: "Claim A", value: "A" },
          { title: "Claim B", value: "B" },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "chosenPointsCost",
      title: "Chosen Points Cost",
      type: "number",
      description: "The effective number committed.",
      validation: (Rule) => Rule.required().integer().positive(),
    }),
    defineField({
      name: "chosenSource",
      title: "Chosen Source",
      // NIT-C: reference the `source` type BY NAME with the same `to` target
      // used by claim.source, so both inline objects stay in sync.
      type: "reference",
      to: [{ type: "source" }],
      description: "Cited source for the chosen claim.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "rationale",
      title: "Rationale",
      type: "string",
      description: "Why this claim won (precedence rule output).",
      validation: (Rule) => Rule.required(),
    }),
  ],
});
