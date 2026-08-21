import assert from "node:assert/strict";
import { db, entries } from "@workspace/db";
import { inArray } from "drizzle-orm";
import {
  buildSitemapXml,
  dedupeSitemapPages,
  formatSitemapLastmod,
  type SitemapPage,
} from "../routes/sitemapRoute";
import { hasQueryParameters, injectSeoMeta } from "../lib/seoHtml";

const validationNow = Date.parse("2026-08-21T12:00:00.000Z");
assert.equal(
  formatSitemapLastmod("2024-02-03T23:59:59.000Z", validationNow),
  "2024-02-03",
);
assert.equal(formatSitemapLastmod(null, validationNow), undefined);
assert.equal(formatSitemapLastmod("not-a-date", validationNow), undefined);
assert.equal(formatSitemapLastmod("1980-01-01", validationNow), undefined);
assert.equal(formatSitemapLastmod("2026-08-24", validationNow), undefined);

assert.equal(hasQueryParameters(""), false);
assert.equal(hasQueryParameters("?"), false);
assert.equal(hasQueryParameters("?search="), true);
assert.equal(hasQueryParameters("?unknown=value"), true);
assert.equal(hasQueryParameters("?&&"), true);

const pages: SitemapPage[] = [
  { loc: "/", priority: "1.0", changefreq: "daily" },
  {
    loc: "/entry/example&listing",
    priority: "0.6",
    changefreq: "weekly",
    lastmod: "2024-02-03",
  },
];
const xml = buildSitemapXml(pages, "https://example.test/");
assert.equal((xml.match(/<lastmod>/g) || []).length, 1);
assert.match(xml, /<lastmod>2024-02-03<\/lastmod>/);
assert.match(xml, /example&amp;listing/);
assert.doesNotMatch(
  xml.match(/<url>[\s\S]*?<loc>https:\/\/example\.test\/<\/loc>[\s\S]*?<\/url>/)?.[0] || "",
  /<lastmod>/,
);
assert.deepEqual(
  dedupeSitemapPages([pages[0], pages[0], pages[1]]).map((page) => page.loc),
  ["/", "/entry/example&listing"],
);

const appShell = `<!doctype html>
<html lang="en">
  <head>
    <title>SaddleUpGuide</title>
    <meta name="description" content="Default description" />
    <meta property="og:title" content="SaddleUpGuide" />
    <meta property="og:description" content="Default description" />
    <meta property="og:url" content="https://example.test/" />
    <link rel="canonical" href="https://example.test/" />
  </head>
  <body><div id="root"></div></body>
</html>`;

const fixtureKey = `seo-smoke-${Date.now()}-${process.pid}`;
const thinCategory = `${fixtureKey}-nine`;
const qualifiedCategory = `${fixtureKey}-ten`;

try {
  await db.insert(entries).values([
    ...Array.from({ length: 9 }, (_, index) => ({
      title: `Thin SEO fixture ${index + 1}`,
      slug: `${fixtureKey}-thin-${index + 1}`,
      category: thinCategory,
      published: true,
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      title: `Qualified SEO fixture ${index + 1}`,
      slug: `${fixtureKey}-qualified-${index + 1}`,
      category: qualifiedCategory,
      published: true,
    })),
  ]);

  const cleanBrowse = await injectSeoMeta(
    appShell,
    "/browse",
    "https://example.test",
  );
  assert.match(cleanBrowse, /name="robots" content="index,follow"/);
  assert.match(cleanBrowse, /rel="canonical" href="https:\/\/example\.test\/browse"/);

  const filteredBrowse = await injectSeoMeta(
    appShell,
    "/browse",
    "https://example.test",
    "?search=trainer&page=2",
  );
  assert.match(filteredBrowse, /name="robots" content="noindex,follow"/);
  assert.match(filteredBrowse, /rel="canonical" href="https:\/\/example\.test\/browse"/);
  assert.doesNotMatch(filteredBrowse, /canonical[^>]+[?&](?:search|page)=/);

  const unknownFilter = await injectSeoMeta(
    appShell,
    "/browse",
    "https://example.test",
    "?unexpected=value",
  );
  assert.match(unknownFilter, /name="robots" content="noindex,follow"/);

  const separatorOnlyFilter = await injectSeoMeta(
    appShell,
    "/browse",
    "https://example.test",
    "?&&",
  );
  assert.match(separatorOnlyFilter, /name="robots" content="noindex,follow"/);

  const thinCategoryHtml = await injectSeoMeta(
    appShell,
    `/browse/${encodeURIComponent(thinCategory)}`,
    "https://example.test",
  );
  assert.match(thinCategoryHtml, /name="robots" content="noindex,follow"/);

  const qualifiedCategoryHtml = await injectSeoMeta(
    appShell,
    `/browse/${encodeURIComponent(qualifiedCategory)}`,
    "https://example.test",
  );
  assert.match(qualifiedCategoryHtml, /name="robots" content="index,follow"/);

  const filteredQualifiedCategoryHtml = await injectSeoMeta(
    appShell,
    `/browse/${encodeURIComponent(qualifiedCategory)}`,
    "https://example.test",
    "?city=Austin",
  );
  assert.match(filteredQualifiedCategoryHtml, /name="robots" content="noindex,follow"/);
  assert.match(
    filteredQualifiedCategoryHtml,
    new RegExp(`rel="canonical" href="https://example\\.test/browse/${encodeURIComponent(qualifiedCategory)}"`),
  );
} finally {
  await db
    .delete(entries)
    .where(inArray(entries.category, [thinCategory, qualifiedCategory]));
}

console.info("sitemap and filter indexation smoke checks passed");