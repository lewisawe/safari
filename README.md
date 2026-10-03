# Safari

An award-travel routing agent built on **Sanity** structured content for the
Sanity Challenge (Path One). It **constructs** the provably-cheapest valid points
routing from A to B — and **refuses to price it** until it resolves a
Knowledge-Base contradiction between disagreeing award-chart sources.

- Two paths over the **same** pipeline: an **agent** path (`/agent`, Vercel AI
  SDK v7, LLM chains four Sanity Context tools) and a **model-free** path
  (`/solver`, a structured form, **no API key needed**).
- **Fail-closed:** every price the UI shows comes from the deterministic solver's
  typed output; absence renders as `NOT_COMPUTED`, never a guessed number.
- **The data is synthetic** and labeled as such throughout.

---

## Prerequisites

### 1. Node 22.12+ (and why)

```bash
node -v   # must print v22.12.0 or higher
```

Sanity v6 tooling (`sanity@6`, `@sanity/client@8`) declares `engines: node >=
22.12.0`. On an older Node, `npm install` can **silently half-install** these
packages, producing confusing downstream errors. Check `node -v` first. (Verified
build environment: Node 22.22.2.)

### 2. npm

The lockfile (`package-lock.json`) is committed; use `npm`.

---

## Install

```bash
npm install
```

Should complete with **zero engine errors** on Node 22.12+.

---

## Environment

Copy `.env.example` to `.env.local` and fill in the values. Full matrix:

