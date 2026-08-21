// Production server for the built SPA.
// Serves dist/public and injects per-route SEO meta tags (title, description,
// OG tags) into index.html so crawlers that don't run JavaScript see correct
// metadata for the homepage, browse pages, guide pages, and individual entries.
// Task #38: adds local SEO rendering for /locations/:stateSlug/:citySlug,
// /services/:serviceSlug, /services/:serviceSlug/:stateSlug,
// /services/:serviceSlug/:stateSlug/:citySlug with eligibility thresholds.
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import {
  getLessonGuidePath,
  getLessonGuideHttpStatus,
  injectLessonGuideSeoHtml,
  lessonGuides,
  LESSON_GUIDE_BASE_PATH,
} from "../../lib/lesson-guides/src/index.ts";
import {
  buildListingSeo,
  buildListingStructuredData,
  getListingImageUrl,
  injectListingCrawlerShell,
} from "../../lib/listing-seo/src/index.ts";
import {
  getEntryRouteIdentifier,
  getPublicRouteKind,
  injectNotFoundSeoHtml,
  isSafePublicPathname,
  normalizePublicPathname,
} from "../../lib/public-route-status/src/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist/public");
const port = Number(process.env.PORT);
if (!port) throw new Error("PORT environment variable is required");
const publicOrigin = (process.env.PUBLIC_SITE_URL || "https://www.saddleupguide.com").replace(/\/+$/, "");
const EARLIEST_REASONABLE_LASTMOD = Date.UTC(2000, 0, 1);
const FUTURE_DATE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
  : null;

