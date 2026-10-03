// sanity/schemaTypes/index.ts
//
// Single list of every schema type (design §9 structure). Object types (claim,
// resolution) are registered alongside the document types so the inline
// `type: "claim"` / `type: "resolution"` references in contradiction.ts resolve.

import { source } from "./source.js";
import { pointsCurrency } from "./pointsCurrency.js";
import { program } from "./program.js";
import { transferPartner } from "./transferPartner.js";
import { awardChartEntry } from "./awardChartEntry.js";
import { contradiction } from "./contradiction.js";
import { userDecision } from "./userDecision.js";
import { claim } from "./claim.js";
import { resolution } from "./resolution.js";

export const schemaTypes = [
  // Document types
  source,
  pointsCurrency,
  program,
  transferPartner,
  awardChartEntry,
  contradiction,
  userDecision,
  // Inline object types
  claim,
  resolution,
];
