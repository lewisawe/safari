// lib/groq.ts
//
// The single fixed-depth GROQ traversal query (design §6). It walks
// pointsCurrency → transferPartner → program → awardChartEntry in ONE query,
// no recursion, four conceptual hops. Each returned row is a candidate routing
// (fromCurrency → transferPartner(ratio) → program → chartEntry) with any
// blocking contradiction folded inline. That GROQ-embedded contradiction is the
// gating authority (§8.1a): toCandidates/solve consume `committedResolution`
// from here; `readContradictions` is presentation-only.
//
// The claim/committedResolution sub-projections are explicit so the inline
// `source` references are dereferenced inside the same single query (§6 "why
// the claim projections are explicit"). An absent (unresolved) committedResolution
// is returned by GROQ as `null`, which is the authoritative unresolved signal
// (§4.6) that toCandidates maps to status:"unresolved".

/**
 * The §6 traversal query. Stored as a single exported constant so the exact
 * query string the app issues can also be shown in the UI (FR-8, QueryTrace).
 */
export const TRAVERSE_ROUTINGS_QUERY = /* groq */ `*[_type == "transferPartner" && fromCurrency._ref in $currencyIds]{
  "transferPartnerId": _id,
  ratio,
  transferTimeHours,
  "fromCurrency": fromCurrency->{ _id, code, name },
  "toProgram": toProgram->{ _id, code, name },
  "sourceRef": sourceRef->{ _id, title, authority },
  // forward to the destination program's matching chart entries.
  // N1: \`^.toProgram._ref\` reads the RAW stored reference field on the parent
  // \`transferPartner\` row (one level up), NOT the projected "toProgram" alias
  // of the same name above. Renaming the projected alias does not change this
  // match; do NOT "simplify" it to reference the alias.
  "chartEntries": *[
    _type == "awardChartEntry" &&
    program._ref == ^.toProgram._ref &&
    origin == $origin &&
    destination == $destination &&
    cabin == $cabin
  ]{
    _id, pointsCost, taxesUsd, effectiveDate,
    "program": program->{ _id, code, name },
    "source": sourceRef->{ _id, title, authority, publishedDate },
    // is there a contradiction blocking this entry?
    // ^._id = the awardChartEntry row id (one level up from this subquery).
    "contradictions": *[
      _type == "contradiction" && subjectEntry._ref == ^._id
    ]{
      _id, title, status, explanation,
      "claimA": {
        "pointsCost": claimA.pointsCost,
        "effectiveDate": claimA.effectiveDate,
        "label": claimA.label,
        "source": claimA.source->{ _id, title, authority, publishedDate }
      },
      "claimB": {
        "pointsCost": claimB.pointsCost,
        "effectiveDate": claimB.effectiveDate,
        "label": claimB.label,
        "source": claimB.source->{ _id, title, authority, publishedDate }
      },
      "committedResolution": committedResolution{
        chosenClaim, chosenPointsCost, rationale,
        "chosenSource": chosenSource->{ _id, title, authority }
      }
    }
  }
}`;

/**
 * Parameters for {@link TRAVERSE_ROUTINGS_QUERY}.
 * - `currencyIds`: array of `pointsCurrency._id` the user holds.
 * - `origin` / `destination`: IATA codes.
 * - `cabin`: one of economy|premium|business|first.
 */
export interface TraverseParams {
  currencyIds: string[];
  origin: string;
  destination: string;
  cabin: string;
}

/**
 * Build the GROQ param object from the user's goal input. Kept as a tiny pure
 * helper so the route, the model-free path, and tests construct params the one
 * same way (field names must match the `$`-placeholders in the query).
 */
export function buildTraverseParams(input: TraverseParams): TraverseParams {
  return {
    currencyIds: input.currencyIds,
    origin: input.origin,
    destination: input.destination,
    cabin: input.cabin,
  };
}
