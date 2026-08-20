/**
 * Centralized helpers for qualified category hub links.
 *
 * A browse category hub (/browse/:category) is only linked as a crawlable
 * anchor when the category has at least HUB_MIN_COUNT entries.  This matches
 * the threshold used by the sitemap and SEO-hub generators so that crawlers
 * only discover pages we intentionally promote as indexable hubs.
 *
 * Usage:
 *   import { HUB_MIN_COUNT, getCategoryHubPath, isCategoryQualified } from "@/lib/seoLinks";
 */

/** Minimum entry count for a category to warrant a crawlable hub page. */
export const HUB_MIN_COUNT = 10;

export type CategoryHubStat = {
  category: string;
  count: number;
};

/** Returns the canonical /browse/:category pathname for a category slug. */
export function getCategoryHubPath(category: string): string {
  return `/browse/${encodeURIComponent(category)}`;
}

/**
 * Returns true when `category` exists in `categoryBreakdown` with count >= HUB_MIN_COUNT.
 *
 * @param category        The category string to check.
 * @param categoryBreakdown  Array from publicStats.categoryBreakdown (or an empty array).
 */
export function isCategoryQualified(
  category: string,
  categoryBreakdown: CategoryHubStat[]
): boolean {
  if (category.trim().length === 0) return false;
  const entry = categoryBreakdown.find((c) => c.category === category);
  return entry !== undefined && entry.count >= HUB_MIN_COUNT;
}

/** Returns only category hubs that meet the crawlable-link threshold. */
export function getQualifiedCategoryHubs(
  categoryBreakdown: CategoryHubStat[]
): CategoryHubStat[] {
  return categoryBreakdown.filter(
    (entry) => entry.category.trim().length > 0 && entry.count >= HUB_MIN_COUNT
  );
}

/** Accepts only absolute HTTP(S) URLs for public external links. */
export function isSafeExternalUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}
