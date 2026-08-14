import { db, entries, directorySettings } from "@workspace/db";
import { eq, and } from "drizzle-orm";

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

/**
 * Rewrites the SPA index.html with route-specific title/description/OG tags
 * so crawlers that don't execute JavaScript see correct metadata.
 * Returns the original HTML when the route needs no rewriting or on error.
 */
export async function injectSeoMeta(html: string, path: string): Promise<string> {
  try {
    const entryMatch = path.match(/^\/entry\/([^/?#]+)$/);
    if (entryMatch) {
      const idOrSlug = decodeURIComponent(entryMatch[1]);
      const numericId = /^\d+$/.test(idOrSlug) ? parseInt(idOrSlug, 10) : null;
      const [entry] = await db
        .select({
          title: entries.title,
          summary: entries.summary,
          metaTitle: entries.metaTitle,
          metaDescription: entries.metaDescription,
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

      let out = replaceTitle(html, title);
      out = replaceMeta(out, "name", "description", desc);
      out = replaceMeta(out, "property", "og:title", title);
      out = replaceMeta(out, "property", "og:description", desc);
      out = replaceMeta(out, "property", "og:type", "article");
      return out;
    }

    if (path === "/browse" || path.startsWith("/browse/")) {
      const [settings] = await db.select({ siteTitle: directorySettings.siteTitle }).from(directorySettings).limit(1);
      const siteTitle = settings?.siteTitle || "Directory";
      const category = path.startsWith("/browse/") ? decodeURIComponent(path.slice("/browse/".length)) : null;
      const title = category ? `${category} | Browse ${siteTitle}` : `Browse All Listings | ${siteTitle}`;
      return replaceTitle(html, title);
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
      }
      if (settings?.metaDescription) {
        out = replaceMeta(out, "name", "description", settings.metaDescription);
        out = replaceMeta(out, "property", "og:description", settings.metaDescription);
      }
      return out;
    }

    return html;
  } catch {
    return html;
  }
}
