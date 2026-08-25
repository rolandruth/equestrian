import {
  getLessonGuide,
  getLessonGuidePath,
  lessonGuideHub,
  lessonGuides,
  LESSON_GUIDE_BASE_PATH,
  LESSON_GUIDE_SEARCH_PATH,
  type LessonGuide,
} from "./index.ts";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceTitle(html: string, title: string): string {
  return html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function replaceMeta(
  html: string,
  attr: "name" | "property",
  key: string,
  content: string,
): string {
  const escaped = escapeHtml(content);
  const existing = new RegExp(`(<meta\\s+${attr}=["']${key}["']\\s+content=["'])[^"']*(["']\\s*\\/?>)`, "i");
  if (existing.test(html)) return html.replace(existing, `$1${escaped}$2`);
  return html.replace("</head>", `    <meta ${attr}="${key}" content="${escaped}" />\n  </head>`);
}

function replaceCanonical(html: string, href: string): string {
  const escaped = escapeHtml(href);
  const existing = /<link\s+rel=["']canonical["']\s+href=["'][^"']*["']\s*\/?>/i;
  if (existing.test(html)) {
    return html.replace(existing, `<link rel="canonical" href="${escaped}" />`);
  }
  return html.replace("</head>", `    <link rel="canonical" href="${escaped}" />\n  </head>`);
}

function injectJsonLd(html: string, data: unknown): string {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  const script = `    <script id="guide-structured-data" type="application/ld+json">${json}</script>\n`;
  const existing = /<script\s+id=["']guide-structured-data["'][^>]*>[\s\S]*?<\/script>\s*/i;
  if (existing.test(html)) return html.replace(existing, script);
  return html.replace("</head>", `${script}  </head>`);
}

function injectGuideShell(html: string, guide?: LessonGuide): string {
  const breadcrumbs = guide
    ? [
        `<a href="/">Home</a>`,
        `<a href="${LESSON_GUIDE_BASE_PATH}">Horse Riding Lesson Guides</a>`,
        `<span aria-current="page">${escapeHtml(guide.shortTitle)}</span>`,
      ]
    : [
        `<a href="/">Home</a>`,
        `<span aria-current="page">${escapeHtml(lessonGuideHub.title)}</span>`,
      ];

  const body = guide
    ? `<article>
        <p class="seo-guide-eyebrow">${escapeHtml(guide.eyebrow)} · ${escapeHtml(guide.readingTime)}</p>
        <h1>${escapeHtml(guide.title)}</h1>
        <p class="seo-guide-summary">${escapeHtml(guide.summary)}</p>
        <section aria-labelledby="guide-takeaways">
          <h2 id="guide-takeaways">Key takeaways</h2>
          <ul>${guide.keyTakeaways.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </section>
        ${guide.sections
          .map(
            (section) => `<section>
              <h2>${escapeHtml(section.heading)}</h2>
              ${(section.paragraphs ?? []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
              ${section.bullets?.length
                ? `<ul>${section.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
                : ""}
              ${section.callout ? `<aside>${escapeHtml(section.callout)}</aside>` : ""}
            </section>`,
          )
          .join("")}
        <section aria-labelledby="related-guides">
          <h2 id="related-guides">Related riding lesson guides</h2>
          <ul>${guide.relatedSlugs
            .map(getLessonGuide)
            .filter((related): related is LessonGuide => Boolean(related))
            .map(
              (related) =>
                `<li><a href="${getLessonGuidePath(related.slug)}">${escapeHtml(related.title)}</a></li>`,
            )
            .join("")}</ul>
        </section>
        <p class="seo-guide-cta"><a href="${LESSON_GUIDE_SEARCH_PATH}">Find horse riding lessons in the directory</a></p>
      </article>`
    : `<main>
        <p class="seo-guide-eyebrow">${escapeHtml(lessonGuideHub.eyebrow)}</p>
        <h1>${escapeHtml(lessonGuideHub.title)}</h1>
        <p class="seo-guide-summary">${escapeHtml(lessonGuideHub.summary)}</p>
        <section aria-label="Horse riding lesson guides">
          <ul class="seo-guide-list">${lessonGuides
            .map(
              (item) => `<li>
                <h2><a href="${getLessonGuidePath(item.slug)}">${escapeHtml(item.title)}</a></h2>
                <p>${escapeHtml(item.description)}</p>
              </li>`,
            )
            .join("")}</ul>
        </section>
        <p class="seo-guide-cta"><a href="${LESSON_GUIDE_SEARCH_PATH}">Browse horse riding lesson providers</a></p>
      </main>`;

  const shell = `<div class="seo-guide-shell">
    <nav aria-label="Breadcrumb">${breadcrumbs.join('<span aria-hidden="true"> / </span>')}</nav>
    ${body}
  </div>`;
  const root = /<div\s+id=["']root["']\s*><\/div>/i;
  if (!root.test(html)) return html;

  let output = html.replace(root, `<div id="root">${shell}</div>`);
  if (!output.includes('id="seo-guide-shell-styles"')) {
    output = output.replace(
      "</head>",
      `    <style id="seo-guide-shell-styles">.seo-guide-shell{box-sizing:border-box;max-width:960px;margin:0 auto;padding:32px 24px 64px;font:16px/1.7 system-ui,sans-serif;color:#292524}.seo-guide-shell nav{font-size:14px;margin-bottom:32px}.seo-guide-shell h1{font-size:clamp(32px,6vw,54px);line-height:1.08;margin:0 0 20px}.seo-guide-shell h2{font-size:clamp(22px,4vw,30px);line-height:1.2;margin:36px 0 12px}.seo-guide-shell p,.seo-guide-shell li{max-width:76ch}.seo-guide-shell li+li{margin-top:8px}.seo-guide-shell a{color:#1d4ed8}.seo-guide-eyebrow{font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:13px;color:#6b4f2a}.seo-guide-summary{font-size:20px}.seo-guide-shell aside{margin:24px 0;padding:18px;border-left:4px solid #8b6a3f;background:#f8f4ec}.seo-guide-list{list-style:none;padding:0}.seo-guide-list>li{padding:24px 0;border-bottom:1px solid #ded8ce}.seo-guide-list h2{margin:0 0 8px}.seo-guide-cta{margin-top:36px}.seo-guide-cta a{display:inline-block;padding:12px 18px;border-radius:8px;background:#264d3f;color:#fff;text-decoration:none;font-weight:700}</style>\n  </head>`,
    );
  }
  return output;
}

export function injectLessonGuideSeoHtml(
  html: string,
  requestPath: string,
  origin: string,
): string | null {
  const normalizedPath = requestPath.replace(/\/+$/, "") || "/";
  const pathGuide = lessonGuides.find(
    (item) => getLessonGuidePath(item.slug).replace(/\/+$/, "") === normalizedPath,
  );
  if (
    normalizedPath !== LESSON_GUIDE_BASE_PATH &&
    !normalizedPath.startsWith(`${LESSON_GUIDE_BASE_PATH}/`) &&
    !pathGuide
  ) {
    return null;
  }

  const publicOrigin = origin.replace(/\/+$/, "");
  let slug: string | null = null;
  if (pathGuide) {
    slug = pathGuide.slug;
  } else {
    try {
      slug = normalizedPath === LESSON_GUIDE_BASE_PATH
        ? null
        : decodeURIComponent(normalizedPath.slice(`${LESSON_GUIDE_BASE_PATH}/`.length));
    } catch {
      slug = "__invalid__";
    }
  }
  const guide = pathGuide ?? (slug ? getLessonGuide(slug) : undefined);

  if (slug && !guide) {
    const invalidUrl = `${publicOrigin}${requestPath}`;
    let output = replaceTitle(html, "Guide Not Found | SaddleUpGuide");
    output = replaceMeta(output, "name", "description", "This horse riding lesson guide could not be found.");
    output = replaceMeta(output, "name", "robots", "noindex,follow");
    output = replaceCanonical(output, invalidUrl);
    return output;
  }

  const title = guide?.metaTitle ?? lessonGuideHub.metaTitle;
  const description = guide?.description ?? lessonGuideHub.description;
  const canonicalPath = guide ? getLessonGuidePath(guide.slug) : LESSON_GUIDE_BASE_PATH;
  const canonicalUrl = `${publicOrigin}${canonicalPath}`;
  const imageUrl = `${publicOrigin}/opengraph.jpg`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      guide
        ? {
            "@type": "Article",
            headline: guide.title,
            description: guide.description,
            mainEntityOfPage: canonicalUrl,
            image: imageUrl,
            publisher: {
              "@type": "Organization",
              name: "SaddleUpGuide",
              url: `${publicOrigin}/`,
            },
            about: "Horse riding lessons",
          }
        : {
            "@type": "CollectionPage",
            name: lessonGuideHub.title,
            description: lessonGuideHub.description,
            url: canonicalUrl,
            hasPart: lessonGuides.map((item) => ({
              "@type": "Article",
              name: item.title,
              url: `${publicOrigin}${getLessonGuidePath(item.slug)}`,
            })),
          },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${publicOrigin}/` },
          {
            "@type": "ListItem",
            position: 2,
            name: lessonGuideHub.title,
            item: `${publicOrigin}${LESSON_GUIDE_BASE_PATH}`,
          },
          ...(guide
            ? [{
                "@type": "ListItem",
                position: 3,
                name: guide.shortTitle,
                item: canonicalUrl,
              }]
            : []),
        ],
      },
    ],
  };

  let output = replaceTitle(html, title);
  output = replaceMeta(output, "name", "description", description);
  output = replaceMeta(output, "property", "og:title", title);
  output = replaceMeta(output, "property", "og:description", description);
  output = replaceMeta(output, "property", "og:type", guide ? "article" : "website");
  output = replaceMeta(output, "property", "og:url", canonicalUrl);
  output = replaceMeta(output, "property", "og:image", imageUrl);
  output = replaceMeta(output, "name", "twitter:card", "summary_large_image");
  output = replaceMeta(output, "name", "twitter:title", title);
  output = replaceMeta(output, "name", "twitter:description", description);
  output = replaceMeta(output, "name", "twitter:image", imageUrl);
  output = replaceCanonical(output, canonicalUrl);
  output = injectJsonLd(output, structuredData);
  return injectGuideShell(output, guide);
}