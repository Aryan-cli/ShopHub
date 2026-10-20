import express from "express";
import compression from "compression";
import serverless from "serverless-http";
import { createServer } from "http";
import { registerRoutes } from "../../server/routes";

// Runs the Express API (server/routes.ts) as a Netlify Function.
// /api/* is rewritten here by netlify.toml.

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

async function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(compression());

  // Requests can arrive as /.netlify/functions/api/<path>; the routes expect /api/<path>
  app.use((req, _res, next) => {
    const prefix = "/.netlify/functions/api";
    if (req.url.startsWith(prefix)) req.url = "/api" + req.url.slice(prefix.length);
    next();
  });

  app.use(
    express.json({
      limit: "50mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: "50mb" }));

  // registerRoutes attaches a WebSocket server to this; it never listens here
  await registerRoutes(createServer(app), app);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status || err.statusCode || 500;
    if (status === 500) console.error("[Fatal Error]", err);
    res.status(status).json({ message: err.message || "Internal Server Error" });
  });

  return serverless(app);
}

// Build the app once per function instance and reuse it across invocations
let handlerPromise: ReturnType<typeof createApp> | undefined;

export const handler = async (event: any, context: any) => {
  handlerPromise ??= createApp().catch((err) => {
    handlerPromise = undefined; // retry startup on the next request
    throw err;
  });
  return (await handlerPromise)(event, context);
};
