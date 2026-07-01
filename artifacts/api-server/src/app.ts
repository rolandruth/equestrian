import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import sitemapRouter from "./routes/sitemapRoute";
import { logger } from "./lib/logger";

const app: Express = express();

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
app.use(cors());
// Route-specific parser for CSV import must be mounted BEFORE the global parser so that
// body-parser skips the global pass (it checks req._body) once the route-specific one runs.
// This prevents the 50 MB global limit from accepting oversized import payloads.
app.use("/api/import/csv", express.json({ limit: "6mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Sitemap served at root level (outside /api prefix)
app.use(sitemapRouter);

app.use("/api", router);

export default app;