| Variable | Required? | Purpose |
|---|---|---|
| `SANITY_PROJECT_ID` | Required for seed + live reads/writes | Your Sanity project id. |
| `SANITY_DATASET` | Optional (defaults to `production`) | Dataset name. This build uses public-read `production`. |
| `SANITY_API_READ_TOKEN` | Optional | Not needed for a **public** dataset; set only for a private dataset or higher rate limits. |
| `SANITY_API_WRITE_TOKEN` | Required for `npm run seed` and the resolve write action | Write token. Missing it throws a typed, visible error — never a silent partial write. |
| `MODEL_PROVIDER_API_KEY` | **OPTIONAL** | Enables the LLM agent path (`/agent`) only. **Absent is fine** — the model-free `/solver` path runs the full pipeline with no key. |
| `MODEL_PROVIDER` | Optional (defaults to `openai`) | `bedrock`, `openai` or `anthropic`. `bedrock` needs no key (AWS credential chain). |
| `MODEL_NAME` | Optional | Model id override (defaults: `us.amazon.nova-pro-v1:0` / `gpt-4o` / `claude-sonnet-4-20250514`). |
| `AWS_PROFILE` / `AWS_REGION` | Bedrock only | Local AWS profile and region (default `us-east-1`) for Bedrock. |
| `SANITY_CONTEXT_MCP_URL` | Optional | Sanity Context MCP endpoint URL. With the token, traversal runs through Context MCP `groq_query`. |
| `SANITY_CONTEXT_TOKEN` | Optional | **Organization** token with the Context Viewer role (project tokens get 403 `contextGrantRequired`). |
| `SANITY_KB_ID` | Optional | Knowledge Base id (`kb…`). Enables the cited Knowledge Base evidence panel and the agent's `readKnowledgeBase` tool. |
| `AGENT_DAILY_CAP` | Optional (default `50`) | Global agent runs per UTC day, counted in Sanity. See [Deploy (Vercel)](#deploy-vercel). |
| `AGENT_RATE_PER_HOUR` | Optional (default `5`) | Agent questions per visitor IP per hour (per server instance). |
| `AGENT_ENABLED` | Optional | `false` switches the agent off (the page shows the disabled card). |

With no model provider configured (no `MODEL_PROVIDER=bedrock` and no
`MODEL_PROVIDER_API_KEY`), the `/api/chat` route returns a typed
`{ disabled: true, solverPath: "/solver" }` response (no crash, no fabricated
price) and the agent page steers you to the model-free path.

### Model provider

The agent runs on Amazon Bedrock with Amazon Nova Pro
(`us.amazon.nova-pro-v1:0`, a cross-region inference profile) when
`MODEL_PROVIDER=bedrock`. Credentials come from the AWS SDK chain, so locally
`AWS_PROFILE=<profile>` plus `AWS_REGION=us-east-1` in `.env.local` is enough; no
key goes in the repo. Bedrock is pay-per-token, not free. For a public deploy,
use env keys or an IAM role scoped to `bedrock:InvokeModel` and
`bedrock:InvokeModelWithResponseStream` on that model / inference profile only.

---

## Run the model-free `/solver` path with NO key

The headline demo is fully functional with **no model key and no live Sanity**
once the dataset is seeded (or offline via the committed fixture in the tests).

```bash
npm run dev
# open http://localhost:3000/solver
# submit: SFO -> NRT, business, holding Amex MR + Chase UR
```

It drives the identical traversal → Knowledge-Base read → resolve → solve
pipeline straight-line and returns **Amex MR → ANA, 90,000** with the proof
(VS 95k, VS 95k, AC 105k ascending). The agent path (`/agent`) returns the same
answer when a model key is set.

---

## Verify (offline, no network, no key)

```bash
npx vitest run     # solver, resolution rule, mapping, fail-closed routes,
                   # the chat disabled-path (NFR-3), and the model-free
                   # end-to-end SFO->NRT pipeline — all pass offline.

npm run build      # next build — ZERO type errors.
```

The model-free end-to-end test (`app/solver/pipeline.test.ts`) asserts the exact
demo result offline against the committed GROQ fixture: no live Sanity, no key.

---

## AUTOMATION RAN X / YOU MUST RUN Y

This split is deliberate. **The build automation did not touch any live Sanity
project, did not create a dataset, did not seed data, and did not deploy
anything.** Those are live steps you must run yourself, in order.

### ✅ What the automation ALREADY RAN (code-only, offline)

- Scaffolded the Next.js app, the Sanity schema + seed script, the pure solver,
  the shared lib, and the result components.
- Wrote the agent route (`/api/chat`, AI SDK v7), the agent page (`/agent`), the
  model-free page (`/solver`), and the four API routes.
- Ran the full test suite (`npx vitest run`) and the production build
  (`npm run build`) **offline** — both green, zero type errors.

Nothing above required a live Sanity project, a dataset, a seed, an API key, or a
deploy. No live step was performed.

### 🔴 What YOU MUST RUN (live steps, in this order)

These touch live services and were **not** run by the automation:

1. **Log in to Sanity.**
   ```bash
   npx sanity login
   ```
2. **Create the Sanity project and a public `production` dataset.** In the
   Sanity dashboard (or CLI), create a project, then create a dataset named
   `production` with **public read** so judges can run the queries.
3. **Set the env vars.** Put `SANITY_PROJECT_ID` and `SANITY_API_WRITE_TOKEN`
   (create a write token in the project's API settings) into `.env.local`.
4. **Seed the dataset** (idempotent; fixed `_id`s; re-runnable):
   ```bash
   npm run seed
   ```
   This writes the synthetic §5 dataset and resets the engineered contradiction
   to **unresolved** so the gate fires on a fresh demo. It exits non-zero with a
   clear message if `SANITY_PROJECT_ID` or `SANITY_API_WRITE_TOKEN` is missing —
   it never does a silent partial write.
5. **(Optional) Set up Sanity Context** (GROQ mode + Knowledge Base). See
   [Sanity Context setup](#sanity-context-setup) below.
6. **(Optional) Run or deploy the Studio.** The schema lives in the sibling
   `studio-safari/` package (standalone `sanity@6`). From that folder:
   ```bash
   cd ../studio-safari
   npm install
   npm run dev      # local Studio at http://localhost:3333
   npx sanity deploy  # optional hosted Studio
   ```
   It targets the same `projectId` (`62hh3v9t`) / `production` dataset and
   derives its `authority` options from `safari/lib/authority.ts`, so the schema
   enum and the solver rank can never drift.
7. **(Optional) Deploy** the Next.js app. See [Deploy (Vercel)](#deploy-vercel)
   for the env vars and the cost guard.

8. **(Optional) Set `MODEL_PROVIDER_API_KEY`** to enable the `/agent` LLM path.
   The `/solver` path already works without it.

> If you only want to see the deterministic result, you can stop after `npm run
> seed` and use `/solver`, or just run `npx vitest run` to see the end-to-end
> pipeline pass offline with no live steps at all.

---

## Deploy (Vercel)

```bash
npx vercel          # link + preview
npx vercel --prod   # production
```

Set these in the Vercel project (Settings → Environment Variables). Secrets are
marked; never commit them. `npm run build` succeeds with any of them missing:
a missing var only turns its feature off at runtime (typed fallback, never a
crash or a guessed price).

| Variable | Secret? | Needed for |
|---|---|---|
| `SANITY_PROJECT_ID` | no | every Sanity read/write |
| `SANITY_DATASET` | no | dataset name (default `production`) |
| `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET` | no | optional fallbacks for the two above; not needed when they are set |
| `SANITY_API_READ_TOKEN` | **secret** | optional for a public dataset |
| `SANITY_API_WRITE_TOKEN` | **secret** | resolve, Reset demo, and the agent's daily-cap counter (without it the agent fails closed) |
| `SANITY_CONTEXT_MCP_URL` | no | optional: traversal via Context MCP |
| `SANITY_CONTEXT_TOKEN` | **secret** | optional: org token, Context Viewer role |
| `SANITY_KB_ID` | no | optional: Knowledge Base evidence |
| `MODEL_PROVIDER` | no | `bedrock` |
| `MODEL_NAME` | no | `us.amazon.nova-pro-v1:0` (the default) |
| `AWS_REGION` | no | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | **secret** | Bedrock: an IAM user limited to `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on Nova Pro / its inference profile |
| `AWS_SECRET_ACCESS_KEY` | **secret** | same IAM user |
| `AGENT_DAILY_CAP` | no | global agent runs per UTC day (default `50`) |
| `AGENT_RATE_PER_HOUR` | no | agent questions per IP per hour (default `5`) |
| `AGENT_ENABLED` | no | `false` is the kill switch |

`MODEL_PROVIDER_API_KEY` is only for `openai`/`anthropic`; leave it unset for
Bedrock. Do **not** set `AWS_PROFILE` on Vercel: the AWS credential chain skips
the env keys whenever `AWS_PROFILE` is set. Locally, `AWS_PROFILE` in
`.env.local` keeps working.

### Judge flow and cost guard

- `/solver` needs no model and costs nothing. It runs the full pipeline.
- `/agent` bills Bedrock, so every send is checked before any model call: an
  operator kill switch, request caps (12 messages, 2,000 characters per
  question), a per-IP hourly limit, and a global daily cap. The cap is a Sanity
  document per UTC day (`demoUsage.agent.<YYYY-MM-DD>`, incremented atomically).
  If that counter can't be written, the agent refuses the run (fails closed).
  Each run is also bounded by `maxOutputTokens: 1200` per step and 8 steps.
  A refused send shows a card pointing at `/solver`.
- **Reset demo** (on `/solver` and `/agent`) calls `POST /api/demo/reset`,
  which deletes the stored decision and clears the contradiction's
  `committedResolution`, so the 85k vs 90k gate fires again for the next judge.
  It is limited to 3 resets per minute per IP.

---

## Sanity Context setup

Optional. Without it, every read uses the local `@sanity/client` and the UI says
so. With it, the traversal runs through Context MCP and the `/solver` page
shows a cited Knowledge Base panel.

1. In **Manage → Labs**, enable **Context** and **Knowledge Bases** for the org.
2. Create an **organization token** with the **Context Viewer** role.
3. Deploy the schema **and the Studio**, then seed: in `studio-safari` run
   `npx sanity schema deploy`, and either `npx sanity deploy` or register the
   Studio as an external app (`deployment.appId` in `sanity.cli.ts`). Context
   only serves datasets with a deployed Studio v5.1.0+; otherwise every call
   fails with -32004. Then `npm run seed` here. Each `source` now carries a synthetic
   `excerpt`.
4. In Dashboard → Context, create a **Knowledge Base** from dataset
   `62hh3v9t/production` and build it. It should flag an Issue: ANA SFO→NRT
   business 85,000 (printed chart) vs 90,000 (devaluation notice). Resolve it by
   choosing the **devaluation notice**.
5. Create an **MCP endpoint** with the dataset as its source (and the KB).
6. Put `SANITY_CONTEXT_MCP_URL`, `SANITY_CONTEXT_TOKEN` and `SANITY_KB_ID` into
   `.env.local`.
7. Run `npm run check-context`. It lists tools, runs the traversal via
   `groq_query`, prints each contradiction's resolved/unresolved status, prints
   the KB outline header and matched entries, and reads the ANA entry. Each
   documented failure (403 `contextGrantRequired`, -32004 schema not deployed,
   -32005 no KB, unknown KB id) prints what to fix.

What the `via` markers mean (QueryTrace on `/solver`, tool output on `/agent`):

- `context-mcp`: rows came from Context MCP `groq_query` running the same fixed
  query. Context doesn't accept `$params`, so the app checks each value against
  a strict allowlist (currency ids `^[a-z0-9._-]+$`, IATA `^[A-Z]{3}$`, a known
  cabin) and inlines it as a JSON literal. A value that fails the allowlist is
  never sent to Context; the parameterized local query serves it instead.
- `sanity-client (Context not configured)`: the Context vars are absent.
- `sanity-client (Context MCP failed: <kind>)`: Context was configured but the
  read failed (auth, transport, tool error, truncation); the same query ran
  locally instead. Rows always come from the real dataset.

The gate and prices don't depend on Context. The gate is the GROQ-embedded
`committedResolution`; prices come only from the local deterministic solver;
`resolve` stays a local write because Context is read-only. Knowledge Base
content is evidence only.

Read-after-write through Context was checked live: the re-traverse right after
`/api/resolve` saw the new `committedResolution`. If Context ever serves a stale
read, the re-run stays gated (NOT_COMPUTED, never a wrong price). Run
`npm run check-context` before and after a resolve to compare the status.

---

## Project layout

Safari is two sibling packages under one parent folder — the Next.js app and a
standalone Sanity Studio that share **one** source of truth for the authority
enum (`lib/authority.ts`, imported by both):

```
parent/
├── safari/         # this package — the Next.js app
│   app/            App Router — pages (/, /agent, /solver) + api routes
│     api/chat      Vercel AI SDK v7 agent endpoint (four Context tools)
│     api/*         traverse (GROQ), contradictions (KB), resolve (write), solve
│     api/kb        Knowledge Base evidence via Context MCP (presentation only)
│   solver/         pure deterministic solver + its tests
│   lib/            shared pure logic (groq, labels, resolution, toCandidates),
│                   Sanity client, the committed offline fixture, and
│                   authority.ts — the dependency-free authority enum/rank
│                   (M1 single source of truth, imported by the Studio too)
│                   Context MCP: context.ts (client helpers), traverse.ts
│                   (Context-first traversal + fallback), kbOutline.ts,
│                   kbEvidence.ts, markdownBlocks.ts (safe renderer)
│   scripts/seed.ts idempotent §5 seed (run via `npm run seed`)
│   scripts/check-context.ts  live Context MCP smoke test (`npm run check-context`)
│   components/      result components (QueryTrace, KBIssueView, ResolutionCard,
│                    ProofTable, NotComputedCard, RoutingResult, SyntheticBanner)
└── studio-safari/  # standalone Sanity Studio (sanity@6)
    schemaTypes/     the 9 schema types; source.ts derives its authority
                     options from ../../safari/lib/authority (no drift)
    sanity.config.ts projectId 62hh3v9t, dataset production
```

