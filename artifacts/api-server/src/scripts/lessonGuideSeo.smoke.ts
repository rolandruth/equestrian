import assert from "node:assert/strict";
import {
  getLessonGuidePath,
  getLessonGuideHttpStatus,
  lessonGuideHub,
  lessonGuides,
  LESSON_GUIDE_BASE_PATH,
} from "@workspace/lesson-guides";
import { injectSeoMeta } from "../lib/seoHtml";

const appShell = `<!doctype html>
<html lang="en">
  <head>
    <title>SaddleUpGuide</title>
    <meta name="description" content="Default description" />
    <meta property="og:title" content="SaddleUpGuide" />
    <meta property="og:description" content="Default description" />
    <meta property="og:type" content="website" />
    <link rel="canonical" href="https://www.saddleupguide.com/" />
  </head>
  <body><div id="root"></div></body>
</html>`;

assert.equal(lessonGuides.length, 5);
assert.equal(getLessonGuideHttpStatus(LESSON_GUIDE_BASE_PATH), 200);
assert.equal(getLessonGuideHttpStatus(`${LESSON_GUIDE_BASE_PATH}/beginners`), 200);
assert.equal(getLessonGuideHttpStatus(`${LESSON_GUIDE_BASE_PATH}/not-a-guide`), 404);
assert.equal(getLessonGuideHttpStatus("/browse"), null);
assert.deepEqual(
  lessonGuides.map((guide) => guide.slug),
  ["beginners", "adults", "kids", "costs", "choosing-an-instructor"],
);
assert.equal(new Set(lessonGuides.map((guide) => guide.metaTitle)).size, lessonGuides.length);
assert.equal(new Set(lessonGuides.map((guide) => guide.description)).size, lessonGuides.length);

for (const guide of lessonGuides) {
  assert.ok(guide.metaTitle.length <= 60, `${guide.slug} meta title is too long`);
  assert.ok(guide.description.length <= 160, `${guide.slug} description is too long`);
  assert.ok(guide.sections.length >= 4, `${guide.slug} needs substantial sections`);
  assert.ok(guide.keyTakeaways.length >= 4, `${guide.slug} needs useful takeaways`);
  assert.ok(guide.relatedSlugs.every((slug) => slug !== guide.slug));

  const html = await injectSeoMeta(
    appShell,
    getLessonGuidePath(guide.slug),
    "https://example.test",
  );
  assert.match(html, new RegExp(`<title>${guide.metaTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</title>`));
  assert.ok(html.includes(`href="https://example.test${getLessonGuidePath(guide.slug)}"`));
  assert.ok(html.includes(`"@type":"Article"`));
  assert.ok(html.includes(`"@type":"BreadcrumbList"`));
  assert.ok(html.includes(guide.sections[0].heading));
  assert.ok(html.includes("Find horse riding lessons in the directory"));
}

const hubHtml = await injectSeoMeta(appShell, LESSON_GUIDE_BASE_PATH, "https://example.test");
assert.ok(hubHtml.includes(`<title>${lessonGuideHub.metaTitle}</title>`));
assert.ok(hubHtml.includes(`"@type":"CollectionPage"`));
for (const guide of lessonGuides) {
  assert.ok(hubHtml.includes(getLessonGuidePath(guide.slug)));
}

console.info("lesson guide SEO smoke checks passed");