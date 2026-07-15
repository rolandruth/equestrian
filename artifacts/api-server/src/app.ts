import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import http from "http";
import router from "./routes";
import sitemapRouter from "./routes/sitemapRoute";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers";
import { bizAuthMiddleware } from "./middlewares/bizAuthMiddleware.js";

const app: Express = express();

// Stripe webhook — MUST be registered before express.json() so it receives raw Buffer
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature" });
      return;
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error({ err }, "Stripe webhook error");
      res.status(400).json({ error: "Webhook processing error" });
    }
  }
);

// Disable ETags globally — ETag + If-None-Match causes the browser to serve
// stale 304 responses for API data (e.g. settings) even after a PATCH saves
// new values. No-store ensures clients always fetch fresh data.
app.set("etag", false);
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
// Route-specific parser for CSV import must be mounted BEFORE the global parser so that
// body-parser skips the global pass (it checks req._body) once the route-specific one runs.
// This prevents the 50 MB global limit from accepting oversized import payloads.
app.use("/api/import/csv", express.json({ limit: "6mb" }));
app.use("/api/ads/upload-image", express.json({ limit: "6mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use("/api", bizAuthMiddleware);

// Sitemap served at root level (outside /api prefix)
app.use(sitemapRouter);

app.use("/api", router);

// Dev-only: proxy all non-API requests to the Vite frontend (port 19179).
// This makes the canvas iframe work when it hits the API server directly.
if (process.env.NODE_ENV !== "production") {
  const VITE_PORT = 19179;
  app.use((req: Request, res: Response) => {
    const options = {
      hostname: "127.0.0.1",
      port: VITE_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${VITE_PORT}` },
    };
    const proxy = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });
    proxy.on("error", () => {
      res.status(502).send("Vite server unavailable");
    });
    req.pipe(proxy, { end: true });
  });
}

export default app;
