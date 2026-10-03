// sanity/sanity.config.ts
//
// Embedded Sanity v6 Studio configuration (design §8.3). Dataset is
// `production` with public read so a judge can run queries without a token.
// The projectId is read from env (SANITY_PROJECT_ID / its public NEXT_PUBLIC_
// mirror) so no project id is hard-coded into source. The schema is wired from
// schemaTypes/index.ts — the single list of every document + object type.

import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes } from "./schemaTypes/index.js";

// projectId must come from the environment. In the Studio (browser) build the
// value is injected as NEXT_PUBLIC_SANITY_PROJECT_ID; the plain SANITY_PROJECT_ID
// is the server-side name used by the seed script and API routes. We accept
// either so one `.env` entry drives both. An empty string is left as-is so the
// Studio surfaces a clear "missing projectId" error rather than a guessed value.
const projectId =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ??
  process.env.SANITY_PROJECT_ID ??
  "";

const dataset =
  process.env.NEXT_PUBLIC_SANITY_DATASET ??
  process.env.SANITY_DATASET ??
  "production";

export default defineConfig({
  name: "safari",
  title: "Safari — Award-Travel Routing (Synthetic)",
  projectId,
  dataset,
  plugins: [structureTool()],
  schema: {
    types: schemaTypes,
  },
});