async function getPublicPageHttpStatus(reqPath) {
  const normalizedPath = normalizePublicPathname(reqPath);
  const guideStatus = getLessonGuideHttpStatus(normalizedPath);
  if (guideStatus !== null) return guideStatus;

  const routeKind = getPublicRouteKind(normalizedPath);
  if (routeKind === "unknown") return 404;
  if (routeKind !== "entry") return 200;
  if (!pool) throw new Error("DATABASE_URL is required to validate listing routes");

  const identifier = getEntryRouteIdentifier(normalizedPath);
  if (!identifier) return 404;
  const { rows } = await pool.query(
    `SELECT 1
       FROM entries
      WHERE published = true
        AND ${identifier.kind === "id" ? "id = $1" : "slug = $1"}
      LIMIT 1`,
    [identifier.value],
  );
  return rows.length > 0 ? 200 : 404;
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const escapeXml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function formatSitemapLastmod(value, nowMs = Date.now()) {
  if (value === null || value === undefined || value === "") return undefined;
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") {
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

function hasQueryParameters(requestSearch) {
  const raw = requestSearch.startsWith("?") ? requestSearch.slice(1) : requestSearch;
  return raw.length > 0;
}

function getRequestSearch(requestUrl) {
  try {
    return new URL(requestUrl, "http://localhost").search;
  } catch {
    return "";
  }
}

function isParameterizedBrowseRequest(reqPath, requestSearch) {
  const normalizedPath = normalizePublicPathname(reqPath);
  return (
    (normalizedPath === "/browse" || normalizedPath.startsWith("/browse/"))
    && hasQueryParameters(requestSearch)
  );
}

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

// Inject rel=prev and/or rel=next <link> tags into <head>.
// prevUrl and nextUrl are absolute URLs or null.
function injectPrevNext(html, prevUrl, nextUrl) {
  let out = html;
  // Remove any existing prev/next links first to avoid duplication.
  out = out.replace(/<link\s+rel=["']prev["'][^>]*\/?>/gi, "");
  out = out.replace(/<link\s+rel=["']next["'][^>]*\/?>/gi, "");
  const tags = [
    prevUrl ? `    <link rel="prev" href="${escapeHtml(prevUrl)}" />\n` : "",
    nextUrl ? `    <link rel="next" href="${escapeHtml(nextUrl)}" />\n` : "",
  ].join("");
  if (!tags) return out;
  return out.replace("</head>", `${tags}  </head>`);
}

function injectRobotsNoindex(html) {
  if (/<meta\s+name=["']robots["'][^>]*>/i.test(html)) {
    return html.replace(/<meta\s+name=["']robots["'][^>]*>/i, `<meta name="robots" content="noindex,nofollow" />`);
  }
  return html.replace("</head>", `    <meta name="robots" content="noindex,nofollow" />\n  </head>`);
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

// ── Local SEO shell styles (shared across location/service pages) ────────────
const LOCAL_SEO_STYLES = `<style id="seo-local-shell-styles">
.seo-local-shell{box-sizing:border-box;max-width:1080px;margin:0 auto;padding:32px 24px;font:16px/1.6 system-ui,sans-serif;color:#292524}
.seo-local-shell nav.breadcrumb{font-size:14px;margin-bottom:24px;color:#78716c}
.seo-local-shell nav.breadcrumb a{color:#1d4ed8;text-decoration:none}
.seo-local-shell nav.breadcrumb a:hover{text-decoration:underline}
.seo-local-shell h1{font-size:clamp(26px,5vw,40px);line-height:1.15;margin:0 0 12px;color:#1c1917}
.seo-local-shell .intro{font-size:17px;color:#44403c;margin-bottom:28px}
.seo-local-shell .listing-grid{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.seo-local-shell .listing-card{border:1px solid #e7e5e4;border-radius:8px;padding:16px 18px;background:#fff}
.seo-local-shell .listing-card h2{font-size:17px;margin:0 0 6px;line-height:1.3}
.seo-local-shell .listing-card h2 a{color:#1c1917;text-decoration:none}
.seo-local-shell .listing-card h2 a:hover{color:#1d4ed8;text-decoration:underline}
.seo-local-shell .listing-card .meta{font-size:13px;color:#78716c;margin-top:4px}
.seo-local-shell .badge{display:inline-block;font-size:11px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:6px;vertical-align:middle}
.seo-local-shell .badge-premium{background:#fef9c3;color:#854d0e}
.seo-local-shell .badge-featured{background:#e0f2fe;color:#0c4a6e}
.seo-local-shell .related-links{margin-top:40px;padding-top:24px;border-top:1px solid #e7e5e4}
.seo-local-shell .related-links h2{font-size:18px;margin:0 0 12px}
.seo-local-shell .related-links ul{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
.seo-local-shell .related-links li a{display:inline-block;padding:6px 14px;background:#f5f5f4;border-radius:20px;font-size:14px;color:#1d4ed8;text-decoration:none;border:1px solid #e7e5e4}
.seo-local-shell .related-links li a:hover{background:#e7e5e4}
.seo-local-shell .pagination{display:flex;align-items:center;gap:16px;margin-top:32px;font-size:15px}
.seo-local-shell .pagination a{color:#1d4ed8;text-decoration:none;padding:6px 14px;border:1px solid #e7e5e4;border-radius:6px;background:#fff}
.seo-local-shell .pagination a:hover{background:#f5f5f4}
.seo-local-shell-styles-applied{display:none}
</style>`;

// ── Inject a crawler-visible shell for local SEO hub pages ──────────────────
function injectLocalSeoShell(html, shellContent) {
  const root = /<div\s+id=["']root["']\s*><\/div>/i;
  if (!root.test(html)) return html;
  let out = html.replace(root, `<div id="root">${shellContent}</div>`);
  if (!out.includes("id=\"seo-local-shell-styles\"")) {
    out = out.replace("</head>", `${LOCAL_SEO_STYLES}\n  </head>`);
  }
  return out;
}

// ── Build listing card HTML ──────────────────────────────────────────────────
function buildListingCards(entries) {
  return entries.map((e) => {
    const href = `/entry/${encodeURIComponent(e.slug || String(e.id))}`;
    const badge = e.premium
      ? `<span class="badge badge-premium">Premium</span>`
      : e.featured
      ? `<span class="badge badge-featured">Featured</span>`
      : "";
    const meta = [e.category, e.location].filter(Boolean).map(escapeHtml).join(" · ");
    return `<li class="listing-card">
      <h2><a href="${escapeHtml(href)}">${escapeHtml(e.title)}${badge}</a></h2>
      ${e.summary ? `<p class="meta">${escapeHtml(String(e.summary).slice(0, 120))}</p>` : ""}
      ${meta ? `<p class="meta">${meta}</p>` : ""}
    </li>`;
  }).join("\n");
}

// ── Build breadcrumb nav ─────────────────────────────────────────────────────
function buildBreadcrumbs(crumbs) {
  // crumbs: [{label, href},...,{label}] – last is current (no href).
  // A non-last crumb whose href was cleared (ineligible destination) is rendered
  // as a plain span, never a crawlable anchor to an under-threshold hub.
  return crumbs.map((c, i) => {
    if (i === crumbs.length - 1) {
      return `<span aria-current="page">${escapeHtml(c.label)}</span>`;
    }
    return c.href
      ? `<a href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a>`
      : `<span>${escapeHtml(c.label)}</span>`;
  }).join(`<span aria-hidden="true"> / </span>`);
}

// ── Build ItemList + BreadcrumbList JSON-LD ──────────────────────────────────
// positionOffset: 0-based offset so page-2 items start at position 13, etc.
function buildLocalJsonLd(entries, canonicalUrl, breadcrumbs, title, positionOffset) {
  const offset = positionOffset || 0;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: title,
        url: canonicalUrl,
        numberOfItems: entries.length,
        itemListElement: entries.map((e, i) => ({
          "@type": "ListItem",
          position: offset + i + 1,
          url: `${publicOrigin}/entry/${encodeURIComponent(e.slug || String(e.id))}`,
          name: e.title,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbs.map((c, i) => {
          const isLast = i === breadcrumbs.length - 1;
          const li = { "@type": "ListItem", position: i + 1, name: c.label };
          // Last crumb (current page) points at the canonical URL. A middle crumb
          // keeps its item only when it has an href; a cleared href (ineligible
          // destination) omits item so JSON-LD never advertises a thin hub URL.
          if (isLast) li.item = canonicalUrl;
          else if (c.href) li.item = `${publicOrigin}${c.href}`;
          return li;
        }),
      },
    ],
  };
}

// ── Safe parameterized query helper ─────────────────────────────────────────
// Returns null when the table/column doesn't exist yet (schema not migrated).
async function safeQuery(queryFn) {
  try {
    return await queryFn();
  } catch (err) {
    const msg = String(err?.message || "");
    if (
      msg.includes("does not exist") ||
      msg.includes("column") ||
      msg.includes("relation") ||
      msg.includes("undefined_table") ||
      msg.includes("undefined_column") ||
      err?.code === "42703" || // undefined_column
      err?.code === "42P01"    // undefined_table
    ) {
      return null;
    }
    throw err;
  }
}

// ── Thresholds ───────────────────────────────────────────────────────────────
const THRESHOLD = {
  stateCategory: 10,   // published entries with category in state /browse page
  cityConfirmed: 8,    // confirmed location_status entries in city
  serviceGlobal: 10,   // confirmed service assignments globally
  stateService: 8,     // confirmed service assignments in state
  cityService: 5,      // confirmed service assignments in city
  cityServiceDistinct: 3, // distinct entries for city-service (subsumed by cityService)
};

// ── Pagination ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 12;

// Build the canonical URL for a local page, adding ?page=N only when N > 1.
function pageCanonical(base, page) {
  return page > 1 ? `${base}?page=${page}` : base;
}

// Build absolute prev/next URLs from a base URL + pagination info.
// Returns { prevUrl, nextUrl } with null when not applicable.
function prevNextUrls(base, page, totalPages) {
  return {
    prevUrl: page > 1 ? `${publicOrigin}${pageCanonical(base, page - 1)}` : null,
    nextUrl: page < totalPages ? `${publicOrigin}${pageCanonical(base, page + 1)}` : null,
  };
}

// ── Exact-destination eligibility helpers ─────────────────────────────────────
// Every crawler-visible related/parent anchor emitted from an SSR shell must be
// verified eligible for THAT exact destination. We never infer that a broader
// hub qualifies from a narrower one (e.g. a global service is NOT implied
// eligible just because a city-service page has enough entries), nor that
// /browse/:stateName qualifies just because normalized city/state rows exist.
//
// Each helper mirrors the destination handler's own threshold query
// (published-only, and confirmed status where the destination is local) and
// returns true only when the count meets the threshold. On schema-not-ready
// (safeQuery -> null) they return false so we omit the link rather than risk a
// dead/thin anchor. A safe /browse fallback link is always kept regardless.

// /services/:serviceSlug — global service hub (>= serviceGlobal confirmed)
async function isServiceGlobalEligible(serviceSlug) {
  if (!pool) return false;
  const r = await safeQuery(() =>
    pool.query(
      `SELECT COUNT(est.entry_id) AS c
       FROM service_types st
       JOIN entry_service_types est ON est.service_type_id = st.id AND est.status = 'confirmed'
       JOIN entries e ON e.id = est.entry_id AND e.published = true
       WHERE st.slug = $1`,
      [serviceSlug],
    )
  );
  if (!r || !r.rows[0]) return false;
  return parseInt(r.rows[0].c, 10) >= THRESHOLD.serviceGlobal;
}

// /services/:serviceSlug/:stateSlug — state-service hub (>= stateService confirmed)
async function isServiceStateEligible(serviceSlug, stateSlug) {
  if (!pool) return false;
  const r = await safeQuery(() =>
    pool.query(
      `SELECT COUNT(est.entry_id) AS c
       FROM service_types st
       JOIN entry_service_types est ON est.service_type_id = st.id AND est.status = 'confirmed'
       JOIN entries e ON e.id = est.entry_id AND e.published = true
       JOIN entry_locations el ON el.entry_id = e.id AND el.location_status = 'confirmed'
       WHERE st.slug = $1 AND el.state_slug = $2`,
      [serviceSlug, stateSlug],
    )
  );
  if (!r || !r.rows[0]) return false;
  return parseInt(r.rows[0].c, 10) >= THRESHOLD.stateService;
}

// /locations/:stateSlug/:citySlug — city hub (>= cityConfirmed confirmed)
async function isCityEligible(stateSlug, citySlug) {
  if (!pool) return false;
  const r = await safeQuery(() =>
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE el.location_status = 'confirmed') AS c
       FROM entry_locations el
       JOIN entries e ON e.id = el.entry_id AND e.published = true
       WHERE el.city_slug = $1 AND el.state_slug = $2`,
      [citySlug, stateSlug],
    )
  );
  if (!r || !r.rows[0]) return false;
  return parseInt(r.rows[0].c, 10) >= THRESHOLD.cityConfirmed;
}

// /browse/:stateName — legacy category browse page. Only qualifies when >=
// stateCategory published entries carry that exact display category value.
// This is deliberately keyed on the display name (e.checks e.category), NOT the
// normalized location slug, since /browse uses the category display value.
async function isBrowseStateEligible(stateName) {
  if (!pool) return false;
  const r = await safeQuery(() =>
    pool.query(
      `SELECT COUNT(*) AS c
       FROM entries e
       WHERE e.published = true AND e.category = $1`,
      [stateName],
    )
  );
  if (!r || !r.rows[0]) return false;
  return parseInt(r.rows[0].c, 10) >= THRESHOLD.stateCategory;
}

// ── /locations/:stateSlug/:citySlug ─────────────────────────────────────────
async function handleCityPage(reqPath, html, page) {
  const m = reqPath.match(/^\/locations\/([^/?#]+)\/([^/?#]+)$/);
  if (!m) return null;
  const stateSlug = m[1];
  const citySlug = m[2];

  if (!pool) return null;

  // Count strictly by normalized slug keys (never GROUP BY display-name variants).
  // Mixed-case city_name/state_name values ('Fort Wayne' vs 'FORT WAYNE') must
  // not split the count across groups. Use MIN() to pick a deterministic
  // canonical display name without introducing a second grouping dimension.
  const locationResult = await safeQuery(() =>
    pool.query(
      `SELECT MIN(el.city_name) AS city_name,
              MIN(el.state_name) AS state_name,
              COUNT(*) FILTER (WHERE el.location_status = 'confirmed') AS confirmed_count
       FROM entry_locations el
       JOIN entries e ON e.id = el.entry_id AND e.published = true
       WHERE el.city_slug = $1
         AND el.state_slug = $2`,
      [citySlug, stateSlug],
    )
  );
  if (!locationResult) return null; // schema not ready
  // No GROUP BY means exactly one row always returned; null city_name means no rows matched.
  if (!locationResult.rows[0] || locationResult.rows[0].city_name === null) return "404";

  const loc = locationResult.rows[0];
  const confirmedCount = parseInt(loc.confirmed_count, 10);
  if (confirmedCount < THRESHOLD.cityConfirmed) return "404";

  const totalPages = Math.max(1, Math.ceil(confirmedCount / PAGE_SIZE));
  if (page > totalPages) return "404";

  const cityName = loc.city_name || citySlug;
  const stateName = loc.state_name || stateSlug;
  const offset = (page - 1) * PAGE_SIZE;

  // Fetch one page of confirmed-location entries (premium → featured → newest).
  // el.location_status = 'confirmed' ensures we never surface manual_review/rejected rows.
  const entriesResult = await safeQuery(() =>
    pool.query(
      `SELECT e.id, e.slug, e.title, e.summary, e.category, e.location,
              e.premium, e.featured
       FROM entries e
       JOIN entry_locations el ON el.entry_id = e.id
       WHERE e.published = true
         AND el.city_slug = $1
         AND el.state_slug = $2
         AND el.location_status = 'confirmed'
       ORDER BY e.premium DESC, e.featured DESC, e.created_at DESC, e.id DESC
       LIMIT $3 OFFSET $4`,
      [citySlug, stateSlug, PAGE_SIZE, offset],
    )
  );
  const listEntries = entriesResult?.rows || [];

  const basePath = `/locations/${encodeURIComponent(stateSlug)}/${encodeURIComponent(citySlug)}`;
  const canonicalUrl = `${publicOrigin}${pageCanonical(basePath, page)}`;
  // State parent links use stateName (display name) because /browse/:state uses
  // the category/state display value, not the normalized lowercase slug.
  const stateUrl = `/browse/${encodeURIComponent(stateName)}`;
  const title = `Equestrian Businesses & Services in ${cityName}, ${stateName}`;
  const desc = `Browse ${confirmedCount} equestrian listing${confirmedCount !== 1 ? "s" : ""} in ${cityName}, ${stateName}. Find local horse boarding, trainers, farriers, tack shops and more.`;

  // Only link /browse/:stateName when that exact browse page is itself eligible.
  // /browse uses the category display value, so we verify against the display
  // stateName — a normalized location qualifying does NOT imply it. This gates
  // both the breadcrumb parent AND the related link.
  const browseStateOk = await isBrowseStateEligible(stateName);

  const crumbs = [
    { label: "Home", href: "/" },
    { label: "Browse", href: "/browse" },
    { label: stateName, href: browseStateOk ? stateUrl : null },
    { label: cityName },
  ];

  const { prevUrl, nextUrl } = prevNextUrls(basePath, page, totalPages);
  const breadcrumbHtml = buildBreadcrumbs(crumbs);
  const cards = buildListingCards(listEntries);
  const jsonLd = buildLocalJsonLd(listEntries, canonicalUrl, crumbs, title, offset);

  const paginationHtml = `
    <nav class="pagination" aria-label="Pagination">
      ${prevUrl ? `<a href="${escapeHtml(prevUrl)}" rel="prev">← Previous</a>` : ""}
      <span>Page ${page} of ${totalPages}</span>
      ${nextUrl ? `<a href="${escapeHtml(nextUrl)}" rel="next">Next →</a>` : ""}
    </nav>`;

  const relatedItems = [
    browseStateOk
      ? `<li><a href="${escapeHtml(stateUrl)}">All ${escapeHtml(stateName)} Listings</a></li>`
      : "",
    `<li><a href="/browse">Browse All States</a></li>`,
  ].join("");

  const shell = `<article class="seo-local-shell">
    <nav class="breadcrumb" aria-label="Breadcrumb">${breadcrumbHtml}</nav>
    <h1>${escapeHtml(title)}</h1>
    <p class="intro">Showing ${escapeHtml(String(confirmedCount))} confirmed equestrian listing${confirmedCount !== 1 ? "s" : ""} in <strong>${escapeHtml(cityName)}, ${escapeHtml(stateName)}</strong>.</p>
    ${listEntries.length > 0 ? `<ul class="listing-grid">${cards}</ul>` : ""}
    ${totalPages > 1 ? paginationHtml : ""}
    <div class="related-links">
      <h2>More in ${escapeHtml(stateName)}</h2>
      <ul>
        ${relatedItems}
      </ul>
    </div>
  </article>`;

  let out = replaceTitle(html, `${title} | Saddle Up Guide`);
  out = replaceMeta(out, "name", "description", desc.slice(0, 160));
  out = replaceMeta(out, "property", "og:title", title);
  out = replaceMeta(out, "property", "og:description", desc.slice(0, 200));
  out = replaceMeta(out, "property", "og:type", "website");
  out = replaceMeta(out, "property", "og:url", canonicalUrl);
  out = replaceMeta(out, "property", "og:image", `${publicOrigin}/opengraph.jpg`);
  out = replaceMeta(out, "name", "twitter:card", "summary_large_image");
  out = replaceMeta(out, "name", "twitter:title", title);
  out = replaceMeta(out, "name", "twitter:description", desc.slice(0, 200));
  out = replaceMeta(out, "name", "twitter:image", `${publicOrigin}/opengraph.jpg`);
  out = replaceCanonical(out, canonicalUrl);
  out = injectPrevNext(out, prevUrl, nextUrl);
  out = injectJsonLd(out, jsonLd);
  out = injectLocalSeoShell(out, shell);
  return out;
}

// ── /services/:serviceSlug ───────────────────────────────────────────────────
async function handleServiceGlobalPage(reqPath, html, page) {
  const m = reqPath.match(/^\/services\/([^/?#]+)$/);
  if (!m) return null;
  const serviceSlug = m[1];

  if (!pool) return null;

  // Check service exists and meets global threshold.
  // service_types uses 'label' (not 'name'). st.label is 1:1 with st.slug in
  // the reference table so grouping by slug alone is correct and consistent with
  // the other local handlers. No GROUP BY on display columns; MIN() for label.
  const svcResult = await safeQuery(() =>
    pool.query(
      `SELECT MIN(st.label) AS service_label,
              COUNT(est.entry_id) AS confirmed_count
       FROM service_types st
       JOIN entry_service_types est ON est.service_type_id = st.id AND est.status = 'confirmed'
       JOIN entries e ON e.id = est.entry_id AND e.published = true
       WHERE st.slug = $1`,
      [serviceSlug],
    )
  );
  if (!svcResult) return null;
  // No GROUP BY → one row always; null service_label means no matching service.
  if (!svcResult.rows[0] || svcResult.rows[0].service_label === null) return "404";

  const svc = svcResult.rows[0];
  const confirmedCount = parseInt(svc.confirmed_count, 10);
  if (confirmedCount < THRESHOLD.serviceGlobal) return "404";

  const totalPages = Math.max(1, Math.ceil(confirmedCount / PAGE_SIZE));
  if (page > totalPages) return "404";

  const serviceName = svc.service_label || serviceSlug;
  const offset = (page - 1) * PAGE_SIZE;

  // Fetch one page of entries for this service (premium → featured → newest).
  const entriesResult = await safeQuery(() =>
    pool.query(
      `SELECT e.id, e.slug, e.title, e.summary, e.category, e.location,
              e.premium, e.featured
       FROM entries e
       JOIN entry_service_types est ON est.entry_id = e.id AND est.status = 'confirmed'
       JOIN service_types st ON st.id = est.service_type_id AND st.slug = $1
       WHERE e.published = true
       ORDER BY e.premium DESC, e.featured DESC, e.created_at DESC, e.id DESC
       LIMIT $2 OFFSET $3`,
      [serviceSlug, PAGE_SIZE, offset],
    )
  );
  const listEntries = entriesResult?.rows || [];

  const basePath = `/services/${encodeURIComponent(serviceSlug)}`;
  const canonicalUrl = `${publicOrigin}${pageCanonical(basePath, page)}`;
  const title = `${serviceName} – Equestrian Directory`;
  const desc = `Find ${confirmedCount} equestrian ${serviceName} providers across the country. Compare stables, trainers, and service providers offering ${serviceName}.`;

  const crumbs = [
    { label: "Home", href: "/" },
    { label: "Services", href: "/browse" },
    { label: serviceName },
  ];

  const { prevUrl, nextUrl } = prevNextUrls(basePath, page, totalPages);
  const breadcrumbHtml = buildBreadcrumbs(crumbs);
  const cards = buildListingCards(listEntries);
  const jsonLd = buildLocalJsonLd(listEntries, canonicalUrl, crumbs, title, offset);

  const paginationHtml = `
    <nav class="pagination" aria-label="Pagination">
      ${prevUrl ? `<a href="${escapeHtml(prevUrl)}" rel="prev">← Previous</a>` : ""}
      <span>Page ${page} of ${totalPages}</span>
      ${nextUrl ? `<a href="${escapeHtml(nextUrl)}" rel="next">Next →</a>` : ""}
    </nav>`;

  const shell = `<article class="seo-local-shell">
    <nav class="breadcrumb" aria-label="Breadcrumb">${breadcrumbHtml}</nav>
    <h1>${escapeHtml(title)}</h1>
    <p class="intro">Showing ${escapeHtml(String(confirmedCount))} equestrian business${confirmedCount !== 1 ? "es" : ""} offering <strong>${escapeHtml(serviceName)}</strong> nationwide.</p>
    ${listEntries.length > 0 ? `<ul class="listing-grid">${cards}</ul>` : ""}
    ${totalPages > 1 ? paginationHtml : ""}
    <div class="related-links">
      <h2>Explore by Location</h2>
      <ul>
        <li><a href="/browse">Browse All Listings</a></li>
      </ul>
    </div>
  </article>`;

  let out = replaceTitle(html, `${title} | Saddle Up Guide`);
  out = replaceMeta(out, "name", "description", desc.slice(0, 160));
  out = replaceMeta(out, "property", "og:title", title);
  out = replaceMeta(out, "property", "og:description", desc.slice(0, 200));
  out = replaceMeta(out, "property", "og:type", "website");
  out = replaceMeta(out, "property", "og:url", canonicalUrl);
  out = replaceMeta(out, "property", "og:image", `${publicOrigin}/opengraph.jpg`);
  out = replaceMeta(out, "name", "twitter:card", "summary_large_image");
  out = replaceMeta(out, "name", "twitter:title", title);
  out = replaceMeta(out, "name", "twitter:description", desc.slice(0, 200));
  out = replaceMeta(out, "name", "twitter:image", `${publicOrigin}/opengraph.jpg`);
  out = replaceCanonical(out, canonicalUrl);
  out = injectPrevNext(out, prevUrl, nextUrl);
  out = injectJsonLd(out, jsonLd);
  out = injectLocalSeoShell(out, shell);
  return out;
}

// ── /services/:serviceSlug/:stateSlug ───────────────────────────────────────
async function handleServiceStatePage(reqPath, html, page) {
  const m = reqPath.match(/^\/services\/([^/?#]+)\/([^/?#]+)$/);
  if (!m) return null;
  const serviceSlug = m[1];
  const stateSlug = m[2];

  if (!pool) return null;

  // Count strictly by normalized slug keys. GROUP BY only st.slug to avoid
  // splitting count across el.state_name variants ('Indiana' vs 'INDIANA').
  // st.label is 1:1 with st.slug in service_types, so MIN() is safe and deterministic.
  // MIN(el.state_name) picks a lexicographically-first canonical display name.
  const result = await safeQuery(() =>
    pool.query(
      `SELECT MIN(st.label) AS service_label,
              MIN(el.state_name) AS state_name,
              COUNT(est.entry_id) AS confirmed_count
       FROM service_types st
       JOIN entry_service_types est ON est.service_type_id = st.id AND est.status = 'confirmed'
       JOIN entries e ON e.id = est.entry_id AND e.published = true
       JOIN entry_locations el ON el.entry_id = e.id AND el.location_status = 'confirmed'
       WHERE st.slug = $1 AND el.state_slug = $2`,
      [serviceSlug, stateSlug],
    )
  );
  if (!result) return null;
  // No GROUP BY → one row always; null service_label means no matching rows.
  if (!result.rows[0] || result.rows[0].service_label === null) return "404";

  const row = result.rows[0];
  const confirmedCount = parseInt(row.confirmed_count, 10);
  if (confirmedCount < THRESHOLD.stateService) return "404";

  const totalPages = Math.max(1, Math.ceil(confirmedCount / PAGE_SIZE));
  if (page > totalPages) return "404";

  const serviceName = row.service_label || serviceSlug;
  const stateName = row.state_name || stateSlug;
  const offset = (page - 1) * PAGE_SIZE;

  // Listing fetch: require confirmed location so cards only show entries with
  // a verified state assignment. LIMIT/OFFSET for pagination.
  const entriesResult = await safeQuery(() =>
    pool.query(
      `SELECT e.id, e.slug, e.title, e.summary, e.category, e.location,
              e.premium, e.featured
       FROM entries e
       JOIN entry_service_types est ON est.entry_id = e.id AND est.status = 'confirmed'
       JOIN service_types st ON st.id = est.service_type_id AND st.slug = $1
       JOIN entry_locations el ON el.entry_id = e.id AND el.location_status = 'confirmed'
       WHERE e.published = true AND el.state_slug = $2
       ORDER BY e.premium DESC, e.featured DESC, e.created_at DESC, e.id DESC
       LIMIT $3 OFFSET $4`,
      [serviceSlug, stateSlug, PAGE_SIZE, offset],
    )
  );
  const listEntries = entriesResult?.rows || [];

  const basePath = `/services/${encodeURIComponent(serviceSlug)}/${encodeURIComponent(stateSlug)}`;
  const canonicalUrl = `${publicOrigin}${pageCanonical(basePath, page)}`;
  const title = `${serviceName} in ${stateName} – Equestrian Directory`;
  const desc = `Find ${confirmedCount} equestrian ${serviceName} provider${confirmedCount !== 1 ? "s" : ""} in ${stateName}. Compare local businesses offering ${serviceName}.`;

  // Each destination anchor is gated on ITS OWN eligibility. We do NOT infer the
  // global service qualifies just because this state-service page does. Resolved
  // up front so both the breadcrumb parent and related links can honor it.
  const [globalServiceOk, browseStateOk] = await Promise.all([
    isServiceGlobalEligible(serviceSlug),
    isBrowseStateEligible(stateName),
  ]);

  const crumbs = [
    { label: "Home", href: "/" },
    { label: "Services", href: "/browse" },
    // Parent service crumb links only when the global service hub is eligible.
    { label: serviceName, href: globalServiceOk ? `/services/${encodeURIComponent(serviceSlug)}` : null },
    { label: stateName },
  ];

  const { prevUrl, nextUrl } = prevNextUrls(basePath, page, totalPages);
  const breadcrumbHtml = buildBreadcrumbs(crumbs);
  const cards = buildListingCards(listEntries);
  const jsonLd = buildLocalJsonLd(listEntries, canonicalUrl, crumbs, title, offset);

  const paginationHtml = `
    <nav class="pagination" aria-label="Pagination">
      ${prevUrl ? `<a href="${escapeHtml(prevUrl)}" rel="prev">← Previous</a>` : ""}
      <span>Page ${page} of ${totalPages}</span>
      ${nextUrl ? `<a href="${escapeHtml(nextUrl)}" rel="next">Next →</a>` : ""}
    </nav>`;

  // State parent link uses stateName (display name) — /browse/:state canonical
  // uses the category display value, not the normalized lowercase slug.
  const stateUrl = `/browse/${encodeURIComponent(stateName)}`;
  const relatedItems = [
    globalServiceOk
      ? `<li><a href="${escapeHtml(`/services/${encodeURIComponent(serviceSlug)}`)}">All ${escapeHtml(serviceName)} Providers</a></li>`
      : "",
    browseStateOk
      ? `<li><a href="${escapeHtml(stateUrl)}">All ${escapeHtml(stateName)} Listings</a></li>`
      : "",
    `<li><a href="/browse">Browse All</a></li>`,
  ].join("");
  const shell = `<article class="seo-local-shell">
    <nav class="breadcrumb" aria-label="Breadcrumb">${breadcrumbHtml}</nav>
    <h1>${escapeHtml(title)}</h1>
    <p class="intro">Showing ${escapeHtml(String(confirmedCount))} equestrian ${escapeHtml(serviceName)} provider${confirmedCount !== 1 ? "s" : ""} in <strong>${escapeHtml(stateName)}</strong>.</p>
    ${listEntries.length > 0 ? `<ul class="listing-grid">${cards}</ul>` : ""}
    ${totalPages > 1 ? paginationHtml : ""}
    <div class="related-links">
      <h2>Related Pages</h2>
      <ul>
        ${relatedItems}
      </ul>
    </div>
  </article>`;

  let out = replaceTitle(html, `${title} | Saddle Up Guide`);
  out = replaceMeta(out, "name", "description", desc.slice(0, 160));
  out = replaceMeta(out, "property", "og:title", title);
  out = replaceMeta(out, "property", "og:description", desc.slice(0, 200));
  out = replaceMeta(out, "property", "og:type", "website");
  out = replaceMeta(out, "property", "og:url", canonicalUrl);
  out = replaceMeta(out, "property", "og:image", `${publicOrigin}/opengraph.jpg`);
  out = replaceMeta(out, "name", "twitter:card", "summary_large_image");
  out = replaceMeta(out, "name", "twitter:title", title);
  out = replaceMeta(out, "name", "twitter:description", desc.slice(0, 200));
  out = replaceMeta(out, "name", "twitter:image", `${publicOrigin}/opengraph.jpg`);
  out = replaceCanonical(out, canonicalUrl);
  out = injectPrevNext(out, prevUrl, nextUrl);
  out = injectJsonLd(out, jsonLd);
  out = injectLocalSeoShell(out, shell);
  return out;
}

// ── /services/:serviceSlug/:stateSlug/:citySlug ──────────────────────────────
async function handleServiceCityPage(reqPath, html, page) {
  const m = reqPath.match(/^\/services\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)$/);
  if (!m) return null;
  const serviceSlug = m[1];
  const stateSlug = m[2];
  const citySlug = m[3];

  if (!pool) return null;

  // Count strictly by normalized slug keys. No GROUP BY on display-name columns
  // ('Fort Wayne' vs 'FORT WAYNE' must not split the count across two groups).
  // MIN() gives a deterministic canonical display name from whatever variants exist.
  const result = await safeQuery(() =>
    pool.query(
      `SELECT MIN(st.label) AS service_label,
              MIN(el.city_name) AS city_name,
              MIN(el.state_name) AS state_name,
              COUNT(DISTINCT e.id) AS confirmed_count
       FROM service_types st
       JOIN entry_service_types est ON est.service_type_id = st.id AND est.status = 'confirmed'
       JOIN entries e ON e.id = est.entry_id AND e.published = true
       JOIN entry_locations el ON el.entry_id = e.id AND el.location_status = 'confirmed'
       WHERE st.slug = $1 AND el.state_slug = $2 AND el.city_slug = $3`,
      [serviceSlug, stateSlug, citySlug],
    )
  );
  if (!result) return null;
  // No GROUP BY → one row always; null service_label means no matching rows.
  if (!result.rows[0] || result.rows[0].service_label === null) return "404";

  const row = result.rows[0];
  const confirmedCount = parseInt(row.confirmed_count, 10);
  // cityService (>=5) is the binding threshold; cityServiceDistinct (>=3) is
  // already satisfied whenever cityService is, since both count distinct entries.
  if (confirmedCount < THRESHOLD.cityService) return "404";

  const totalPages = Math.max(1, Math.ceil(confirmedCount / PAGE_SIZE));
  if (page > totalPages) return "404";

  const serviceName = row.service_label || serviceSlug;
  const cityName = row.city_name || citySlug;
  const stateName = row.state_name || stateSlug;
  const offset = (page - 1) * PAGE_SIZE;

  // Listing fetch: require confirmed location so cards only show entries with
  // a verified city/state assignment. LIMIT/OFFSET for pagination.
  const entriesResult = await safeQuery(() =>
    pool.query(
      `SELECT e.id, e.slug, e.title, e.summary, e.category, e.location,
              e.premium, e.featured
       FROM entries e
       JOIN entry_service_types est ON est.entry_id = e.id AND est.status = 'confirmed'
       JOIN service_types st ON st.id = est.service_type_id AND st.slug = $1
       JOIN entry_locations el ON el.entry_id = e.id AND el.location_status = 'confirmed'
       WHERE e.published = true AND el.state_slug = $2 AND el.city_slug = $3
       ORDER BY e.premium DESC, e.featured DESC, e.created_at DESC, e.id DESC
       LIMIT $4 OFFSET $5`,
      [serviceSlug, stateSlug, citySlug, PAGE_SIZE, offset],
    )
  );
  const listEntries = entriesResult?.rows || [];

  const basePath = `/services/${encodeURIComponent(serviceSlug)}/${encodeURIComponent(stateSlug)}/${encodeURIComponent(citySlug)}`;
  const canonicalUrl = `${publicOrigin}${pageCanonical(basePath, page)}`;
  const title = `${serviceName} in ${cityName}, ${stateName} – Equestrian Directory`;
  const desc = `Find ${confirmedCount} equestrian ${serviceName} provider${confirmedCount !== 1 ? "s" : ""} in ${cityName}, ${stateName}. Compare local businesses offering ${serviceName}.`;

  // State parent link uses stateName (display name) — /browse/:state canonical
  // uses the category display value, not the normalized lowercase slug.
  const stateUrl = `/browse/${encodeURIComponent(stateName)}`;
  const serviceStateUrl = `/services/${encodeURIComponent(serviceSlug)}/${encodeURIComponent(stateSlug)}`;
  const serviceGlobalUrl = `/services/${encodeURIComponent(serviceSlug)}`;
  const cityUrl = `/locations/${encodeURIComponent(stateSlug)}/${encodeURIComponent(citySlug)}`;

  // Every crawlable parent/related destination is verified for ITS OWN exact
  // eligibility. We do NOT infer the state-service or global-service hub qualifies
  // just because this (narrower) city-service page does.
  const [serviceStateOk, globalServiceOk, cityOk, browseStateOk] = await Promise.all([
    isServiceStateEligible(serviceSlug, stateSlug),
    isServiceGlobalEligible(serviceSlug),
    isCityEligible(stateSlug, citySlug),
    isBrowseStateEligible(stateName),
  ]);

  const crumbs = [
    { label: "Home", href: "/" },
    { label: "Services", href: "/browse" },
    { label: serviceName, href: globalServiceOk ? serviceGlobalUrl : null },
    { label: stateName, href: serviceStateOk ? serviceStateUrl : null },
    { label: cityName },
  ];

  const { prevUrl, nextUrl } = prevNextUrls(basePath, page, totalPages);
  const breadcrumbHtml = buildBreadcrumbs(crumbs);
  const cards = buildListingCards(listEntries);
  const jsonLd = buildLocalJsonLd(listEntries, canonicalUrl, crumbs, title, offset);

  const paginationHtml = `
    <nav class="pagination" aria-label="Pagination">
      ${prevUrl ? `<a href="${escapeHtml(prevUrl)}" rel="prev">← Previous</a>` : ""}
      <span>Page ${page} of ${totalPages}</span>
      ${nextUrl ? `<a href="${escapeHtml(nextUrl)}" rel="next">Next →</a>` : ""}
    </nav>`;

  const relatedItems = [
    serviceStateOk
      ? `<li><a href="${escapeHtml(serviceStateUrl)}">All ${escapeHtml(serviceName)} in ${escapeHtml(stateName)}</a></li>`
      : "",
    globalServiceOk
      ? `<li><a href="${escapeHtml(serviceGlobalUrl)}">All ${escapeHtml(serviceName)} Providers</a></li>`
      : "",
    cityOk
      ? `<li><a href="${escapeHtml(cityUrl)}">All Listings in ${escapeHtml(cityName)}</a></li>`
      : "",
    browseStateOk
      ? `<li><a href="${escapeHtml(stateUrl)}">All ${escapeHtml(stateName)} Listings</a></li>`
      : "",
    `<li><a href="/browse">Browse All</a></li>`,
  ].join("");

  const shell = `<article class="seo-local-shell">
    <nav class="breadcrumb" aria-label="Breadcrumb">${breadcrumbHtml}</nav>
    <h1>${escapeHtml(title)}</h1>
    <p class="intro">Showing ${escapeHtml(String(confirmedCount))} equestrian ${escapeHtml(serviceName)} provider${confirmedCount !== 1 ? "s" : ""} in <strong>${escapeHtml(cityName)}, ${escapeHtml(stateName)}</strong>.</p>
    ${listEntries.length > 0 ? `<ul class="listing-grid">${cards}</ul>` : ""}
    ${totalPages > 1 ? paginationHtml : ""}
    <div class="related-links">
      <h2>Related Pages</h2>
      <ul>
        ${relatedItems}
      </ul>
    </div>
  </article>`;

  let out = replaceTitle(html, `${title} | Saddle Up Guide`);
  out = replaceMeta(out, "name", "description", desc.slice(0, 160));
  out = replaceMeta(out, "property", "og:title", title);
  out = replaceMeta(out, "property", "og:description", desc.slice(0, 200));
  out = replaceMeta(out, "property", "og:type", "website");
  out = replaceMeta(out, "property", "og:url", canonicalUrl);
  out = replaceMeta(out, "property", "og:image", `${publicOrigin}/opengraph.jpg`);
  out = replaceMeta(out, "name", "twitter:card", "summary_large_image");
  out = replaceMeta(out, "name", "twitter:title", title);
  out = replaceMeta(out, "name", "twitter:description", desc.slice(0, 200));
  out = replaceMeta(out, "name", "twitter:image", `${publicOrigin}/opengraph.jpg`);
  out = replaceCanonical(out, canonicalUrl);
  out = injectPrevNext(out, prevUrl, nextUrl);
  out = injectJsonLd(out, jsonLd);
  out = injectLocalSeoShell(out, shell);
  return out;
}

async function injectSeoMeta(html, reqPath, requestSearch = "") {
  try {
    const lessonGuideHtml = injectLessonGuideSeoHtml(html, reqPath, publicOrigin);
    if (lessonGuideHtml !== null) return lessonGuideHtml;
    if (!pool) return html;

    const entryMatch = reqPath.match(/^\/entry\/([^/?#]+)$/);
    if (entryMatch) {
      const idOrSlug = decodeURIComponent(entryMatch[1]);
      const isNumeric = /^\d+$/.test(idOrSlug);
      const { rows } = await pool.query(
        `SELECT e.id, e.slug, e.title, e.category, e.summary, e.description,
                e.location, e.contact_phone, e.website, e.custom_fields,
                e.meta_title, e.meta_description, e.og_title, e.og_description,
                 e.latitude, e.longitude, s.site_title,
                 (SELECT jsonb_build_object(
                           'cityName', el.city_name,
                           'stateName', el.state_name,
                           'postalCode', el.postal_code
                         )
                    FROM entry_locations el
                   WHERE el.entry_id = e.id
                     AND el.location_status = 'confirmed'
                   LIMIT 1) AS normalized_location,
                 (SELECT COALESCE(
                           jsonb_agg(
                             jsonb_build_object('slug', st.slug, 'label', st.label)
                             ORDER BY st.label
                           ),
                           '[]'::jsonb
                         )
                    FROM entry_service_types est
                    JOIN service_types st ON st.id = est.service_type_id
                   WHERE est.entry_id = e.id
                     AND est.status = 'confirmed') AS confirmed_services,
                 (SELECT count(*)
                    FROM entries category_entries
                   WHERE category_entries.published = true
                     AND category_entries.category = e.category) AS category_count
         FROM entries e, directory_settings s
         WHERE e.published = true AND ${isNumeric ? "e.id = $1::int" : "e.slug = $1"}
         LIMIT 1`,
        [idOrSlug],
      );
      if (!rows[0]) return html;
      const r = rows[0];

      const categoryEligible =
        typeof r.category === "string" &&
        r.category.trim().length > 0 &&
        Number(r.category_count ?? 0) >= THRESHOLD.stateCategory;

      const canonicalUrl = `${publicOrigin}/entry/${encodeURIComponent(r.slug || String(r.id))}`;
      const categoryUrl = (r.category && categoryEligible)
        ? `${publicOrigin}/browse/${encodeURIComponent(r.category)}`
        : null;
      const listingInput = {
        title: r.title,
        siteTitle: r.site_title,
        category: r.category,
        summary: r.summary,
        description: r.description,
        location: r.location,
        normalizedLocation: r.normalized_location,
        confirmedServices: r.confirmed_services,
        metaTitle: r.meta_title,
        metaDescription: r.meta_description,
        ogTitle: r.og_title,
        ogDescription: r.og_description,
        contactPhone: r.contact_phone,
        website: r.website,
        customFields: r.custom_fields,
        latitude: r.latitude,
        longitude: r.longitude,
      };
      const seo = buildListingSeo(listingInput);
      const imageUrl = getListingImageUrl(r.custom_fields, publicOrigin);

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
        categoryUrl: categoryEligible && r.category
          ? `/browse/${encodeURIComponent(r.category)}`
          : null,
      });
      return out;
    }
    if (reqPath === "/browse" || reqPath.startsWith("/browse/")) {
      const { rows } = await pool.query("SELECT site_title FROM directory_settings LIMIT 1");
      const siteTitle = rows[0]?.site_title || "Directory";
      const category = reqPath.startsWith("/browse/")
        ? decodeURIComponent(reqPath.slice("/browse/".length))
        : null;
      let categoryQualified = true;
      if (category) {
        const { rows: categoryCountRows } = await pool.query(
          `SELECT count(*)::int AS count
             FROM entries
            WHERE published = true
              AND category = $1`,
          [category],
        );
        categoryQualified = Number(categoryCountRows[0]?.count ?? 0) >= THRESHOLD.stateCategory;
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

// ── Qualified local pages for sitemap ────────────────────────────────────────
// Returns arrays of loc strings when tables exist; returns empty arrays on error.
async function fetchLocalSitemapPages() {
  if (!pool) return { cityPages: [], servicePages: [], stateServicePages: [], cityServicePages: [] };

  // City pages — join entry_locations; location_status lives on that table
  const cityPages = await safeQuery(async () => {
    const { rows } = await pool.query(
      `SELECT el.city_slug, el.state_slug
       FROM entry_locations el
       JOIN entries e ON e.id = el.entry_id AND e.published = true
       WHERE el.location_status = 'confirmed'
         AND el.city_slug IS NOT NULL
         AND el.state_slug IS NOT NULL
       GROUP BY el.city_slug, el.state_slug
       HAVING COUNT(*) >= $1`,
      [THRESHOLD.cityConfirmed],
    );
    return rows.map((r) => ({
      loc: `/locations/${encodeURIComponent(r.state_slug)}/${encodeURIComponent(r.city_slug)}`,
      priority: "0.7",
      changefreq: "weekly",
    }));
  }) || [];

  // Global service pages — no location join needed
  const servicePages = await safeQuery(async () => {
    const { rows } = await pool.query(
      `SELECT st.slug AS service_slug
       FROM service_types st
       JOIN entry_service_types est ON est.service_type_id = st.id AND est.status = 'confirmed'
       JOIN entries e ON e.id = est.entry_id AND e.published = true
       GROUP BY st.slug
       HAVING COUNT(est.entry_id) >= $1`,
      [THRESHOLD.serviceGlobal],
    );
    return rows.map((r) => ({
      loc: `/services/${encodeURIComponent(r.service_slug)}`,
      priority: "0.7",
      changefreq: "weekly",
    }));
  }) || [];

  // State-service pages — join entry_locations for state_slug; require confirmed
  const stateServicePages = await safeQuery(async () => {
    const { rows } = await pool.query(
      `SELECT st.slug AS service_slug, el.state_slug
       FROM service_types st
       JOIN entry_service_types est ON est.service_type_id = st.id AND est.status = 'confirmed'
       JOIN entries e ON e.id = est.entry_id AND e.published = true
       JOIN entry_locations el ON el.entry_id = e.id AND el.location_status = 'confirmed'
       WHERE el.state_slug IS NOT NULL
       GROUP BY st.slug, el.state_slug
       HAVING COUNT(est.entry_id) >= $1`,
      [THRESHOLD.stateService],
    );
    return rows.map((r) => ({
      loc: `/services/${encodeURIComponent(r.service_slug)}/${encodeURIComponent(r.state_slug)}`,
      priority: "0.65",
      changefreq: "weekly",
    }));
  }) || [];

  // City-service pages — join entry_locations for city/state slugs; require confirmed.
  // cityService (>=5) is binding; cityServiceDistinct (>=3) is already satisfied
  // by it since both count distinct published entries.
  const cityServicePages = await safeQuery(async () => {
    const { rows } = await pool.query(
      `SELECT st.slug AS service_slug, el.state_slug, el.city_slug
       FROM service_types st
       JOIN entry_service_types est ON est.service_type_id = st.id AND est.status = 'confirmed'
       JOIN entries e ON e.id = est.entry_id AND e.published = true
       JOIN entry_locations el ON el.entry_id = e.id AND el.location_status = 'confirmed'
       WHERE el.state_slug IS NOT NULL AND el.city_slug IS NOT NULL
       GROUP BY st.slug, el.state_slug, el.city_slug
       HAVING COUNT(DISTINCT e.id) >= $1`,
      [THRESHOLD.cityService],
    );
    return rows.map((r) => ({
      loc: `/services/${encodeURIComponent(r.service_slug)}/${encodeURIComponent(r.state_slug)}/${encodeURIComponent(r.city_slug)}`,
      priority: "0.6",
      changefreq: "weekly",
    }));
  }) || [];

  return { cityPages, servicePages, stateServicePages, cityServicePages };
}

// ── State browse pages qualified for sitemap (>=10 published category entries) ──
async function fetchQualifiedStateBrowsePages() {
  if (!pool) return [];
  const result = await safeQuery(async () => {
    // Category pages with >=10 published entries qualify
    const { rows } = await pool.query(
      `SELECT category
       FROM entries
       WHERE published = true AND category IS NOT NULL AND btrim(category) <> ''
       GROUP BY category
       HAVING COUNT(*) >= $1`,
      [THRESHOLD.stateCategory],
    );
    return rows.map((r) => ({
      loc: `/browse/${encodeURIComponent(r.category)}`,
      priority: "0.7",
      changefreq: "daily",
    }));
  }) || [];
  return result;
}

const app = express();
app.set("etag", false);

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
    let categoryPages = [];
    let entryPages = [];
    if (pool) {
      const [{ rows: entryRows }] = await Promise.all([
        pool.query(
          "SELECT id, slug, updated_at FROM entries WHERE published = true",
        ),
      ]);
      // Qualified category (browse) pages — threshold >= 10
      categoryPages = await fetchQualifiedStateBrowsePages();
      entryPages = entryRows.map((row) => ({
        loc: `/entry/${encodeURIComponent(row.slug || String(row.id))}`,
        priority: "0.6",
        changefreq: "weekly",
        lastmod: formatSitemapLastmod(row.updated_at),
      }));
    }

    // New local SEO pages (fail-safe: returns empty arrays if schema not ready)
    const { cityPages, servicePages, stateServicePages, cityServicePages } =
      await fetchLocalSitemapPages();

    // Deduplicate by loc
    const seen = new Set();
    const allPages = [
      ...staticPages,
      ...guidePages,
      ...categoryPages,
      ...entryPages,
      ...cityPages,
      ...servicePages,
      ...stateServicePages,
      ...cityServicePages,
    ].filter((p) => {
      if (seen.has(p.loc)) return false;
      seen.add(p.loc);
      return true;
    });

    const urls = allPages
      .map((page) => {
        const lastmod = page.lastmod
          ? `\n    <lastmod>${escapeXml(page.lastmod)}</lastmod>`
          : "";
        return `  <url>
    <loc>${escapeXml(publicOrigin + page.loc)}</loc>${lastmod}
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
      })
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

app.use((req, res, next) => {
  if (req.method !== "GET" || isSafePublicPathname(req.path)) {
    next();
    return;
  }
  try {
    const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
    res
      .status(404)
      .set("Cache-Control", "no-store")
      .type("html")
      .send(injectNotFoundSeoHtml(html));
  } catch {
    res.status(404).set("Cache-Control", "no-store").type("text").send("Not found");
  }
});
app.use(express.static(distDir, { index: false }));
app.get("/{*path}", async (req, res) => {
  try {
    const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
    const reqPath = normalizePublicPathname(req.path);
    const requestSearch = getRequestSearch(req.originalUrl);

    // ── Local SEO routes – check eligibility before serving HTML ────────────
    // These routes must 404 when under-threshold rather than serving thin 200s.
    const isLocalRoute =
      /^\/locations\/[^/?#]+\/[^/?#]+$/.test(reqPath) ||
      /^\/services\/[^/?#]+(\/[^/?#]+(\/[^/?#]+)?)?$/.test(reqPath);

    if (isLocalRoute) {
      // Parse ?page=N: must be a positive integer; anything else defaults to 1.
      const rawPage = req.query.page;
      const parsedPage = rawPage !== undefined ? parseInt(String(rawPage), 10) : 1;
      const page = Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

      // Try each handler in order (most specific first to avoid ambiguity).
      let result = null;
      if (/^\/services\/[^/?#]+\/[^/?#]+\/[^/?#]+$/.test(reqPath)) {
        result = await handleServiceCityPage(reqPath, html, page).catch(() => null);
      } else if (/^\/services\/[^/?#]+\/[^/?#]+$/.test(reqPath)) {
        result = await handleServiceStatePage(reqPath, html, page).catch(() => null);
      } else if (/^\/services\/[^/?#]+$/.test(reqPath)) {
        result = await handleServiceGlobalPage(reqPath, html, page).catch(() => null);
      } else if (/^\/locations\/[^/?#]+\/[^/?#]+$/.test(reqPath)) {
        result = await handleCityPage(reqPath, html, page).catch(() => null);
      }

      if (result === "404") {
        // Under-threshold, nonexistent, or page > totalPages: 404 + noindex.
        // Prevents out-of-range pages from being indexed as duplicate content.
        const noindexHtml = injectRobotsNoindex(html);
        return res
          .status(404)
          .set("Cache-Control", "no-store")
          .type("html")
          .send(noindexHtml);
      }
      if (result === null) {
        // Schema not yet applied: serve plain SPA (no crash, no 404).
        return res.type("html").send(html);
      }
      // result is the fully-rendered paginated HTML.
      return res.type("html").send(result);
    }

    const pageStatus = await getPublicPageHttpStatus(reqPath);
    if (pageStatus === 404) {
      return res
        .status(404)
        .set("Cache-Control", "no-store")
        .type("html")
        .send(injectNotFoundSeoHtml(html));
    }

    // Existing routes
    const response = res
      .status(pageStatus)
      .type("html");
    if (isParameterizedBrowseRequest(reqPath, requestSearch)) {
      response.set("X-Robots-Tag", "noindex, follow");
    }
    response.send(await injectSeoMeta(html, reqPath, requestSearch));
  } catch {
    res
      .status(500)
      .set("Cache-Control", "no-store")
      .type("text")
      .send("Unable to render page");
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`web server listening on ${port}`);
});
