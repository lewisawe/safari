// sanity/schemaTypes/contradiction.ts
//
// First-class contradiction — THE gate (design §4.6). Links two disagreeing
// claims about the same award and records the committed resolution.
//
// claimA/claimB are the inline `claim` object type (defined once in claim.ts),
// each Rule.required() (N5) so the §6 explicit sub-projection can never hit an
// absent claim. committedResolution is the inline `resolution` object type and
// is OPTIONAL / absent until resolved: its ABSENCE is the unresolved signal
// (Sanity stores no null object), so the seed writes NO committedResolution
// field for an unresolved contradiction.

import { defineType, defineField } from "sanity";

export const contradiction = defineType({
  name: "contradiction",
  title: "Contradiction",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      description:
        '"ANA SFO→NRT Business: 85k chart vs 90k devaluation"',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "subjectEntry",
      title: "Subject Entry",
      type: "reference",
      to: [{ type: "awardChartEntry" }],
      description: "The entry on the critical path this contradiction is about.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "claimA",
      title: "Claim A",
      // Inline `claim` type, required (N5).
      type: "claim",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "claimB",
      title: "Claim B",
      // Same inline `claim` type as claimA, required (N5).
      type: "claim",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "explanation",
      title: "Explanation",
      type: "text",
      description: "Why they disagree (devaluation superseded the printed chart).",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      options: {
        list: [
          { title: "Unresolved", value: "unresolved" },
          { title: "Resolved", value: "resolved" },
        ],
      },
      initialValue: "unresolved",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "committedResolution",
      title: "Committed Resolution",
      // Inline `resolution` type, OPTIONAL — absent until resolved (§4.6).
      // Absence is the unresolved signal; do NOT mark required.
      type: "resolution",
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
