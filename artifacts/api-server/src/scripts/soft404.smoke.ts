import assert from "node:assert/strict";
import {
  getEntryRouteIdentifier,
  getPublicRouteKind,
  injectNotFoundSeoHtml,
  isSafePublicPathname,
} from "@workspace/public-route-status";

const knownRoutes = [
  "/",
  "/browse",
  "/browse/Horse%20Trainers",
  "/entry/dover-saddlery",
  "/services/horse-riding-lessons",
  "/services/horse-riding-lessons/illinois/chicago",
  "/locations/illinois/chicago",
  "/horse-riding-lessons/beginners",
  "/horse-riding-lessons/beginners/",
  "/entry/dover-saddlery/",
  "/admin/local-seo",
  "/admin/entries/42/edit",
  "/business/reset-password",
  "/privacy-policy/",
];

for (const path of knownRoutes) {
  assert.notEqual(getPublicRouteKind(path), "unknown", `${path} should be recognized`);
}

assert.equal(getPublicRouteKind("/entry/dover-saddlery"), "entry");
assert.deepEqual(getEntryRouteIdentifier("/entry/42"), { kind: "id", value: 42 });
assert.deepEqual(getEntryRouteIdentifier("/entry/dover-saddlery"), { kind: "slug", value: "dover-saddlery" });
assert.equal(getEntryRouteIdentifier("/entry/0"), null);
assert.equal(getEntryRouteIdentifier("/entry/00042"), null);
assert.equal(getEntryRouteIdentifier("/entry/2147483648"), null);
assert.equal(getEntryRouteIdentifier("/entry/999999999999999999999"), null);
assert.equal(isSafePublicPathname("/browse/Horse%20Trainers"), true);
assert.equal(isSafePublicPathname("/browse/%ZZ"), false);
assert.equal(isSafePublicPathname("/browse/%2Fadmin"), false);
assert.equal(isSafePublicPathname("/entry/%2e%2e"), false);
for (const path of [
  "/definitely-not-a-real-page",
  "/definitely/not/a/real/page",
  "/entry",
  "/entry/one/two",
  "/services",
  "/locations/illinois",
  "/admin/not-a-real-tool",
  "/missing.js",
  "/browse/%ZZ",
  "/browse/%2Fadmin",
  "/entry/%2e%2e",
]) {
  assert.equal(getPublicRouteKind(path), "unknown", `${path} should be a 404 route`);
}

const appShell = `<!doctype html>
<html lang="en">
  <head>
    <title>SaddleUpGuide</title>
    <meta name="description" content="Default description" />
    <meta property="og:title" content="SaddleUpGuide" />
    <meta property="og:description" content="Default description" />
    <meta property="og:url" content="https://www.saddleupguide.com/" />
    <link rel="canonical" href="https://www.saddleupguide.com/" />
  </head>
  <body><div id="root"></div></body>
</html>`;

const notFoundHtml = injectNotFoundSeoHtml(appShell);
assert.match(notFoundHtml, /<title>Page Not Found \| SaddleUpGuide<\/title>/);
assert.match(notFoundHtml, /name="robots" content="noindex,follow"/);
assert.match(notFoundHtml, /<h1>Page not found<\/h1>/);
assert.doesNotMatch(notFoundHtml, /rel="canonical"/);
assert.doesNotMatch(notFoundHtml, /property="og:url"/);

console.info("soft 404 smoke checks passed");