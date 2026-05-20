import { Hono } from "hono";
import { handleCheckAvailability } from "./check-availability.js";
import { handleCreateBooking } from "./create-booking.js";
import type { BookingsRepository } from "./repository.js";
import type { CalendarProvider } from "@ai-receptionist/contracts";
import type { SmsClient } from "../integrations/sms/index.js";
import type { SmsFailureLogger } from "./sms-confirmation.js";

export interface TenantConfig {
  tenantId: string;
  clinicName: string;
  contactPhone: string | null;
  /**
   * Owner-controlled toggle from /owner/settings. When false, the post-booking
   * SMS side-effect is skipped silently inside handleCreateBooking. Default
   * true — preserves the pre-toggle behavior for clinics that never visit
   * the settings page.
   */
  smsConfirmationsEnabled: boolean;
}

export interface CreateToolsRouterArgs {
  repo: BookingsRepository;
  provider: CalendarProvider;
  smsShortUrlBase: string;
  /** Optional — when omitted, no SMS fires (useful for non-prod environments). */
  smsClient?: SmsClient;
  smsFailureLogger?: SmsFailureLogger;
  /**
   * Resolves per-tenant config (clinic name + contact phone) for the SMS body
   * and PSTN routing. Called once per tool invocation with the EL agent id.
   */
  resolveTenantConfig: (providerAgentId: string) => Promise<TenantConfig | null>;
}

export function createToolsRouter(args: CreateToolsRouterArgs): Hono {
  const app = new Hono();

  app.post("/tools/check-availability", async (c) => {
    try {
      const body = await c.req.json();
      const cfg = await args.resolveTenantConfig(body.agentId);
      if (!cfg) {
        return c.json(
          {
            code: "tenant_not_found",
            callerSafeMessage: "Wystąpił problem techniczny po naszej stronie. Łączę z zespołem.",
          },
          404,
        );
      }
      const result = await handleCheckAvailability(body, {
        provider: args.provider,
        tenantId: cfg.tenantId,
      });
      return c.json(result, 200);
    } catch {
      return c.json(
        {
          code: "validation_failed",
          callerSafeMessage: "Nie mogę teraz sprawdzić wolnych terminów. Łączę z kimś z zespołu.",
        },
        400,
      );
    }
  });

  app.post("/tools/create-booking", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json(
        {
          code: "validation_failed",
          callerSafeMessage: "Nie udało mi się odczytać żądania. Łączę z zespołem.",
        },
        400,
      );
    }
    const cfg = await args.resolveTenantConfig(body.agentId);
    if (!cfg) {
      return c.json(
        {
          code: "tenant_not_found",
          callerSafeMessage: "Wystąpił problem techniczny po naszej stronie. Łączę z zespołem.",
        },
        404,
      );
    }
    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId : undefined;
    const result = await handleCreateBooking(body, {
      provider: args.provider,
      repo: args.repo,
      smsShortUrlBase: args.smsShortUrlBase,
      ...(args.smsClient ? { smsClient: args.smsClient } : {}),
      ...(args.smsFailureLogger ? { smsFailureLogger: args.smsFailureLogger } : {}),
      clinicName: cfg.clinicName,
      contactPhone: cfg.contactPhone,
      smsConfirmationsEnabled: cfg.smsConfirmationsEnabled,
      ...(conversationId ? { conversationId } : {}),
    });
    if (result.ok) {
      return c.json(result.response, 200);
    }
    return c.json(result.error, result.status as 400 | 404 | 409 | 500);
  });

  return app;
}
