import { Router } from "express";
import { db } from "@workspace/db";
import { entries } from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";

const router = Router();
const PUBLIC_ORIGIN = (process.env.PUBLIC_SITE_URL || "https://www.saddleupguide.com").replace(/\/+$/, "");

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

router.get("/robots.txt", (req, res) => {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /business
Disallow: /api

Sitemap: ${PUBLIC_ORIGIN}/sitemap.xml
`);
});

router.get("/sitemap.xml", async (req, res) => {
  try {
    const [publishedEntries, publishedCategories] = await Promise.all([
      db
        .select({ id: entries.id, slug: entries.slug, updatedAt: entries.updatedAt })
        .from(entries)
        .where(eq(entries.published, true)),
      db
        .selectDistinct({ category: entries.category })
        .from(entries)
        .where(and(eq(entries.published, true), isNotNull(entries.category))),
    ]);

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

    const categoryPages = publishedCategories
      .filter((row): row is { category: string } => Boolean(row.category?.trim()))
      .map((row) => ({
        loc: `/browse/${encodeURIComponent(row.category)}`,
        priority: "0.7",
        changefreq: "daily",
        lastmod: now,
      }));

    const entryPages = publishedEntries.map((e) => ({
      loc: `/entry/${encodeURIComponent(e.slug || String(e.id))}`,
      priority: "0.6",
      changefreq: "weekly",
      lastmod: e.updatedAt ? new Date(e.updatedAt).toISOString().split("T")[0] : now,
    }));

    const allPages = [...staticPages, ...categoryPages, ...entryPages];

    const urlElements = allPages
      .map(
        (p) => `  <url>
    <loc>${escapeXml(PUBLIC_ORIGIN + p.loc)}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
      )
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements}
</urlset>`;

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  } catch (err) {
    req.log.error({ err }, "Failed to generate sitemap");
    res.status(500).send("Failed to generate sitemap");
  }
});

export default router;
