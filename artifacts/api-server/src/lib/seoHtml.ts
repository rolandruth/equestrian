import { db, entries, directorySettings } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const DEFAULT_PUBLIC_ORIGIN = "https://www.saddleupguide.com";

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

function injectJsonLd(html: string, data: unknown): string {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  const script = `    <script id="listing-structured-data" type="application/ld+json">${json}</script>\n`;
  const existing = /<script\s+id=["']listing-structured-data["'][^>]*>[\s\S]*?<\/script>\s*/i;
  if (existing.test(html)) return html.replace(existing, script);
  return html.replace("</head>", `${script}  </head>`);
}

function normalizeOrigin(origin?: string): string {
  return (process.env.PUBLIC_SITE_URL || origin || DEFAULT_PUBLIC_ORIGIN).replace(/\/+$/, "");
}

function toAbsoluteUrl(value: string | null | undefined, origin: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function findImage(customFields: unknown, origin: string): string {
  if (customFields && typeof customFields === "object") {
    for (const value of Object.values(customFields as Record<string, unknown>)) {
      if (typeof value !== "string") continue;
      const url = toAbsoluteUrl(value, origin);
      if (url && /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(url)) return url;
    }
  }
  return `${origin}/opengraph.jpg`;
}

function injectEntryShell(
  html: string,
  entry: {
    title: string;
    category: string | null;
    summary: string | null;
    description: string | null;
    location: string | null;
    contactPhone: string | null;
    website: string | null;
  },
  canonicalUrl: string,
): string {
  const categoryUrl = entry.category ? `/browse/${encodeURIComponent(entry.category)}` : null;
  const websiteUrl = toAbsoluteUrl(entry.website, new URL(canonicalUrl).origin);
  const details = [
    entry.category
      ? `<dt>Category</dt><dd><a href="${escapeHtml(categoryUrl!)}">${escapeHtml(entry.category)}</a></dd>`
      : "",
    entry.location ? `<dt>Location</dt><dd>${escapeHtml(entry.location)}</dd>` : "",
    entry.contactPhone ? `<dt>Phone</dt><dd>${escapeHtml(entry.contactPhone)}</dd>` : "",
    websiteUrl
      ? `<dt>Website</dt><dd><a href="${escapeHtml(websiteUrl)}" rel="noopener noreferrer">${escapeHtml(websiteUrl.replace(/^https?:\/\/(www\.)?/, ""))}</a></dd>`
      : "",
  ].filter(Boolean).join("");
  const description = (entry.description || "")
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

/**
 * Rewrites the SPA index.html with route-specific metadata and meaningful
 * listing content so crawlers that don't execute JavaScript can understand it.
 * Returns the original HTML when the route needs no rewriting or on error.
 */
export async function injectSeoMeta(html: string, path: string, origin?: string): Promise<string> {
  try {
    const publicOrigin = normalizeOrigin(origin);
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

      const [settings] = await db.select({ siteTitle: directorySettings.siteTitle }).from(directorySettings).limit(1);
      const siteTitle = settings?.siteTitle || "Directory";
      const title = entry.metaTitle || `${entry.title} | ${siteTitle}`;
      const desc = (entry.metaDescription || entry.summary || "").replace(/\s+/g, " ").trim().slice(0, 160);
      const canonicalUrl = `${publicOrigin}/entry/${encodeURIComponent(entry.slug || String(entry.id))}`;
      const categoryUrl = entry.category
        ? `${publicOrigin}/browse/${encodeURIComponent(entry.category)}`
        : `${publicOrigin}/browse`;
      const imageUrl = findImage(entry.customFields, publicOrigin);
      const structuredData = {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "LocalBusiness",
            "@id": `${canonicalUrl}#business`,
            name: entry.title,
            description: entry.description || entry.summary || undefined,
            url: canonicalUrl,
            image: imageUrl,
            telephone: entry.contactPhone || undefined,
            address: entry.location || undefined,
            sameAs: toAbsoluteUrl(entry.website, publicOrigin) || undefined,
            geo: entry.latitude != null && entry.longitude != null
              ? {
                  "@type": "GeoCoordinates",
                  latitude: entry.latitude,
                  longitude: entry.longitude,
                }
              : undefined,
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: `${publicOrigin}/` },
              { "@type": "ListItem", position: 2, name: "Browse", item: `${publicOrigin}/browse` },
              ...(entry.category
                ? [{ "@type": "ListItem", position: 3, name: entry.category, item: categoryUrl }]
                : []),
              {
                "@type": "ListItem",
                position: entry.category ? 4 : 3,
                name: entry.title,
                item: canonicalUrl,
              },
            ],
          },
        ],
      };

      let out = replaceTitle(html, title);
      out = replaceMeta(out, "name", "description", desc);
      out = replaceMeta(out, "property", "og:title", entry.ogTitle || title);
      out = replaceMeta(out, "property", "og:description", entry.ogDescription || desc);
      out = replaceMeta(out, "property", "og:type", "website");
      out = replaceMeta(out, "property", "og:url", canonicalUrl);
      out = replaceMeta(out, "property", "og:image", imageUrl);
      out = replaceMeta(out, "name", "twitter:card", "summary_large_image");
      out = replaceMeta(out, "name", "twitter:title", entry.ogTitle || title);
      out = replaceMeta(out, "name", "twitter:description", entry.ogDescription || desc);
      out = replaceMeta(out, "name", "twitter:image", imageUrl);
      out = replaceCanonical(out, canonicalUrl);
      out = injectJsonLd(out, structuredData);
      out = injectEntryShell(out, entry, canonicalUrl);
      return out;
    }

    if (path === "/browse" || path.startsWith("/browse/")) {
      const [settings] = await db.select({ siteTitle: directorySettings.siteTitle }).from(directorySettings).limit(1);
      const siteTitle = settings?.siteTitle || "Directory";
      const category = path.startsWith("/browse/") ? decodeURIComponent(path.slice("/browse/".length)) : null;
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
