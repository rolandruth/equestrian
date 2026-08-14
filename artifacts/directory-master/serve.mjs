// Production server for the built SPA.
// Serves dist/public and injects per-route SEO meta tags (title, description,
// OG tags) into index.html so crawlers that don't run JavaScript see correct
// metadata for the homepage, browse pages, and individual entry pages.
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist/public");
const port = Number(process.env.PORT);
if (!port) throw new Error("PORT environment variable is required");

const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
  : null;

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const replaceTitle = (html, title) =>
  html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);

function replaceMeta(html, attr, key, content) {
  const esc = escapeHtml(content);
  const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, "i");
  if (re.test(html)) return html.replace(re, `$1${esc}$2`);
  return html.replace("</head>", `    <meta ${attr}="${key}" content="${esc}" />\n  </head>`);
}

async function injectSeoMeta(html, reqPath) {
  if (!pool) return html;
  try {
    const entryMatch = reqPath.match(/^\/entry\/([^/?#]+)$/);
    if (entryMatch) {
      const idOrSlug = decodeURIComponent(entryMatch[1]);
      const isNumeric = /^\d+$/.test(idOrSlug);
      const { rows } = await pool.query(
        `SELECT e.title, e.summary, e.meta_title, e.meta_description, s.site_title
         FROM entries e, directory_settings s
         WHERE e.published = true AND ${isNumeric ? "e.id = $1::int" : "e.slug = $1"}
         LIMIT 1`,
        [idOrSlug],
      );
      if (!rows[0]) return html;
      const r = rows[0];
      const title = r.meta_title || `${r.title} | ${r.site_title || "Directory"}`;
      const desc = String(r.meta_description || r.summary || "").replace(/\s+/g, " ").trim().slice(0, 160);
      let out = replaceTitle(html, title);
      out = replaceMeta(out, "name", "description", desc);
      out = replaceMeta(out, "property", "og:title", title);
      out = replaceMeta(out, "property", "og:description", desc);
      out = replaceMeta(out, "property", "og:type", "article");
      return out;
    }
    if (reqPath === "/browse" || reqPath.startsWith("/browse/")) {
      const { rows } = await pool.query("SELECT site_title FROM directory_settings LIMIT 1");
      const siteTitle = rows[0]?.site_title || "Directory";
      const category = reqPath.startsWith("/browse/")
        ? decodeURIComponent(reqPath.slice("/browse/".length))
        : null;
      return replaceTitle(html, category ? `${category} | Browse ${siteTitle}` : `Browse All Listings | ${siteTitle}`);
    }
    if (reqPath === "/") {
      const { rows } = await pool.query(
        "SELECT homepage_meta_title, homepage_meta_description FROM directory_settings LIMIT 1",
      );
      const s = rows[0];
      let out = html;
      if (s?.homepage_meta_title) {
        out = replaceTitle(out, s.homepage_meta_title);
        out = replaceMeta(out, "property", "og:title", s.homepage_meta_title);
      }
      if (s?.homepage_meta_description) {
        out = replaceMeta(out, "name", "description", s.homepage_meta_description);
        out = replaceMeta(out, "property", "og:description", s.homepage_meta_description);
      }
      return out;
    }
    return html;
  } catch {
    return html;
  }
}

const app = express();
app.use(express.static(distDir, { index: false }));
app.get("/{*path}", async (req, res) => {
  try {
    const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
    res.type("html").send(await injectSeoMeta(html, req.path));
  } catch {
    res.status(404).send("Not found");
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`web server listening on ${port}`);
});
