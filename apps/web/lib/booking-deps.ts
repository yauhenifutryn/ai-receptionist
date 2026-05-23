import type {
  BookingsRepository,
  TenantConfig,
  SmsFailureLogger,
  SmsFailureLogInput,
} from "@ai-receptionist/backend/tools";
import { createSupabaseBookingsRepository } from "@ai-receptionist/backend/tools";
import type { CalendarProvider } from "@ai-receptionist/contracts";
import { createSimulatedCalendarProvider } from "@ai-receptionist/backend/integrations/calendar";
import { createZadarmaSmsClient, type SmsClient } from "@ai-receptionist/backend/integrations/sms";
import { getServiceRoleSupabase } from "@/lib/supabase-server";

/**
 * Builds runtime dependencies for the booking server-tool routes. Singletons
 * where safe (provider, repo, smsClient). resolveTenantConfig is the only
 * per-request closure — it queries Supabase for the clinic display name +
 * contact phone given an EL agent id.
 */

let cachedProvider: CalendarProvider | null = null;
function getProvider(): CalendarProvider {
  if (cachedProvider) return cachedProvider;
  cachedProvider = createSimulatedCalendarProvider();
  return cachedProvider;
}

let cachedSmsClient: SmsClient | undefined;
function getSmsClient(): SmsClient | undefined {
  if (cachedSmsClient) return cachedSmsClient;
  const userKey = process.env.ZADARMA_USER_KEY;
  const secretKey = process.env.ZADARMA_SECRET_KEY;
  if (!userKey || !secretKey) return undefined;
  cachedSmsClient = createZadarmaSmsClient({ userKey, secretKey });
  return cachedSmsClient;
}

let cachedSmsFailureLogger: SmsFailureLogger | null = null;
function getSmsFailureLogger(): SmsFailureLogger {
  if (cachedSmsFailureLogger) return cachedSmsFailureLogger;
  cachedSmsFailureLogger = {
    async logFailure(input: SmsFailureLogInput): Promise<void> {
      const sb = getServiceRoleSupabase();
      const { error } = await sb.from("sms_send_failures").insert({
        tenant_id: input.tenantId,
        booking_id: input.bookingId,
        to_phone: input.toPhone,
        error_code: input.errorCode,
        error_message: input.errorMessage,
      });
      if (error) {
        // Last-resort: log to stderr. Don't throw — we're already in an
        // error path and the caller has agreed to never block on SMS issues.
        console.error("[sms_send_failures] insert failed:", error.message);
      }
    },
  };
  return cachedSmsFailureLogger;
}

let cachedRepo: BookingsRepository | null = null;
function getRepo(): BookingsRepository {
  if (cachedRepo) return cachedRepo;
  cachedRepo = createSupabaseBookingsRepository(getServiceRoleSupabase());
  return cachedRepo;
}

export interface BookingDeps {
  provider: CalendarProvider;
  repo: BookingsRepository;
  smsClient: SmsClient | undefined;
  smsFailureLogger: SmsFailureLogger;
  resolveTenantConfig: (providerAgentId: string) => Promise<TenantConfig | null>;
}

export function getBookingDeps(): BookingDeps {
  return {
    provider: getProvider(),
    repo: getRepo(),
    smsClient: getSmsClient(),
    smsFailureLogger: getSmsFailureLogger(),
    resolveTenantConfig: async (providerAgentId: string) => {
      const sb = getServiceRoleSupabase();
      const { data, error } = await sb
        .from("agents")
        .select("tenant_id, tenants(display_name, contact_phone, sms_confirmations_enabled)")
        .eq("provider_agent_id", providerAgentId)
        .maybeSingle();
      if (error || !data) return null;
      const tenants = Array.isArray(data.tenants) ? data.tenants[0] : data.tenants;
      if (!tenants?.display_name) return null;
      // Default to `true` when the column read back as null/undefined — same
      // behavior the migration's column default enforces at write time, but
      // we belt-and-braces it here so any pre-migration tenant row that
      // somehow lacks the column never silently drops SMS.
      const smsConfirmationsEnabled =
        typeof tenants.sms_confirmations_enabled === "boolean"
          ? tenants.sms_confirmations_enabled
          : true;
      return {
        tenantId: data.tenant_id,
        clinicName: tenants.display_name,
        contactPhone: tenants.contact_phone ?? null,
        smsConfirmationsEnabled,
      };
    },
  };
}
