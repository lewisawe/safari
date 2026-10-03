// sanity/schemaTypes/pointsCurrency.ts
//
// A transferable points currency the user can hold — design §4.2.

import { defineType, defineField } from "sanity";

export const pointsCurrency = defineType({
  name: "pointsCurrency",
  title: "Points Currency",
  type: "document",
  fields: [
    defineField({
      name: "code",
      title: "Code",
      type: "string",
      description: "Stable key, e.g. AMEX_MR, CHASE_UR.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      description: '"American Express Membership Rewards"',
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
