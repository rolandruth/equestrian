/**
 * Pure (no-DB) helpers for the CSV import pipeline.
 *
 * Split into a separate module so they can be exercised by a deterministic
 * smoke test without touching the database.
 */

// ─── US State tables (duplicated here to keep this module dependency-free) ───

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming",
};

/** Full-name (lowercase) → abbreviation */
const FULL_NAME_TO_ABBR = new Map<string, string>();
for (const [abbr, name] of Object.entries(US_STATES)) {
  FULL_NAME_TO_ABBR.set(name.toLowerCase(), abbr);
}

/**
 * Return the two-letter abbreviation for a state token (abbreviation or full
 * name), or null if unrecognised.
 */
function stateAbbr(raw: string): string | null {
  const t = raw.trim();
  const upper = t.toUpperCase();
  if (upper.length === 2 && US_STATES[upper]) return upper;
  const abbr = FULL_NAME_TO_ABBR.get(t.toLowerCase());
  return abbr ?? null;
}

/**
 * Return the canonical full name for a state token, or null.
 */
function stateFullName(raw: string): string | null {
  const abbr = stateAbbr(raw);
  return abbr ? US_STATES[abbr] : null;
}

// ─── Location composition ─────────────────────────────────────────────────────

/**
 * Normalise a ZIP string so ZIP+4 and plain ZIP both compare cleanly.
 * Returns just the 5-digit base.
 */
function baseZip(zip: string): string {
  return zip.trim().replace(/-\d{4}$/, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsPhrase(location: string, value: string): boolean {
  if (!value) return false;
  return new RegExp(
    `(?:^|[^a-z0-9])${escapeRegExp(value)}(?:$|[^a-z0-9])`,
    "i",
  ).test(location);
}

function containsStateAbbreviation(location: string, abbreviation: string): boolean {
  return new RegExp(
    `(?:^|[,\\s])${escapeRegExp(abbreviation)}(?=\\s+\\d{5}(?:-\\d{4})?\\b|\\s*(?:,|$))`,
    "i",
  ).test(location);
}

function normalizeStateNames(location: string): string {
  let normalized = location;
  for (const [abbreviation, fullName] of Object.entries(US_STATES)) {
    normalized = normalized.replace(
      new RegExp(
        `(^|[,\\s])${escapeRegExp(abbreviation)}(?=\\s+\\d{5}(?:-\\d{4})?\\b)`,
        "gi",
      ),
      (_match, prefix: string) => `${prefix}${fullName}`,
    );
  }
  return normalized;
}

/**
 * Given the existing location string and optional loose city/state/zip parts,
 * return a possibly-amended location that:
 *   - Canonicalizes US state abbreviations to full state names.
 *   - Otherwise preserves existing data.
 *   - Appends only components that are not already represented.
 *
 * Matching is case-insensitive; state abbreviations and full names are treated
 * as equivalent; ZIP+4 is treated the same as the 5-digit base.
 */
export function composeLocation(
  existing: string | null | undefined,
  parts: { city?: string; state?: string; zip?: string; country?: string },
): string | null {
  const city    = parts.city?.trim()    || "";
  const state   = parts.state?.trim()   || "";
  const zip     = parts.zip?.trim()     || "";
  const country = parts.country?.trim() || "";

  const normalizedExisting = existing?.trim()
    ? normalizeStateNames(existing.trim())
    : null;

  // Nothing extra to add
  if (!city && !state && !zip && !country) return normalizedExisting;

  if (!normalizedExisting) {
    // Build from scratch
    const stateName = stateFullName(state) || state;
    const stateZip = [stateName, zip].filter(Boolean).join(" ");
    const segments = [city, stateZip, country].filter(Boolean);
    return segments.length ? segments.join(", ") : null;
  }

  const loc = normalizedExisting;
  // Pre-compute what the existing string already "contains" for each part.
  const cityPresent = city
    ? containsPhrase(loc, city)
    : true;

  // State: accept both abbreviation and full name
  let statePresent = !state;
  if (state) {
    const ab = stateAbbr(state);
    const fn = stateFullName(state);
    statePresent =
      (ab !== null && containsStateAbbreviation(loc, ab)) ||
      (fn !== null && containsPhrase(loc, fn));
  }

  // ZIP: compare 5-digit base
  let zipPresent = !zip;
  if (zip) {
    const base = baseZip(zip);
    // Check for the base anywhere in the existing string
    zipPresent = containsPhrase(loc, base);
  }

  const countryPresent = country
    ? containsPhrase(loc, country)
    : true;

  if (cityPresent && statePresent && zipPresent && countryPresent) {
    // Everything already there
    return loc;
  }

  // Build suffix from missing parts only
  const missingState = statePresent ? "" : (stateFullName(state) || state);
  const missingZip   = zipPresent   ? "" : zip;
  const missingCity  = cityPresent  ? "" : city;
  const missingCountry = countryPresent ? "" : country;

  const stateZipSuffix = [missingState, missingZip].filter(Boolean).join(" ");
  // If city is missing but there are other parts, city goes at the start of suffix
  const suffix = [missingCity, stateZipSuffix, missingCountry].filter(Boolean).join(", ");

  return suffix ? `${loc}, ${suffix}` : loc;
}

// ─── Slug allocation ──────────────────────────────────────────────────────────

/**
 * Convert a title to a URL-safe slug.
 * Non-ASCII characters are removed after lowercasing; if the result is empty
 * the fallback "listing" is used.
 */
export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // strip combining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "listing";
}

/**
 * Allocate non-conflicting slugs for a batch of titles given a set of already-
 * used slugs (from the database or earlier in the same batch).
 *
 * Returns an array of slugs parallel to `titles`.
 *
 * Algorithm:
 *   1. Try the base slug.
 *   2. Try base-2, base-3, … until a free slot is found.
 *
 * The `usedSlugs` set is mutated as slugs are allocated so that duplicates
 * within the same batch are also avoided.
 */
export function allocateSlugs(titles: string[], usedSlugs: Set<string>): string[] {
  return titles.map((title) => {
    const base = slugifyTitle(title);
    let candidate = base;
    let counter = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${base}-${counter}`;
      counter++;
    }
    usedSlugs.add(candidate);
    return candidate;
  });
}
