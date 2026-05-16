import { Hono } from "hono";
import { handleCheckAvailability } from "./check-availability.js";
import { handleCreateBooking } from "./create-booking.js";
import type { BookingsRepository } from "./repository.js";

export interface CreateToolsRouterArgs {
  repo: BookingsRepository;
  smsShortUrlBase: string;
  now?: () => Date;
}

export function createToolsRouter(args: CreateToolsRouterArgs): Hono {
  const app = new Hono();

  app.post("/tools/check-availability", async (c) => {
    try {
      const body = await c.req.json();
      const result = handleCheckAvailability(body, ...(args.now ? [{ now: args.now }] : []));
      return c.json(result, 200);
    } catch (e) {
      return c.json(
        {
          code: "validation_failed",
          callerSafeMessage:
            "Nie mogę teraz sprawdzić wolnych terminów. Łączę z kimś z zespołu.",
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
          callerSafeMessage:
            "Nie udało mi się odczytać żądania. Łączę z zespołem.",
        },
        400,
      );
    }
    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId : undefined;
    const result = await handleCreateBooking(body, {
      repo: args.repo,
      smsShortUrlBase: args.smsShortUrlBase,
      ...(conversationId ? { conversationId } : {}),
    });
    if (result.ok) {
      return c.json(result.response, 200);
    }
    return c.json(result.error, result.status as 400 | 404 | 409 | 500);
  });

  return app;
}
