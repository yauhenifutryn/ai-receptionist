import { Hono } from "hono";
import { handlePostCall } from "./handler.js";
import type { PostCallRepository } from "./repository.js";

export interface CreatePostCallRouterArgs {
  repo: PostCallRepository;
}

export function createPostCallRouter(args: CreatePostCallRouterArgs): Hono {
  const app = new Hono();

  app.post("/webhooks/post-call", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (body == null) {
      return c.json({ error: "invalid_json" }, 400);
    }
    const result = await handlePostCall(body, { repo: args.repo });
    if (result.ok) {
      return c.json(
        {
          tenantId: result.tenantId,
          consentLogged: result.consentLogged,
          transcriptStored: result.transcriptStored,
          recoveredRevenuePln: result.recoveredRevenuePln,
        },
        200,
      );
    }
    return c.json({ error: result.error }, result.status as 400 | 404 | 500);
  });

  return app;
}
