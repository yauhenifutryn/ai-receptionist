import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

app.get("/health", (c) =>
  c.json({ status: "ok", service: "backend", at: new Date().toISOString() }),
);

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`backend listening on http://localhost:${info.port}`);
});

export default app;
