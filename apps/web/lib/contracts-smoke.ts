// Smoke-import of @ai-receptionist/contracts from apps/web. Existence proves
// the cross-package import + Next.js transpilePackages config is correct.
// Not used at runtime; tree-shaken from the bundle.
import {
  AppointmentCategorySchema,
  ConsentDecisionSchema,
  ScraperOutputSchema,
  type ScraperOutput,
} from "@ai-receptionist/contracts";

export const _contractsSmoke = {
  AppointmentCategorySchema,
  ConsentDecisionSchema,
  ScraperOutputSchema,
};

export type _ContractsSmokeOutput = ScraperOutput;
