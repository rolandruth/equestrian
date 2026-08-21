import {
  db,
  entries,
  directorySettings,
  entryLocations,
  entryServiceTypes,
  serviceTypes,
} from "@workspace/db";
import { injectLessonGuideSeoHtml } from "@workspace/lesson-guides";
import {
  buildListingSeo,
  buildListingStructuredData,
  getListingImageUrl,
  injectListingCrawlerShell,
} from "@workspace/listing-seo";
import { eq, and, sql } from "drizzle-orm";

const DEFAULT_PUBLIC_ORIGIN = "https://www.saddleupguide.com";
const BROWSE_HUB_MIN_COUNT = 10;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceTitle(html: string, title: string): string {
  return html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
}

function replaceMeta(html: string, selectorAttr: "name" | "property", key: string, content: string): string {
  const esc = escapeHtml(content);
  const re = new RegExp(`(<meta\\s+${selectorAttr}="${key}"\\s+content=")[^"]*(")`, "i");
  if (re.test(html)) return html.replace(re, `$1${esc}$2`);
  return html.replace("</head>", `    <meta ${selectorAttr}="${key}" content="${esc}" />\n  </head>`);
}

function replaceCanonical(html: string, href: string): string {
  const esc = escapeHtml(href);
  const re = /<link\s+rel=["']canonical["']\s+href=["'][^"']*["']\s*\/?>/i;
  if (re.test(html)) return html.replace(re, `<link rel="canonical" href="${esc}" />`);
  return html.replace("</head>", `    <link rel="canonical" href="${esc}" />\n  </head>`);
}

function injectJsonLd(html: string, data: unknown, scriptId = "listing-structured-data"): string {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  const script = `    <script id="${scriptId}" type="application/ld+json">${json}</script>\n`;
  const existing = new RegExp(
    `<script\\s+id=["']${scriptId}["'][^>]*>[\\s\\S]*?<\\/script>\\s*`,
    "i",
  );
  if (existing.test(html)) return html.replace(existing, script);
  return html.replace("</head>", `${script}  </head>`);
}

function normalizeOrigin(origin?: string): string {
  return (process.env.PUBLIC_SITE_URL || origin || DEFAULT_PUBLIC_ORIGIN).replace(/\/+$/, "");
}

export function hasQueryParameters(requestSearch: string): boolean {
  const raw = requestSearch.startsWith("?") ? requestSearch.slice(1) : requestSearch;
  return raw.length > 0;
}

/**
 * Rewrites the SPA index.html with route-specific metadata and meaningful
 * listing content so crawlers that don't execute JavaScript can understand it.
 * Returns the original HTML when the route needs no rewriting or on error.
 */
export async function injectSeoMeta(
  html: string,
  path: string,
  origin?: string,
  requestSearch: string = "",
): Promise<string> {
  try {
    const publicOrigin = normalizeOrigin(origin);
    const lessonGuideHtml = injectLessonGuideSeoHtml(html, path, publicOrigin);
    if (lessonGuideHtml !== null) return lessonGuideHtml;

    const entryMatch = path.match(/^\/entry\/([^/?#]+)$/);
    if (entryMatch) {
      const idOrSlug = decodeURIComponent(entryMatch[1]);
      const numericId = /^\d+$/.test(idOrSlug) ? parseInt(idOrSlug, 10) : null;
      const [entry] = await db
        .select({
          id: entries.id,
          slug: entries.slug,
          title: entries.title,
          category: entries.category,
          summary: entries.summary,
          description: entries.description,
          location: entries.location,
          contactPhone: entries.contactPhone,
          website: entries.website,
          customFields: entries.customFields,
          metaTitle: entries.metaTitle,
          metaDescription: entries.metaDescription,
          ogTitle: entries.ogTitle,
          ogDescription: entries.ogDescription,
          latitude: entries.latitude,
          longitude: entries.longitude,
        })
        .from(entries)
        .where(
          and(
            eq(entries.published, true),
            numericId !== null ? eq(entries.id, numericId) : eq(entries.slug, idOrSlug),
          ),
        )
        .limit(1);
      if (!entry) return html;

      const [settingsRows, locationRows, confirmedServices] = await Promise.all([
        db.select({ siteTitle: directorySettings.siteTitle }).from(directorySettings).limit(1),
        db
          .select({
            cityName: entryLocations.cityName,
            stateName: entryLocations.stateName,
            postalCode: entryLocations.postalCode,
          })
          .from(entryLocations)
          .where(and(
            eq(entryLocations.entryId, entry.id),
            eq(entryLocations.locationStatus, "confirmed"),
          ))
          .limit(1),
        db
          .select({
            slug: serviceTypes.slug,
            label: serviceTypes.label,
          })
          .from(entryServiceTypes)
          .innerJoin(serviceTypes, eq(entryServiceTypes.serviceTypeId, serviceTypes.id))
          .where(and(
            eq(entryServiceTypes.entryId, entry.id),
            eq(entryServiceTypes.status, "confirmed"),
          )),
      ]);
      const settings = settingsRows[0];
      const siteTitle = settings?.siteTitle || "Directory";
      const canonicalUrl = `${publicOrigin}/entry/${encodeURIComponent(entry.slug || String(entry.id))}`;
      const categoryUrl = entry.category
        ? `${publicOrigin}/browse/${encodeURIComponent(entry.category)}`
        : `${publicOrigin}/browse`;
      const listingInput = {
        ...entry,
        siteTitle,
        normalizedLocation: locationRows[0] ?? null,
        confirmedServices,
      };
      const seo = buildListingSeo(listingInput);
      const imageUrl = getListingImageUrl(entry.customFields, publicOrigin);
      const structuredData = buildListingStructuredData(listingInput, {
        canonicalUrl,
        origin: publicOrigin,
        categoryUrl,
        imageUrl,
      });

      let out = replaceTitle(html, seo.title);
      out = replaceMeta(out, "name", "description", seo.description);
      out = replaceMeta(out, "property", "og:title", seo.ogTitle);
      out = replaceMeta(out, "property", "og:description", seo.ogDescription);
      out = replaceMeta(out, "property", "og:type", "website");
      out = replaceMeta(out, "property", "og:url", canonicalUrl);
      out = replaceMeta(out, "property", "og:image", imageUrl);
      out = replaceMeta(out, "name", "twitter:card", "summary_large_image");
      out = replaceMeta(out, "name", "twitter:title", seo.ogTitle);
      out = replaceMeta(out, "name", "twitter:description", seo.ogDescription);
      out = replaceMeta(out, "name", "twitter:image", imageUrl);
      out = replaceCanonical(out, canonicalUrl);
      out = injectJsonLd(out, structuredData);
      out = injectListingCrawlerShell(out, listingInput, {
        canonicalUrl,
        categoryUrl: entry.category ? `/browse/${encodeURIComponent(entry.category)}` : null,
      });
      return out;
    }

    if (path === "/browse" || path.startsWith("/browse/")) {
      const [settings] = await db.select({ siteTitle: directorySettings.siteTitle }).from(directorySettings).limit(1);
      const siteTitle = settings?.siteTitle || "Directory";
      const category = path.startsWith("/browse/") ? decodeURIComponent(path.slice("/browse/".length)) : null;
      let categoryQualified = true;
      if (category) {
        const [categoryCount] = await db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(entries)
          .where(and(eq(entries.published, true), eq(entries.category, category)));
        categoryQualified = Number(categoryCount?.count ?? 0) >= BROWSE_HUB_MIN_COUNT;
      }
      const title = category ? `${category} | Browse ${siteTitle}` : `Browse All Listings | ${siteTitle}`;
      const desc = category
        ? `Browse ${category} equestrian businesses, services, riding programs, and local resources on ${siteTitle}.`
        : `Browse equestrian businesses, riding programs, trainers, stables, and local services on ${siteTitle}.`;
      const canonicalUrl = `${publicOrigin}${category ? `/browse/${encodeURIComponent(category)}` : "/browse"}`;
      const robots = hasQueryParameters(requestSearch) || !categoryQualified
        ? "noindex,follow"
        : "index,follow";
      let out = replaceTitle(html, title);
      out = replaceMeta(out, "name", "description", desc);
      out = replaceMeta(out, "name", "robots", robots);
      out = replaceMeta(out, "property", "og:title", title);
      out = replaceMeta(out, "property", "og:description", desc);
      out = replaceMeta(out, "property", "og:url", canonicalUrl);
      out = replaceMeta(out, "name", "twitter:title", title);
      out = replaceMeta(out, "name", "twitter:description", desc);
      out = replaceCanonical(out, canonicalUrl);
      return out;
    }

    if (path === "/") {
      const [settings] = await db
        .select({
          metaTitle: directorySettings.homepageMetaTitle,
          metaDescription: directorySettings.homepageMetaDescription,
        })
        .from(directorySettings)
        .limit(1);
      let out = html;
      if (settings?.metaTitle) {
        out = replaceTitle(out, settings.metaTitle);
        out = replaceMeta(out, "property", "og:title", settings.metaTitle);
        out = replaceMeta(out, "name", "twitter:title", settings.metaTitle);
      }
      if (settings?.metaDescription) {
        out = replaceMeta(out, "name", "description", settings.metaDescription);
        out = replaceMeta(out, "property", "og:description", settings.metaDescription);
        out = replaceMeta(out, "name", "twitter:description", settings.metaDescription);
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
