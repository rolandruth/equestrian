const DEFAULT_SITE_TITLE = "SaddleUpGuide";
const MAX_TITLE_LENGTH = 65;
const MAX_DESCRIPTION_LENGTH = 160;

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
};

export interface ListingNormalizedLocation {
  cityName?: string | null;
  stateName?: string | null;
  postalCode?: string | null;
}

export interface ListingService {
  slug?: string | null;
  label?: string | null;
}

export interface ListingSeoInput {
  title: string;
  siteTitle?: string | null;
  category?: string | null;
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  normalizedLocation?: ListingNormalizedLocation | null;
  confirmedServices?: ListingService[] | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  customFields?: unknown;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

export interface ListingSeoResult {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  contentDescription: string;
  locationLabel: string | null;
  serviceLabels: string[];
  usedCustomTitle: boolean;
  usedCustomDescription: boolean;
}

export interface ListingSeoQuality {
  missingTitle: boolean;
  missingDescription: boolean;
  weakTitle: boolean;
  weakDescription: boolean;
  needsImprovement: boolean;
}

export interface ListingStructuredDataOptions {
  canonicalUrl: string;
  origin: string;
  categoryUrl?: string | null;
  imageUrl?: string | null;
}

export interface ListingCrawlerShellOptions {
  canonicalUrl: string;
  categoryUrl?: string | null;
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lt: "<",
    nbsp: " ",
    quot: "\"",
    rdquo: "”",
    rsquo: "’",
  };

  return value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[String(name).toLowerCase()] ?? match);
}

export function cleanListingText(value: unknown): string {
  if (typeof value !== "string") return "";
  return decodeEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparable(value: unknown): string {
  return cleanListingText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function truncateAtWord(value: string, maxLength: number): string {
  const clean = cleanListingText(value);
  if (clean.length <= maxLength) return clean;
  const contentLength = Math.max(1, maxLength - 1);
  const slice = clean.slice(0, contentLength + 1);
  const lastSpace = slice.lastIndexOf(" ");
  const truncated = (lastSpace >= Math.floor(contentLength * 0.7)
    ? slice.slice(0, lastSpace)
    : slice.slice(0, contentLength))
    .replace(/[\s,;:|–—-]+$/g, "");
  return `${truncated}…`;
}

function resolveSiteTitle(value: unknown): string {
  const clean = cleanListingText(value);
  if (!clean || /^(?:equestrian\s+)?directory$/i.test(clean)) return DEFAULT_SITE_TITLE;
  return clean;
}

function expandStateSegment(segment: string): string {
  const match = segment.trim().match(/^([A-Za-z]{2})(\s+\d{5}(?:-\d{4})?)?$/);
  if (!match) return segment.trim();
  const stateName = STATE_NAMES[match[1].toUpperCase()];
  return stateName ? `${stateName}${match[2] ?? ""}` : segment.trim();
}

function collapseDuplicatedLocation(value: string): string {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 4) {
    const first = normalizeComparable(parts[0]);
    const penultimate = normalizeComparable(parts.at(-2));
    if (first && first === penultimate) {
      return parts.slice(-2).map(expandStateSegment).join(", ");
    }
  }

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const expanded = expandStateSegment(part);
    const comparable = normalizeComparable(expanded);
    if (!comparable || seen.has(comparable)) continue;
    seen.add(comparable);
    unique.push(expanded);
  }
  return unique.join(", ");
}

export function getListingLocationLabel(input: ListingSeoInput, includePostalCode = true): string | null {
  const city = cleanListingText(input.normalizedLocation?.cityName);
  const state = expandStateSegment(cleanListingText(input.normalizedLocation?.stateName));
  const postalCode = includePostalCode ? cleanListingText(input.normalizedLocation?.postalCode) : "";
  const normalized = [city, state].filter(Boolean).join(", ");
  if (normalized) return [normalized, postalCode].filter(Boolean).join(" ");

  const raw = collapseDuplicatedLocation(cleanListingText(input.location));
  if (!raw) return null;
  if (includePostalCode) return raw;
  return raw.replace(/\s+\d{5}(?:-\d{4})?$/, "").trim();
}

function getServiceLabels(input: ListingSeoInput): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const service of input.confirmedServices ?? []) {
    const label = cleanListingText(service?.label);
    const comparable = normalizeComparable(label);
    if (!label || !comparable || seen.has(comparable)) continue;
    seen.add(comparable);
    labels.push(label);
  }
  return labels.slice(0, 3);
}

