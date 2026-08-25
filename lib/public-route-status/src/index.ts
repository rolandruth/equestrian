export type PublicRouteKind = "known" | "entry" | "unknown";
export type EntryRouteIdentifier =
  | { kind: "id"; value: number }
  | { kind: "slug"; value: string };

const MAX_POSTGRES_INTEGER = 2_147_483_647;

export function normalizePublicPathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

export function isSafePublicPathname(pathname: string): boolean {
  return !normalizePublicPathname(pathname).split("/").some((segment) => {
    if (!segment) return false;
    try {
      const decoded = decodeURIComponent(segment);
      return decoded === "."
        || decoded === ".."
        || /[/\\\u0000-\u001f\u007f]/.test(decoded);
    } catch {
      return true;
    }
  });
}

/**
 * Classifies routes the public SPA is allowed to serve. Dynamic local-search
 * routes stay "known" here because their own threshold handlers determine
 * whether a specific location or service page qualifies.
 */
export function getPublicRouteKind(pathname: string): PublicRouteKind {
  const path = normalizePublicPathname(pathname);
  if (!isSafePublicPathname(path)) return "unknown";

  if ([
    "/",
    "/setup",
    "/admin",
    "/admin/login",
    "/admin/entries",
    "/admin/entries/new",
    "/admin/categories",
    "/admin/import",
    "/admin/settings",
    "/admin/users",
    "/admin/seo",
    "/admin/local-seo",
    "/admin/reviews",
    "/admin/contacts",
    "/admin/ads",
    "/browse",
    "/contact",
    "/advertise",
    "/listing-plans",
    "/business/dashboard",
    "/business/login",
    "/business/reset-password",
    "/horse-riding-lessons",
    "/horse-riding-lessons-for-beginners",
    "/privacy-policy",
    "/terms",
  ].includes(path)) {
    return "known";
  }

  if (
    /^\/admin\/entries\/[^/]+\/edit$/.test(path)
    || /^\/admin\/builder\/[^/]+$/.test(path)
    || /^\/browse\/[^/]+$/.test(path)
    || /^\/horse-riding-lessons\/[^/]+$/.test(path)
    || /^\/locations\/[^/]+\/[^/]+$/.test(path)
    || /^\/services\/[^/]+(?:\/[^/]+){0,2}$/.test(path)
  ) {
    return "known";
  }

  if (/^\/entry\/[^/]+$/.test(path)) return "entry";
  return "unknown";
}

export function getEntryRouteIdentifier(pathname: string): EntryRouteIdentifier | null {
  const path = normalizePublicPathname(pathname);
  if (getPublicRouteKind(path) !== "entry") return null;
  const match = path.match(/^\/entry\/([^/]+)$/);
  if (!match) return null;

  let value: string;
  try {
    value = decodeURIComponent(match[1]);
  } catch {
    return null;
  }

  if (/^\d+$/.test(value)) {
    if (!/^[1-9]\d*$/.test(value)) return null;
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id > MAX_POSTGRES_INTEGER) return null;
    return { kind: "id", value: id };
  }
  return { kind: "slug", value };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceMeta(html: string, attr: "name" | "property", key: string, content: string): string {
  const escaped = escapeHtml(content);
  const expression = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, "i");
  if (expression.test(html)) return html.replace(expression, `$1${escaped}$2`);
  return html.replace("</head>", `    <meta ${attr}="${key}" content="${escaped}" />\n  </head>`);
}

/**
 * Creates a crawler-visible 404 document without a canonical URL. A canonical
 * to the homepage would turn a broken URL into a misleading duplicate signal.
 */
export function injectNotFoundSeoHtml(html: string, siteTitle = "SaddleUpGuide"): string {
  const title = `Page Not Found | ${siteTitle}`;
  const description = "This page does not exist or may have moved. Explore the SaddleUpGuide directory to find equestrian businesses and resources.";
  const root = /<div\s+id=["']root["']\s*><\/div>/i;
  const shell = `<main class="seo-not-found-shell"><h1>Page not found</h1><p>${escapeHtml(description)}</p><p><a href="/">Return to the SaddleUpGuide homepage</a></p></main>`;

  let out = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  out = replaceMeta(out, "name", "description", description);
  out = replaceMeta(out, "name", "robots", "noindex,follow");
  out = replaceMeta(out, "property", "og:title", title);
  out = replaceMeta(out, "property", "og:description", description);
  out = replaceMeta(out, "property", "og:type", "website");
  out = replaceMeta(out, "name", "twitter:title", title);
  out = replaceMeta(out, "name", "twitter:description", description);
  out = out.replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, "");
  out = out.replace(/<meta\s+property=["']og:url["'][^>]*>\s*/gi, "");

  if (root.test(out)) out = out.replace(root, `<div id="root">${shell}</div>`);
  if (!out.includes("id=\"seo-not-found-styles\"")) {
    out = out.replace(
      "</head>",
      `    <style id="seo-not-found-styles">.seo-not-found-shell{max-width:720px;margin:0 auto;padding:80px 24px;font:18px/1.6 system-ui,sans-serif;color:#292524}.seo-not-found-shell h1{font-size:clamp(34px,6vw,56px);line-height:1.1;margin:0 0 18px}.seo-not-found-shell a{color:#1d4ed8}</style>\n  </head>`,
    );
  }
  return out;
}