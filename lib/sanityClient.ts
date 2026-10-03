// lib/sanityClient.ts
//
// @sanity/client read + write clients, env-driven (design §8.3). A read against
// a PUBLIC dataset works without a token; the write client (used by the resolve
// route) REQUIRES SANITY_API_WRITE_TOKEN and throws a typed, visible error if it
// is missing — never a silent no-op or partial write (context.json fail-closed
// contract; FR-10 / NFR-5).

import { createClient, type SanityClient } from "@sanity/client";
import { SolverInvariantError } from "../solver/types";

// Studio builds inject project id/dataset under the NEXT_PUBLIC_* prefix; the
// server also reads the unprefixed names. Accept either so the seed script,
// the Studio, and the API routes all resolve the same project.
const PROJECT_ID =
  process.env.SANITY_PROJECT_ID ?? process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const DATASET =
  process.env.SANITY_DATASET ?? process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";

// Pin an API version so query behavior is stable across @sanity/client upgrades.
const API_VERSION = "2024-10-01";

/**
 * Thrown when a required Sanity env var is absent at the point a client is
 * actually needed. Reuses SolverInvariantError so the routes' existing
 * try/catch (which already degrades SolverInvariantError to NOT_COMPUTED) also
 * catches a misconfigured environment and fails closed instead of guessing.
 */
function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new SolverInvariantError(
      `missing required environment variable ${name}. ` +
        `Set it in .env.local (see README "Environment setup").`,
    );
  }
  return value;
}

/**
 * Read client for GROQ queries. A public dataset is readable without a token,
 * so this does NOT require SANITY_API_READ_TOKEN; it uses one only if present
 * (e.g. for a private dataset or higher rate limits). `useCdn: false` keeps
 * reads fresh so a just-written resolution is visible on the next traversal.
 *
 * Lazily constructed so merely importing this module never throws; a route
 * that needs it calls getReadClient() and any missing-config error surfaces at
 * request time where the route's try/catch can degrade it to NOT_COMPUTED.
 */
let _read: SanityClient | null = null;
export function getReadClient(): SanityClient {
  if (_read) return _read;
  const projectId = requireEnv("SANITY_PROJECT_ID", PROJECT_ID);
  _read = createClient({
    projectId,
    dataset: DATASET,
    apiVersion: API_VERSION,
    useCdn: false,
    token: process.env.SANITY_API_READ_TOKEN, // optional for a public dataset
  });
  return _read;
}

/**
 * Write client for the resolve route (writes userDecision + patches the
 * contradiction, §7.4). REQUIRES SANITY_API_WRITE_TOKEN and throws a typed,
 * visible error if it is absent — the resolve action must never silently
 * no-op. Lazily constructed for the same reason as the read client.
 */
let _write: SanityClient | null = null;
export function getWriteClient(): SanityClient {
  if (_write) return _write;
  const projectId = requireEnv("SANITY_PROJECT_ID", PROJECT_ID);
  const token = requireEnv("SANITY_API_WRITE_TOKEN", process.env.SANITY_API_WRITE_TOKEN);
  _write = createClient({
    projectId,
    dataset: DATASET,
    apiVersion: API_VERSION,
    useCdn: false,
    token,
  });
  return _write;
}
