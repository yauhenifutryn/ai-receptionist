import { z } from "zod";
import { AppointmentCategorySchema } from "./appointment-category.enum.js";

/**
 * ServiceValueMatrix — per-tenant table mapping AppointmentCategory to revenue.
 *
 * Owned by the tenant (editable in the wizard's "Service value matrix" page,
 * `apps/web/app/onboard/value-matrix`). The post-call webhook multiplies the
 * appointment's category by this row's `expectedRevenuePln` to compute
 * `recovered_revenue` for the dashboard ROI display and the 60-day outcome
 * guarantee math.
 *
 * Vertical-agnostic — the categories live in `appointment-category.enum.ts`.
 */
export const ServiceValueMatrixRowSchema = z
  .object({
    category: AppointmentCategorySchema,
    /** PLN revenue the tenant typically realizes from one such appointment. */
    expectedRevenuePln: z.number().nonnegative(),
    /** Probability (0..1) the booking actually shows up. Default 0.7 if unknown. */
    showRate: z.number().min(0).max(1).default(0.7),
    /** Optional override of the matching scraped service name(s). */
    matchesServiceNames: z.array(z.string()).optional(),
  })
  .strict();
export type ServiceValueMatrixRow = z.infer<typeof ServiceValueMatrixRowSchema>;

export const ServiceValueMatrixSchema = z
  .object({
    tenantId: z.string().uuid(),
    rows: z.array(ServiceValueMatrixRowSchema),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ServiceValueMatrix = z.infer<typeof ServiceValueMatrixSchema>;
