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

The draft dev.to submission is in [`WRITEUP.md`](./WRITEUP.md).

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
| `MODEL_PROVIDER` | Optional (defaults to `openai`) | `openai` or `anthropic`, selects which provider the key is for. |
| `MODEL_NAME` | Optional | Model id override (defaults: `gpt-4o` / `claude-sonnet-4-20250514`). |

With `MODEL_PROVIDER_API_KEY` **absent**, the `/api/chat` route returns a typed
`{ disabled: true, solverPath: "/solver" }` response (no crash, no fabricated
price) and the agent page steers you to the model-free path.

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
5. **Create the Sanity Context MCP endpoint** against your project/dataset, with
   the **GROQ query tool** and the **Knowledge Base** enabled (the two Context
   concerns Safari binds as separate tools).
6. **(Optional) Deploy** the Next.js app:
   ```bash
   npx vercel
   ```
   And set the same env vars in the Vercel project. The model key stays optional.

7. **(Optional) Set `MODEL_PROVIDER_API_KEY`** to enable the `/agent` LLM path.
   The `/solver` path already works without it.

> If you only want to see the deterministic result, you can stop after `npm run
> seed` and use `/solver`, or just run `npx vitest run` to see the end-to-end
> pipeline pass offline with no live steps at all.

---

## Project layout

```
app/           Next.js App Router — pages (/, /agent, /solver) + api routes
  api/chat     Vercel AI SDK v7 agent endpoint (four Context tools)
  api/*        traverse (GROQ), contradictions (KB), resolve (write), solve
solver/        pure deterministic solver + its tests
lib/           shared pure logic (groq, labels, resolution, toCandidates),
               Sanity client, and the committed offline fixture
sanity/        embedded Studio: schema + idempotent seed (own tsconfig)
components/    result components (QueryTrace, KBIssueView, ResolutionCard,
               ProofTable, NotComputedCard, RoutingResult, SyntheticBanner)
```

See [`.agents/tasks/design.md`](./.agents/tasks/design.md) for the full design
and [`IDEA.md`](./IDEA.md) for the pitch.
