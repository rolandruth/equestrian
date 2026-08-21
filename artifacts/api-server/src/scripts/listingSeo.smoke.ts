import assert from "node:assert/strict";
import {
  buildListingSeo,
  buildListingStructuredData,
  getListingLocationLabel,
  getListingSeoQuality,
  injectListingCrawlerShell,
} from "@workspace/listing-seo";

const thinListing = {
  title: "Western Venture Farms",
  siteTitle: "Equestrian Directory",
  description: "Western Venture Farms",
  location: "Waukesha, WI 53189, Waukesha, Wisconsin 53189",
  normalizedLocation: {
    cityName: "Waukesha",
    stateName: "Wisconsin",
    postalCode: "53189",
  },
  confirmedServices: [
    { slug: "horse-riding-lessons", label: "Horse Riding Lessons" },
    { slug: "horse-boarding", label: "Horse Boarding" },
  ],
  metaTitle: "Western Venture Farms",
  metaDescription: "Western Venture Farms",
  ogTitle: "Western Venture Farms",
  ogDescription: "Western Venture Farms",
};

const fallback = buildListingSeo(thinListing);
assert.notEqual(fallback.title, thinListing.metaTitle);
assert.match(fallback.title, /Horse Riding Lessons|Wisconsin|SaddleUpGuide/);
assert.ok(fallback.description.length >= 90);
assert.ok(fallback.description.length <= 160);
assert.doesNotMatch(fallback.description, /…$/);
assert.equal(fallback.locationLabel, "Waukesha, Wisconsin 53189");
assert.deepEqual(fallback.serviceLabels, ["Horse Riding Lessons", "Horse Boarding"]);
assert.equal(getListingSeoQuality(thinListing).needsImprovement, true);

const customListing = {
  ...thinListing,
  metaTitle: "Western Venture Farms | Riding Lessons & Horse Boarding",
  metaDescription: "Plan your next ride at Western Venture Farms in Waukesha, Wisconsin. Explore horse riding lessons, boarding services, contact details, and more.",
  ogTitle: "A Different but Meaningful Social Title for Western Venture Farms",
  ogDescription: "This deliberately different social description is long enough to be considered meaningful, but the primary listing description must remain the single source of truth.",
};
const custom = buildListingSeo(customListing);
assert.equal(custom.title, customListing.metaTitle);
assert.equal(custom.description, customListing.metaDescription);
assert.equal(custom.ogTitle, customListing.metaTitle);
assert.equal(custom.ogDescription, customListing.metaDescription);
assert.equal(getListingSeoQuality(customListing).needsImprovement, false);

const socialFallback = buildListingSeo({
  ...thinListing,
  metaTitle: thinListing.title,
  metaDescription: thinListing.title,
  ogTitle: "Western Venture Farms | Waukesha Riding & Boarding",
  ogDescription: "Discover riding and boarding at Western Venture Farms in Waukesha, Wisconsin. Review services, location details, contact information, and more.",
});
assert.equal(socialFallback.title, socialFallback.ogTitle);
assert.equal(socialFallback.description, socialFallback.ogDescription);

assert.equal(
  getListingLocationLabel({
    title: "Example",
    location: "Manchester, CT 06042",
  }),
  "Manchester, Connecticut 06042",
);

const unsafeListing = {
  ...thinListing,
  title: "Barn <script>alert('x')</script> & Lessons",
  metaTitle: null,
  metaDescription: null,
};
const htmlTemplate = "<html><head><title>Directory</title></head><body><div id=\"root\"></div></body></html>";
const crawlerHtml = injectListingCrawlerShell(htmlTemplate, unsafeListing, {
  canonicalUrl: "https://www.saddleupguide.com/entry/barn-lessons",
  categoryUrl: "/browse/Wisconsin",
});
assert.doesNotMatch(crawlerHtml, /<script>alert/);
assert.doesNotMatch(crawlerHtml, /alert/);
assert.match(crawlerHtml, /Barn &amp; Lessons/);
assert.match(crawlerHtml, /Horse Riding Lessons/);
assert.match(crawlerHtml, /Browse all equestrian businesses and services/);

const structuredData = buildListingStructuredData(customListing, {
  canonicalUrl: "https://www.saddleupguide.com/entry/western-venture-farms",
  origin: "https://www.saddleupguide.com",
  categoryUrl: "https://www.saddleupguide.com/browse/Wisconsin",
  imageUrl: "https://www.saddleupguide.com/opengraph.jpg",
});
const graph = structuredData["@graph"] as Array<Record<string, unknown>>;
const business = graph[0];
assert.equal((business.address as Record<string, unknown>)["@type"], "PostalAddress");
assert.equal((business.address as Record<string, unknown>).addressRegion, "Wisconsin");
assert.deepEqual(business.knowsAbout, ["Horse Riding Lessons", "Horse Boarding"]);
assert.equal(business.description, custom.description);

console.log("Listing SEO smoke checks passed.");