export function isMeaningfulListingMetaTitle(value: unknown, listingTitle: unknown): boolean {
  const clean = cleanListingText(value);
  if (!clean || normalizeComparable(clean) === normalizeComparable(listingTitle)) return false;
  return clean.length >= 22 && clean.split(/\s+/).length >= 3;
}

export function isMeaningfulListingMetaDescription(value: unknown, listingTitle: unknown): boolean {
  const clean = cleanListingText(value);
  if (!clean || normalizeComparable(clean) === normalizeComparable(listingTitle)) return false;
  return clean.length >= 90 && clean.split(/\s+/).length >= 14;
}

export function getListingSeoQuality(input: ListingSeoInput): ListingSeoQuality {
  const missingTitle = !cleanListingText(input.metaTitle);
  const missingDescription = !cleanListingText(input.metaDescription);
  const weakTitle = !missingTitle && !isMeaningfulListingMetaTitle(input.metaTitle, input.title);
  const weakDescription = !missingDescription
    && !isMeaningfulListingMetaDescription(input.metaDescription, input.title);
  return {
    missingTitle,
    missingDescription,
    weakTitle,
    weakDescription,
    needsImprovement: missingTitle || missingDescription || weakTitle || weakDescription,
  };
}

function buildFallbackTitle(input: ListingSeoInput, siteTitle: string, serviceLabels: string[]): string {
  const listingTitle = cleanListingText(input.title) || "Equestrian Business";
  const location = getListingLocationLabel(input, false);
  const titleComparable = normalizeComparable(listingTitle);
  const primaryService = serviceLabels.find(
    (label) => !titleComparable.includes(normalizeComparable(label)),
  );

  const suffixes = [
    primaryService && location ? `${primaryService} in ${location} | ${siteTitle}` : "",
    primaryService ? `${primaryService} | ${siteTitle}` : "",
    location ? `Equestrian Services in ${location} | ${siteTitle}` : "",
    `Equestrian Services | ${siteTitle}`,
    siteTitle,
  ].filter(Boolean);

  for (const suffix of suffixes) {
    const candidate = `${listingTitle} | ${suffix}`;
    if (candidate.length <= MAX_TITLE_LENGTH) return candidate;
  }
  return truncateAtWord(`${listingTitle} | ${siteTitle}`, MAX_TITLE_LENGTH);
}

function composeDescription(base: string, detailOptions: string[]): string {
  const cleanBase = cleanListingText(base).replace(/[.!?]+$/, "");
  for (const details of detailOptions) {
    const cleanDetails = cleanListingText(details);
    if (!cleanBase) return truncateAtWord(cleanDetails, MAX_DESCRIPTION_LENGTH);
    const combined = `${cleanBase}. ${cleanDetails}`;
    if (combined.length <= MAX_DESCRIPTION_LENGTH) return combined;
  }
  return truncateAtWord(cleanBase, MAX_DESCRIPTION_LENGTH);
}

function buildFallbackDescription(
  input: ListingSeoInput,
  siteTitle: string,
  serviceLabels: string[],
): { description: string; contentDescription: string } {
  const listingTitle = cleanListingText(input.title) || "this equestrian business";
  const location = getListingLocationLabel(input);
  const sourceContent = [input.description, input.summary]
    .map(cleanListingText)
    .find((value) => value.length >= 45 && normalizeComparable(value) !== normalizeComparable(listingTitle));
  const serviceText = serviceLabels.length > 0
    ? serviceLabels.slice(0, 2).join(" and ")
    : "equestrian services";
  const context = `${location ? `Located in ${location}, ` : ""}${listingTitle} offers ${serviceText}.`;
  const detailOptions = [
    `View services, contact details, and local equestrian resources on ${siteTitle}.`,
    `View services, contact information, and more on ${siteTitle}.`,
    `Find contact details and more on ${siteTitle}.`,
  ];

  if (sourceContent) {
    const description = sourceContent.length >= 125
      ? truncateAtWord(sourceContent, MAX_DESCRIPTION_LENGTH)
      : composeDescription(sourceContent, detailOptions);
    return {
      description,
      contentDescription: sourceContent,
    };
  }

  return {
    description: composeDescription(context, detailOptions),
    contentDescription: composeDescription(context, detailOptions),
  };
}

