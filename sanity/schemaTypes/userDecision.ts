// sanity/schemaTypes/userDecision.ts
//
// A committed resolution keyed so a future run honors it without re-prompting
// (carry-forward) — design §4.7. The document `_id` is derived and fixed as
// `userDecision.${contradiction._id}` (one decision per contradiction), and
// `decisionKey` mirrors it as a queryable field. Writes use createOrReplace on
// that derived `_id` so re-resolution is idempotent. The seed DELETES this
// derived id so a reseed restores the always-fires gate.

import { defineType, defineField } from "sanity";

export const userDecision = defineType({
  name: "userDecision",
  title: "User Decision",
  type: "document",
  fields: [
    defineField({
      name: "decisionKey",
      title: "Decision Key",
      type: "string",
      description: "Deterministic key mirroring the contradiction _id.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "contradiction",
      title: "Contradiction",
      type: "reference",
      to: [{ type: "contradiction" }],
      description: "Which contradiction this resolves.",
      validation: (Rule) => Rule.required(),
    }),
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
      description: "The effective number carried forward.",
      validation: (Rule) => Rule.required().integer().positive(),
    }),
    defineField({
      name: "chosenSource",
      title: "Chosen Source",
      type: "reference",
      to: [{ type: "source" }],
      description: "Cited source.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "decidedAt",
      title: "Decided At",
      type: "datetime",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "rationale",
      title: "Rationale",
      type: "string",
      description:
        '"most recent effectiveDate from a devaluation-notice authority"',
      validation: (Rule) => Rule.required(),
    }),
  ],
});
