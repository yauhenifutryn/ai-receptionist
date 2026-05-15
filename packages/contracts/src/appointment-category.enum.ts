import { z } from "zod";

/**
 * AppointmentCategory — a vertical-agnostic placeholder taxonomy.
 *
 * Used by the post-call webhook to compute `recovered_revenue`
 * via the tenant's `service_value_matrix` (see `service-value-matrix.schema.ts`).
 *
 * Once a vertical locks (target 2026-05-18), this enum gets a vertical-specific
 * extension: e.g., for vet — `vaccination`, `surgery_consult`, `dental_clean`,
 * `emergency_triage`. Today the placeholder set is intentionally generic so that
 * the contracts compile and the dashboard / DB schema are stable.
 */
export const AppointmentCategorySchema = z.enum([
  "consultation",
  "routine_service",
  "complex_service",
  "follow_up",
  "emergency_triage",
  "information_only",
  "other",
]);

export type AppointmentCategory = z.infer<typeof AppointmentCategorySchema>;
