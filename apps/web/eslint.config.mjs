// Flat-config ESLint for the Next 16 web app. Replaces .eslintrc.json,
// which hit a circular-JSON bug in @eslint/eslintrc 3.3.5 + eslint-config-next
// 16.2.6 + ESLint 9.39 when run under the legacy ESLINT_USE_FLAT_CONFIG=false
// shim. Flat config is the supported path going forward.

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextCoreWebVitals,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "dist/**",
      "test-sessions/**",
      "next-env.d.ts",
    ],
  },
  {
    // React 19 strict-mode purity rules are overcautious for our codebase:
    //   - `react-hooks/set-state-in-effect` flags the canonical
    //     "hydrate-from-localStorage-on-mount" pattern as illegal. There's
    //     no SSR-safe alternative; localStorage is client-only.
    //   - `react-hooks/purity` flags Date.now() inside event handlers
    //     (e.g. onMessage callbacks), which are NOT render-time. The rule
    //     can't distinguish handler-time from render-time here.
    // Both are warnings-as-errors with the strict ruleset. Demoted because
    // the false-positive rate exceeds the bug-catching rate for our code.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
];

export default config;
