import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import http from "http";
import fs from "fs";
import path from "path";
import router from "./routes";
import { injectSeoMeta } from "./lib/seoHtml";
import sitemapRouter from "./routes/sitemapRoute";
import { logger } from "./lib/logger";
import { bizAuthMiddleware } from "./middlewares/bizAuthMiddleware.js";

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

// Routes whose HTML gets server-side SEO meta injection for crawlers.
const SEO_PATH_RE = /^\/($|browse(\/|$)|entry\/)/;

// Dev-only: proxy all non-API requests to the Vite frontend (port 19179).
// This makes the canvas iframe work when it hits the API server directly.
// For public SEO routes, the proxied HTML is buffered and rewritten with
// route-specific title/description/OG tags so crawlers see correct metadata.
if (process.env.NODE_ENV !== "production") {
  const VITE_PORT = 19179;
  app.use((req: Request, res: Response) => {
    const wantsSeo = req.method === "GET" && SEO_PATH_RE.test(req.path);
    const headers = { ...req.headers, host: `127.0.0.1:${VITE_PORT}` };
    if (wantsSeo) delete headers["accept-encoding"]; // need plain text to transform
    const options = {
      hostname: "127.0.0.1",
      port: VITE_PORT,
      path: req.url,
      method: req.method,
      headers,
    };
    const proxy = http.request(options, (proxyRes) => {
      const isHtml = String(proxyRes.headers["content-type"] || "").includes("text/html");
      if (wantsSeo && isHtml) {
        const chunks: Buffer[] = [];
        proxyRes.on("data", (c) => chunks.push(c));
        proxyRes.on("end", async () => {
          const html = Buffer.concat(chunks).toString("utf8");
          const out = await injectSeoMeta(html, req.path);
          const { "content-length": _cl, ...rest } = proxyRes.headers;
          res.writeHead(proxyRes.statusCode ?? 200, rest);
          res.end(out);
        });
        return;
      }
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });
    proxy.on("error", () => {
      res.status(502).send("Vite server unavailable");
    });
    req.pipe(proxy, { end: true });
  });
} else {
  // Production: serve the built web frontend with the same SEO meta injection.
  // Harmless if the platform routes the web artifact separately — this branch
  // then simply never receives page requests.
  const webDist = path.resolve(import.meta.dirname, "../../directory-master/dist/public");
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist, { index: false }));
    app.get("/{*path}", async (req: Request, res: Response) => {
      try {
        const html = fs.readFileSync(path.join(webDist, "index.html"), "utf8");
        res.type("html").send(await injectSeoMeta(html, req.path));
      } catch {
        res.status(404).send("Not found");
      }
    });
  }
}

export default app;