export function buildListingSeo(input: ListingSeoInput): ListingSeoResult {
  const siteTitle = resolveSiteTitle(input.siteTitle);
  const serviceLabels = getServiceLabels(input);
  const locationLabel = getListingLocationLabel(input);
  const usedCustomTitle = isMeaningfulListingMetaTitle(input.metaTitle, input.title);
  const usedCustomDescription = isMeaningfulListingMetaDescription(input.metaDescription, input.title);
  const usableOgTitle = isMeaningfulListingMetaTitle(input.ogTitle, input.title);
  const usableOgDescription = isMeaningfulListingMetaDescription(input.ogDescription, input.title);
  const fallback = buildFallbackDescription(input, siteTitle, serviceLabels);
  const title = usedCustomTitle
    ? truncateAtWord(cleanListingText(input.metaTitle), MAX_TITLE_LENGTH)
    : usableOgTitle
      ? truncateAtWord(cleanListingText(input.ogTitle), MAX_TITLE_LENGTH)
      : buildFallbackTitle(input, siteTitle, serviceLabels);
  const description = usedCustomDescription
    ? truncateAtWord(cleanListingText(input.metaDescription), MAX_DESCRIPTION_LENGTH)
    : usableOgDescription
      ? truncateAtWord(cleanListingText(input.ogDescription), MAX_DESCRIPTION_LENGTH)
      : fallback.description;

  return {
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    contentDescription: fallback.contentDescription,
    locationLabel,
    serviceLabels,
    usedCustomTitle,
    usedCustomDescription,
  };
}

