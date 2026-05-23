## Summary

<!-- 1-3 bullets. What changed and why. -->

## Type

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor / cleanup
- [ ] Docs
- [ ] Config / CI / tooling

## Verification

Before requesting review, confirm:

- [ ] `pnpm verify` passes locally (format, builds, typecheck, lint, tests, rules validator).
- [ ] `pnpm verify:rules` passes — no regressions in the hard rules (audio storage off, consent default false, EU regions only, no raw PII in `console.log`).
- [ ] If `.env.example` changed, `pnpm env:doctor` still classifies keys correctly.
- [ ] If `packages/contracts/*` changed, the change is flagged in the summary and the corresponding web/backend consumers are updated in the same PR.

## Notes for the reviewer

<!-- Anything specific to look at, known risks, follow-up tickets. -->
