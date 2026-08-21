import { useEffect } from "react";
import {
  getLessonGuidePath,
  lessonGuideHub,
  type LessonGuide,
} from "@workspace/lesson-guides";

type GuideMetadataState =
  | { kind: "hub" }
  | { kind: "article"; guide: LessonGuide }
  | { kind: "notFound" };

function upsertMeta(
  attribute: "name" | "property",
  key: string,
  content: string,
): void {
  let element = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function upsertCanonical(href: string): void {
  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = href;
}

export function useGuideMetadata(state: GuideMetadataState): void {
  const guide = state.kind === "article" ? state.guide : undefined;

  useEffect(() => {
    const origin = window.location.origin;
    const imageUrl = `${origin}/opengraph.jpg`;
    const notFound = state.kind === "notFound";
    const title = notFound
      ? "Guide Not Found | SaddleUpGuide"
      : guide?.metaTitle ?? lessonGuideHub.metaTitle;
    const description = notFound
      ? "This horse riding lesson guide could not be found."
      : guide?.description ?? lessonGuideHub.description;
    const canonicalUrl = notFound
      ? `${origin}${window.location.pathname}`
      : `${origin}${guide ? getLessonGuidePath(guide.slug) : getLessonGuidePath()}`;

    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", notFound ? "noindex,follow" : "index,follow");
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", guide ? "article" : "website");
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("property", "og:image", imageUrl);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", imageUrl);
    upsertCanonical(canonicalUrl);
  }, [guide, state.kind]);
}