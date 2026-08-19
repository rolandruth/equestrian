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
const publicOrigin = (process.env.PUBLIC_SITE_URL || "https://www.saddleupguide.com").replace(/\/+$/, "");

const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
  : null;

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const escapeXml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const replaceTitle = (html, title) =>
  html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);

function replaceMeta(html, attr, key, content) {
  const esc = escapeHtml(content);
  const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, "i");
  if (re.test(html)) return html.replace(re, `$1${esc}$2`);
  return html.replace("</head>", `    <meta ${attr}="${key}" content="${esc}" />\n  </head>`);
}

function replaceCanonical(html, href) {
  const esc = escapeHtml(href);
  const re = /<link\s+rel=["']canonical["']\s+href=["'][^"']*["']\s*\/?>/i;
  if (re.test(html)) return html.replace(re, `<link rel="canonical" href="${esc}" />`);
  return html.replace("</head>", `    <link rel="canonical" href="${esc}" />\n  </head>`);
}

function injectJsonLd(html, data) {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  const script = `    <script id="listing-structured-data" type="application/ld+json">${json}</script>\n`;
  const existing = /<script\s+id=["']listing-structured-data["'][^>]*>[\s\S]*?<\/script>\s*/i;
  if (existing.test(html)) return html.replace(existing, script);
  return html.replace("</head>", `${script}  </head>`);
}

function toAbsoluteUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, publicOrigin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function findImage(customFields) {
  if (customFields && typeof customFields === "object") {
    for (const value of Object.values(customFields)) {
      if (typeof value !== "string") continue;
      const url = toAbsoluteUrl(value);
      if (url && /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(url)) return url;
    }
  }
  return `${publicOrigin}/opengraph.jpg`;
}

function injectEntryShell(html, entry, canonicalUrl) {
  const categoryUrl = entry.category ? `/browse/${encodeURIComponent(entry.category)}` : null;
  const websiteUrl = toAbsoluteUrl(entry.website);
  const details = [
    entry.category
      ? `<dt>Category</dt><dd><a href="${escapeHtml(categoryUrl)}">${escapeHtml(entry.category)}</a></dd>`
      : "",
    entry.location ? `<dt>Location</dt><dd>${escapeHtml(entry.location)}</dd>` : "",
    entry.contact_phone ? `<dt>Phone</dt><dd>${escapeHtml(entry.contact_phone)}</dd>` : "",
    websiteUrl
      ? `<dt>Website</dt><dd><a href="${escapeHtml(websiteUrl)}" rel="noopener noreferrer">${escapeHtml(websiteUrl.replace(/^https?:\/\/(www\.)?/, ""))}</a></dd>`
      : "",
  ].filter(Boolean).join("");
  const description = String(entry.description || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
  const breadcrumbs = [
    `<a href="/">Home</a>`,
    `<a href="/browse">Browse</a>`,
    entry.category && categoryUrl ? `<a href="${escapeHtml(categoryUrl)}">${escapeHtml(entry.category)}</a>` : "",
    `<span aria-current="page">${escapeHtml(entry.title)}</span>`,
  ].filter(Boolean).join("<span aria-hidden=\"true\"> / </span>");
  const shell = `<article class="seo-entry-shell">
    <nav aria-label="Breadcrumb">${breadcrumbs}</nav>
    <h1>${escapeHtml(entry.title)}</h1>
    ${entry.summary ? `<p class="seo-entry-summary">${escapeHtml(entry.summary)}</p>` : ""}
    ${details ? `<dl>${details}</dl>` : ""}
    ${description ? `<section aria-label="About ${escapeHtml(entry.title)}">${description}</section>` : ""}
    <p><a href="${escapeHtml(canonicalUrl)}">View the complete ${escapeHtml(entry.title)} listing</a></p>
  </article>`;
  const root = /<div\s+id=["']root["']\s*><\/div>/i;
  if (!root.test(html)) return html;
  let out = html.replace(root, `<div id="root">${shell}</div>`);
  if (!out.includes("id=\"seo-entry-shell-styles\"")) {
    out = out.replace(
      "</head>",
      `    <style id="seo-entry-shell-styles">.seo-entry-shell{box-sizing:border-box;max-width:960px;margin:0 auto;padding:32px 24px;font:16px/1.6 system-ui,sans-serif;color:#292524}.seo-entry-shell nav{font-size:14px;margin-bottom:24px}.seo-entry-shell h1{font-size:clamp(28px,5vw,42px);line-height:1.15;margin:0 0 16px}.seo-entry-summary{font-size:19px}.seo-entry-shell dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;margin:24px 0}.seo-entry-shell dt{font-weight:700}.seo-entry-shell dd{margin:0}.seo-entry-shell a{color:#1d4ed8}</style>\n  </head>`,
    );
  }
  return out;
}

async function injectSeoMeta(html, reqPath) {
  if (!pool) return html;
  try {
    const entryMatch = reqPath.match(/^\/entry\/([^/?#]+)$/);
    if (entryMatch) {
      const idOrSlug = decodeURIComponent(entryMatch[1]);
      const isNumeric = /^\d+$/.test(idOrSlug);
      const { rows } = await pool.query(
        `SELECT e.id, e.slug, e.title, e.category, e.summary, e.description,
                e.location, e.contact_phone, e.website, e.custom_fields,
                e.meta_title, e.meta_description, e.og_title, e.og_description,
                e.latitude, e.longitude, s.site_title
         FROM entries e, directory_settings s
         WHERE e.published = true AND ${isNumeric ? "e.id = $1::int" : "e.slug = $1"}
         LIMIT 1`,
        [idOrSlug],
      );
      if (!rows[0]) return html;
      const r = rows[0];
      const title = r.meta_title || `${r.title} | ${r.site_title || "Directory"}`;
      const desc = String(r.meta_description || r.summary || "").replace(/\s+/g, " ").trim().slice(0, 160);
      const canonicalUrl = `${publicOrigin}/entry/${encodeURIComponent(r.slug || String(r.id))}`;
      const categoryUrl = r.category
        ? `${publicOrigin}/browse/${encodeURIComponent(r.category)}`
        : `${publicOrigin}/browse`;
      const imageUrl = findImage(r.custom_fields);
      const structuredData = {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "LocalBusiness",
            "@id": `${canonicalUrl}#business`,
            name: r.title,
            description: r.description || r.summary || undefined,
            url: canonicalUrl,
            image: imageUrl,
            telephone: r.contact_phone || undefined,
            address: r.location || undefined,
            sameAs: toAbsoluteUrl(r.website) || undefined,
            geo: r.latitude != null && r.longitude != null
              ? {
                  "@type": "GeoCoordinates",
                  latitude: r.latitude,
                  longitude: r.longitude,
                }
              : undefined,
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: `${publicOrigin}/` },
              { "@type": "ListItem", position: 2, name: "Browse", item: `${publicOrigin}/browse` },
              ...(r.category
                ? [{ "@type": "ListItem", position: 3, name: r.category, item: categoryUrl }]
                : []),
              {
                "@type": "ListItem",
                position: r.category ? 4 : 3,
                name: r.title,
                item: canonicalUrl,
              },
            ],
          },
        ],
      };
      let out = replaceTitle(html, title);
      out = replaceMeta(out, "name", "description", desc);
      out = replaceMeta(out, "property", "og:title", r.og_title || title);
      out = replaceMeta(out, "property", "og:description", r.og_description || desc);
      out = replaceMeta(out, "property", "og:type", "website");
      out = replaceMeta(out, "property", "og:url", canonicalUrl);
      out = replaceMeta(out, "property", "og:image", imageUrl);
      out = replaceMeta(out, "name", "twitter:card", "summary_large_image");
      out = replaceMeta(out, "name", "twitter:title", r.og_title || title);
      out = replaceMeta(out, "name", "twitter:description", r.og_description || desc);
      out = replaceMeta(out, "name", "twitter:image", imageUrl);
      out = replaceCanonical(out, canonicalUrl);
      out = injectJsonLd(out, structuredData);
      out = injectEntryShell(out, r, canonicalUrl);
      return out;
    }
    if (reqPath === "/browse" || reqPath.startsWith("/browse/")) {
      const { rows } = await pool.query("SELECT site_title FROM directory_settings LIMIT 1");
      const siteTitle = rows[0]?.site_title || "Directory";
      const category = reqPath.startsWith("/browse/")
        ? decodeURIComponent(reqPath.slice("/browse/".length))
        : null;
      const title = category ? `${category} | Browse ${siteTitle}` : `Browse All Listings | ${siteTitle}`;
      const desc = category
        ? `Browse ${category} equestrian businesses, services, riding programs, and local resources on ${siteTitle}.`
        : `Browse equestrian businesses, riding programs, trainers, stables, and local services on ${siteTitle}.`;
      const canonicalUrl = `${publicOrigin}${category ? `/browse/${encodeURIComponent(category)}` : "/browse"}`;
      let out = replaceTitle(html, title);
      out = replaceMeta(out, "name", "description", desc);
      out = replaceMeta(out, "property", "og:title", title);
      out = replaceMeta(out, "property", "og:description", desc);
      out = replaceMeta(out, "property", "og:url", canonicalUrl);
      out = replaceMeta(out, "name", "twitter:title", title);
      out = replaceMeta(out, "name", "twitter:description", desc);
      out = replaceCanonical(out, canonicalUrl);
      return out;
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
        out = replaceMeta(out, "name", "twitter:title", s.homepage_meta_title);
      }
      if (s?.homepage_meta_description) {
        out = replaceMeta(out, "name", "description", s.homepage_meta_description);
        out = replaceMeta(out, "property", "og:description", s.homepage_meta_description);
        out = replaceMeta(out, "name", "twitter:description", s.homepage_meta_description);
      }
      out = replaceMeta(out, "property", "og:url", `${publicOrigin}/`);
      out = replaceCanonical(out, `${publicOrigin}/`);
      return out;
    }
    return html;
  } catch {
    return html;
  }
}

const app = express();

app.get("/robots.txt", (_req, res) => {
  res.type("text").send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /business
Disallow: /api

Sitemap: ${publicOrigin}/sitemap.xml
`);
});

app.get("/sitemap.xml", async (_req, res) => {
  try {
    const now = new Date().toISOString().split("T")[0];
    const staticPages = [
      { loc: "/", priority: "1.0", changefreq: "daily", lastmod: now },
      { loc: "/browse", priority: "0.8", changefreq: "daily", lastmod: now },
      { loc: "/listing-plans", priority: "0.5", changefreq: "monthly", lastmod: now },
      { loc: "/advertise", priority: "0.5", changefreq: "monthly", lastmod: now },
      { loc: "/contact", priority: "0.4", changefreq: "monthly", lastmod: now },
      { loc: "/privacy-policy", priority: "0.2", changefreq: "yearly", lastmod: now },
      { loc: "/terms", priority: "0.2", changefreq: "yearly", lastmod: now },
    ];
    let categoryPages = [];
    let entryPages = [];
    if (pool) {
      const [{ rows: entryRows }, { rows: categoryRows }] = await Promise.all([
        pool.query(
          "SELECT id, slug, updated_at FROM entries WHERE published = true",
        ),
        pool.query(
          `SELECT DISTINCT category
           FROM entries
           WHERE published = true AND category IS NOT NULL AND btrim(category) <> ''`,
        ),
      ]);
      categoryPages = categoryRows.map((row) => ({
        loc: `/browse/${encodeURIComponent(row.category)}`,
        priority: "0.7",
        changefreq: "daily",
        lastmod: now,
      }));
      entryPages = entryRows.map((row) => ({
        loc: `/entry/${encodeURIComponent(row.slug || String(row.id))}`,
        priority: "0.6",
        changefreq: "weekly",
        lastmod: row.updated_at
          ? new Date(row.updated_at).toISOString().split("T")[0]
          : now,
      }));
    }
    const urls = [...staticPages, ...categoryPages, ...entryPages]
      .map(
        (page) => `  <url>
    <loc>${escapeXml(publicOrigin + page.loc)}</loc>
    <lastmod>${page.lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
      )
      .join("\n");
    res
      .type("application/xml")
      .set("Cache-Control", "public, max-age=3600")
      .send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`);
  } catch {
    res.status(500).type("text").send("Failed to generate sitemap");
  }
});

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
