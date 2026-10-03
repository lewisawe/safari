// sanity/schemaTypes/program.ts
//
// An airline/hotel loyalty program whose award chart you redeem into —
// design §4.3. The award-chart entries point UP to the program
// (awardChartEntry.program), so program holds no back-list of charts.

import { defineType, defineField } from "sanity";

export const program = defineType({
  name: "program",
  title: "Program",
  type: "document",
  fields: [
    defineField({
      name: "code",
      title: "Code",
      type: "string",
      description: "e.g. ANA, VS, AC.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      description: '"ANA Mileage Club"',
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