function toAbsoluteHttpUrl(value: unknown, origin: string): string | null {
  const clean = cleanListingText(value);
  if (!clean) return null;
  if (/^https?:\/\//i.test(clean)) return clean;
  if (/^\/\//.test(clean)) return `https:${clean}`;
  if (/^(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:[/?#].*)?$/i.test(clean)) {
    return `https://${clean}`;
  }
  if (clean.startsWith("/")) return `${origin.replace(/\/+$/, "")}${clean}`;
  return null;
}

export function getListingImageUrl(customFields: unknown, origin: string): string {
  if (customFields && typeof customFields === "object") {
    for (const value of Object.values(customFields as Record<string, unknown>)) {
      if (typeof value !== "string") continue;
      const url = toAbsoluteHttpUrl(value, origin);
      if (url && /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(url)) return url;
    }
  }
  return `${origin.replace(/\/+$/, "")}/opengraph.jpg`;
}

function buildPostalAddress(input: ListingSeoInput): Record<string, string> | string | undefined {
  const city = cleanListingText(input.normalizedLocation?.cityName);
  const state = expandStateSegment(cleanListingText(input.normalizedLocation?.stateName));
  const postalCode = cleanListingText(input.normalizedLocation?.postalCode);
  if (city || state || postalCode) {
    return {
      "@type": "PostalAddress",
      ...(city ? { addressLocality: city } : {}),
      ...(state ? { addressRegion: state } : {}),
      ...(postalCode ? { postalCode } : {}),
      addressCountry: "US",
    };
  }

  return getListingLocationLabel(input) ?? undefined;
}

export function buildListingStructuredData(
  input: ListingSeoInput,
  options: ListingStructuredDataOptions,
): Record<string, unknown> {
  const seo = buildListingSeo(input);
  const externalWebsite = toAbsoluteHttpUrl(input.website, options.origin);
  const address = buildPostalAddress(input);
  const latitude = input.latitude == null ? null : Number(input.latitude);
  const longitude = input.longitude == null ? null : Number(input.longitude);
  const category = cleanListingText(input.category);
  const breadcrumbItems = [
    { "@type": "ListItem", position: 1, name: "Home", item: `${options.origin}/` },
    { "@type": "ListItem", position: 2, name: "Browse", item: `${options.origin}/browse` },
    ...(category && options.categoryUrl
      ? [{ "@type": "ListItem", position: 3, name: category, item: options.categoryUrl }]
      : []),
    {
      "@type": "ListItem",
      position: category && options.categoryUrl ? 4 : 3,
      name: cleanListingText(input.title),
      item: options.canonicalUrl,
    },
  ];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LocalBusiness",
        "@id": `${options.canonicalUrl}#business`,
        name: cleanListingText(input.title),
        description: seo.description,
        url: options.canonicalUrl,
        image: options.imageUrl || undefined,
        telephone: cleanListingText(input.contactPhone) || undefined,
        address,
        sameAs: externalWebsite || undefined,
        knowsAbout: seo.serviceLabels.length > 0 ? seo.serviceLabels : undefined,
        geo: Number.isFinite(latitude) && Number.isFinite(longitude)
          ? {
              "@type": "GeoCoordinates",
              latitude,
              longitude,
            }
          : undefined,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbItems,
      },
    ],
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderListingCrawlerShell(
  input: ListingSeoInput,
  options: ListingCrawlerShellOptions,
): string {
  const seo = buildListingSeo(input);
  const category = cleanListingText(input.category);
  const canonicalOrigin = options.canonicalUrl.match(/^https?:\/\/[^/]+/i)?.[0] ?? "";
  const websiteUrl = toAbsoluteHttpUrl(input.website, canonicalOrigin);
  const details = [
    seo.serviceLabels.length > 0
      ? `<dt>Services</dt><dd>${escapeHtml(seo.serviceLabels.join(", "))}</dd>`
      : "",
    seo.locationLabel ? `<dt>Location</dt><dd>${escapeHtml(seo.locationLabel)}</dd>` : "",
    cleanListingText(input.contactPhone)
      ? `<dt>Phone</dt><dd>${escapeHtml(cleanListingText(input.contactPhone))}</dd>`
      : "",
    websiteUrl
      ? `<dt>Website</dt><dd><a href="${escapeHtml(websiteUrl)}" rel="noopener noreferrer">${escapeHtml(websiteUrl.replace(/^https?:\/\/(www\.)?/, ""))}</a></dd>`
      : "",
  ].filter(Boolean).join("");
  const breadcrumbs = [
    `<a href="/">Home</a>`,
    `<a href="/browse">Browse</a>`,
    category && options.categoryUrl
      ? `<a href="${escapeHtml(options.categoryUrl)}">${escapeHtml(category)}</a>`
      : "",
    `<span aria-current="page">${escapeHtml(cleanListingText(input.title))}</span>`,
  ].filter(Boolean).join("<span aria-hidden=\"true\"> / </span>");
  const content = normalizeComparable(seo.contentDescription) !== normalizeComparable(seo.description)
    ? `<section aria-label="About ${escapeHtml(cleanListingText(input.title))}"><h2>About ${escapeHtml(cleanListingText(input.title))}</h2><p>${escapeHtml(seo.contentDescription)}</p></section>`
    : "";
  const relatedLinks = [
    options.categoryUrl && category
      ? `<a href="${escapeHtml(options.categoryUrl)}">Browse more equestrian listings in ${escapeHtml(category)}</a>`
      : "",
    `<a href="/browse">Browse all equestrian businesses and services</a>`,
    `<a href="/horse-riding-lessons">Read the horse riding lessons guide</a>`,
  ].filter(Boolean).map((link) => `<li>${link}</li>`).join("");

  return `<article class="seo-entry-shell">
    <nav aria-label="Breadcrumb">${breadcrumbs}</nav>
    <h1>${escapeHtml(cleanListingText(input.title))}</h1>
    <p class="seo-entry-summary">${escapeHtml(seo.description)}</p>
    ${details ? `<dl>${details}</dl>` : ""}
    ${content}
    <section aria-labelledby="seo-entry-related"><h2 id="seo-entry-related">Explore more equestrian resources</h2><ul>${relatedLinks}</ul></section>
  </article>`;
}

export const LISTING_CRAWLER_SHELL_STYLES = ".seo-entry-shell{box-sizing:border-box;max-width:960px;margin:0 auto;padding:32px 24px;font:16px/1.6 system-ui,sans-serif;color:#292524}.seo-entry-shell nav{font-size:14px;margin-bottom:24px}.seo-entry-shell h1{font-size:clamp(28px,5vw,42px);line-height:1.15;margin:0 0 16px}.seo-entry-shell h2{font-size:22px;line-height:1.3;margin:28px 0 10px}.seo-entry-summary{font-size:19px}.seo-entry-shell dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;margin:24px 0}.seo-entry-shell dt{font-weight:700}.seo-entry-shell dd{margin:0}.seo-entry-shell a{color:#1d4ed8}";

export function injectListingCrawlerShell(
  html: string,
  input: ListingSeoInput,
  options: ListingCrawlerShellOptions,
): string {
  const root = /<div\s+id=["']root["']\s*><\/div>/i;
  if (!root.test(html)) return html;
  let out = html.replace(root, `<div id="root">${renderListingCrawlerShell(input, options)}</div>`);
  if (!out.includes("id=\"seo-entry-shell-styles\"")) {
    out = out.replace(
      "</head>",
      `    <style id="seo-entry-shell-styles">${LISTING_CRAWLER_SHELL_STYLES}</style>\n  </head>`,
    );
  }
  return out;
}