import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Resolve the Next.js `@/*` path alias (tsconfig paths) so route handlers
  // that import via `@/lib/...`, `@/solver/...` can be unit-tested directly.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "solver/**/*.test.ts",
      "lib/**/*.test.ts",
      "app/**/*.test.ts",
    ],
  },
});
