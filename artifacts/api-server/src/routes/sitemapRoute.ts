import { Router } from "express";
import { db } from "@workspace/db";
import { entries } from "@workspace/db";
import { getLessonGuidePath, lessonGuides, LESSON_GUIDE_BASE_PATH } from "@workspace/lesson-guides";
import { and, eq, isNotNull, sql } from "drizzle-orm";

const router = Router();
const PUBLIC_ORIGIN = (process.env.PUBLIC_SITE_URL || "https://www.saddleupguide.com").replace(/\/+$/, "");
const EARLIEST_REASONABLE_LASTMOD = Date.UTC(2000, 0, 1);
const FUTURE_DATE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export type SitemapPage = {
  loc: string;
  priority: string;
  changefreq: string;
  lastmod?: string;
};

// ── Thresholds (must match serve.mjs) ───────────────────────────────────────
const THRESHOLD = {
  stateCategory: 10,
  cityConfirmed: 8,
  serviceGlobal: 10,
  stateService: 8,
  cityService: 5,
  cityServiceDistinct: 3,
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function formatSitemapLastmod(
  value: unknown,
  nowMs: number = Date.now(),
): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (
    !(value instanceof Date)
    && typeof value !== "string"
    && typeof value !== "number"
  ) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  if (
    !Number.isFinite(timestamp)
    || timestamp < EARLIEST_REASONABLE_LASTMOD
    || timestamp > nowMs + FUTURE_DATE_TOLERANCE_MS
  ) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

export function dedupeSitemapPages(pages: SitemapPage[]): SitemapPage[] {
  const seen = new Set<string>();
  return pages.filter((page) => {
    if (seen.has(page.loc)) return false;
    seen.add(page.loc);
    return true;
  });
}

export function buildSitemapXml(
  pages: SitemapPage[],
  publicOrigin: string = PUBLIC_ORIGIN,
): string {
  const origin = publicOrigin.replace(/\/+$/, "");
  const urlElements = pages
    .map((page) => {
      const lastmod = page.lastmod
        ? `\n    <lastmod>${escapeXml(page.lastmod)}</lastmod>`
        : "";
      return `  <url>
    <loc>${escapeXml(origin + page.loc)}</loc>${lastmod}
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements}
</urlset>`;
}

// ── Safe raw query wrapper ───────────────────────────────────────────────────
// Returns null when new tables/columns are not yet migrated.
async function safeRawQuery<T>(
  queryFn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await queryFn();
  } catch (err: unknown) {
    const e = err as { message?: string; code?: string };
    const msg = e?.message || "";
    if (
      msg.includes("does not exist") ||
      msg.includes("column") ||
      msg.includes("relation") ||
      e?.code === "42703" || // undefined_column
      e?.code === "42P01"    // undefined_table
    ) {
      return null;
    }
    throw err;
  }
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
    // ── Static pages ─────────────────────────────────────────────────────────
    const staticPages = [
      { loc: "/", priority: "1.0", changefreq: "daily" },
      { loc: "/browse", priority: "0.8", changefreq: "daily" },
      { loc: "/listing-plans", priority: "0.5", changefreq: "monthly" },
      { loc: "/advertise", priority: "0.5", changefreq: "monthly" },
      { loc: "/contact", priority: "0.4", changefreq: "monthly" },
      { loc: "/privacy-policy", priority: "0.2", changefreq: "yearly" },
      { loc: "/terms", priority: "0.2", changefreq: "yearly" },
    ];

    const guidePages = [
      { loc: LESSON_GUIDE_BASE_PATH, priority: "0.75", changefreq: "monthly" },
      ...lessonGuides.map((guide) => ({
        loc: getLessonGuidePath(guide.slug),
        priority: "0.65",
        changefreq: "monthly",
      })),
    ];

    // ── Entry pages ──────────────────────────────────────────────────────────
    const publishedEntries = await db
      .select({ id: entries.id, slug: entries.slug, updatedAt: entries.updatedAt })
      .from(entries)
      .where(eq(entries.published, true));

    const entryPages = publishedEntries.map((e: { id: number; slug: string | null; updatedAt: Date | null }) => ({
      loc: `/entry/${encodeURIComponent(e.slug || String(e.id))}`,
      priority: "0.6",
      changefreq: "weekly",
      lastmod: formatSitemapLastmod(e.updatedAt),
    }));

    // ── Category (browse) pages – only those with >= threshold entries ───────
    // Qualified state /browse/:category pages (threshold = 10 published)
    // Uses raw SQL to do the GROUP BY + HAVING; fail-safe wrapper not needed
    // since this only uses the core entries table which always exists.
    const categoryCountRows = await db
      .select({
        category: entries.category,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(entries)
      .where(
        and(
          eq(entries.published, true),
          isNotNull(entries.category),
          sql`btrim(${entries.category}) <> ''`,
        ),
      )
      .groupBy(entries.category)
      .having(sql`count(*) >= ${THRESHOLD.stateCategory}`);

    type CategoryCountRow = { category: string | null; count: number };
    const categoryPages = (categoryCountRows as CategoryCountRow[])
      .filter((row): row is { category: string; count: number } => Boolean(row.category?.trim()))
      .map((row) => ({
        loc: `/browse/${encodeURIComponent(row.category)}`,
        priority: "0.7",
        changefreq: "daily",
      }));

    // ── New local SEO pages (fail-safe: return [] if schema not applied) ─────
    // City pages (/locations/:stateSlug/:citySlug)
    // location_status, city_slug, state_slug live on entry_locations, not entries.
    const cityPagesRaw = await safeRawQuery(async () => {
      const result = await db.execute(
        sql`SELECT el.city_slug, el.state_slug
            FROM entry_locations el
            JOIN entries e ON e.id = el.entry_id AND e.published = true
            WHERE el.location_status = 'confirmed'
              AND el.city_slug IS NOT NULL
              AND el.state_slug IS NOT NULL
            GROUP BY el.city_slug, el.state_slug
            HAVING count(*) >= ${THRESHOLD.cityConfirmed}`,
      );
      return result.rows as Array<{ city_slug: string; state_slug: string }>;
    });
    const cityPages = (cityPagesRaw || []).map((r) => ({
      loc: `/locations/${encodeURIComponent(r.state_slug)}/${encodeURIComponent(r.city_slug)}`,
      priority: "0.7",
      changefreq: "weekly",
    }));

    // Global service pages (/services/:serviceSlug)
    // service_types has no 'name' column; slug is the identifier used in URLs.
    const servicePagesRaw = await safeRawQuery(async () => {
      const result = await db.execute(
        sql`SELECT st.slug AS service_slug
            FROM service_types st
            JOIN entry_service_types est ON est.service_type_id = st.id AND est.status = 'confirmed'
            JOIN entries e ON e.id = est.entry_id AND e.published = true
            GROUP BY st.slug
            HAVING count(est.entry_id) >= ${THRESHOLD.serviceGlobal}`,
      );
      return result.rows as Array<{ service_slug: string }>;
    });
    const servicePages = (servicePagesRaw || []).map((r) => ({
      loc: `/services/${encodeURIComponent(r.service_slug)}`,
      priority: "0.7",
      changefreq: "weekly",
    }));

    // State-service pages (/services/:serviceSlug/:stateSlug)
    // state_slug lives on entry_locations, not entries.
    // Require el.location_status = 'confirmed' to exclude manual_review/rejected.
    const stateServicePagesRaw = await safeRawQuery(async () => {
      const result = await db.execute(
        sql`SELECT st.slug AS service_slug, el.state_slug
            FROM service_types st
            JOIN entry_service_types est ON est.service_type_id = st.id AND est.status = 'confirmed'
            JOIN entries e ON e.id = est.entry_id AND e.published = true
            JOIN entry_locations el ON el.entry_id = e.id AND el.location_status = 'confirmed'
            WHERE el.state_slug IS NOT NULL
            GROUP BY st.slug, el.state_slug
            HAVING count(est.entry_id) >= ${THRESHOLD.stateService}`,
      );
      return result.rows as Array<{ service_slug: string; state_slug: string }>;
    });
    const stateServicePages = (stateServicePagesRaw || []).map((r) => ({
      loc: `/services/${encodeURIComponent(r.service_slug)}/${encodeURIComponent(r.state_slug)}`,
      priority: "0.65",
      changefreq: "weekly",
    }));

    // City-service pages (/services/:serviceSlug/:stateSlug/:citySlug)
    // city_slug + state_slug live on entry_locations, not entries.
    // Require el.location_status = 'confirmed' to exclude manual_review/rejected.
    // cityService (>=5) is binding; cityServiceDistinct (>=3) is already satisfied
    // by it since both count the same set of distinct published entries.
    const cityServicePagesRaw = await safeRawQuery(async () => {
      const result = await db.execute(
        sql`SELECT st.slug AS service_slug, el.state_slug, el.city_slug
            FROM service_types st
            JOIN entry_service_types est ON est.service_type_id = st.id AND est.status = 'confirmed'
            JOIN entries e ON e.id = est.entry_id AND e.published = true
            JOIN entry_locations el ON el.entry_id = e.id AND el.location_status = 'confirmed'
            WHERE el.state_slug IS NOT NULL AND el.city_slug IS NOT NULL
            GROUP BY st.slug, el.state_slug, el.city_slug
            HAVING count(DISTINCT e.id) >= ${THRESHOLD.cityService}`,
      );
      return result.rows as Array<{ service_slug: string; state_slug: string; city_slug: string }>;
    });
    const cityServicePages = (cityServicePagesRaw || []).map((r) => ({
      loc: `/services/${encodeURIComponent(r.service_slug)}/${encodeURIComponent(r.state_slug)}/${encodeURIComponent(r.city_slug)}`,
      priority: "0.6",
      changefreq: "weekly",
    }));

    // ── Deduplicate and assemble ──────────────────────────────────────────────
    const allPages = dedupeSitemapPages([
      ...staticPages,
      ...guidePages,
      ...categoryPages,
      ...entryPages,
      ...cityPages,
      ...servicePages,
      ...stateServicePages,
      ...cityServicePages,
    ] satisfies SitemapPage[]);

    const xml = buildSitemapXml(allPages);

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  } catch (err) {
    req.log.error({ err }, "Failed to generate sitemap");
    res.status(500).send("Failed to generate sitemap");
  }
});

export default router;
