/**
 * Local SEO business logic
 * - Controlled equestrian service taxonomy
 * - Conservative location parser (scans comma segments from end)
 * - Classification workflow helpers
 */
import { db } from "@workspace/db";
import {
  entries,
  entryLocations,
  serviceTypes,
  entryServiceTypes,
} from "@workspace/db";
import { eq, and, inArray, sql, count, gte, isNotNull, or } from "drizzle-orm";

// ─── Controlled taxonomy ────────────────────────────────────────────────────

export const EQUESTRIAN_TAXONOMY = [
  {
    slug: "horse-riding-lessons",
    label: "Horse Riding Lessons",
    description: "Schools and instructors offering riding instruction",
  },
  {
    slug: "horse-training",
    label: "Horse Training",
    description: "Professional horse training services",
  },
  {
    slug: "horse-boarding",
    label: "Horse Boarding",
    description: "Stables offering horse boarding and care",
  },
  {
    slug: "trail-riding",
    label: "Trail Riding",
    description: "Guided or self-guided trail riding experiences",
  },
  {
    slug: "farrier-services",
    label: "Farrier Services",
    description: "Professional horseshoeing and hoof care",
  },
  {
    slug: "equine-veterinary",
    label: "Equine Veterinary",
    description: "Veterinary care for horses and equines",
  },
  {
    slug: "horse-rescue",
    label: "Horse Rescue",
    description: "Horse rescue organizations and sanctuaries",
  },
] as const;

export type KnownServiceSlug = (typeof EQUESTRIAN_TAXONOMY)[number]["slug"];

/** Map from import custom_ridingtype values to controlled service slugs */
const RIDING_TYPE_TO_SERVICE: Record<string, KnownServiceSlug> = {
  "riding-school": "horse-riding-lessons",
  "independent-trainer": "horse-training",
  "horse-boarding": "horse-boarding",
  "trail-riding": "trail-riding",
  farrier: "farrier-services",
  "farrier-services": "farrier-services",
  vet: "equine-veterinary",
  veterinary: "equine-veterinary",
  "equine-vet": "equine-veterinary",
  rescue: "horse-rescue",
  "horse-rescue": "horse-rescue",
};

// ─── US State normalization ──────────────────────────────────────────────────
// Maps both abbreviations and full names → { fullName, slug }

const US_STATES: Record<string, { name: string; slug: string }> = {
  AL: { name: "Alabama", slug: "alabama" },
  AK: { name: "Alaska", slug: "alaska" },
  AZ: { name: "Arizona", slug: "arizona" },
  AR: { name: "Arkansas", slug: "arkansas" },
  CA: { name: "California", slug: "california" },
  CO: { name: "Colorado", slug: "colorado" },
  CT: { name: "Connecticut", slug: "connecticut" },
  DE: { name: "Delaware", slug: "delaware" },
  DC: { name: "District of Columbia", slug: "district-of-columbia" },
  FL: { name: "Florida", slug: "florida" },
  GA: { name: "Georgia", slug: "georgia" },
  HI: { name: "Hawaii", slug: "hawaii" },
  ID: { name: "Idaho", slug: "idaho" },
  IL: { name: "Illinois", slug: "illinois" },
  IN: { name: "Indiana", slug: "indiana" },
  IA: { name: "Iowa", slug: "iowa" },
  KS: { name: "Kansas", slug: "kansas" },
  KY: { name: "Kentucky", slug: "kentucky" },
  LA: { name: "Louisiana", slug: "louisiana" },
  ME: { name: "Maine", slug: "maine" },
  MD: { name: "Maryland", slug: "maryland" },
  MA: { name: "Massachusetts", slug: "massachusetts" },
  MI: { name: "Michigan", slug: "michigan" },
  MN: { name: "Minnesota", slug: "minnesota" },
  MS: { name: "Mississippi", slug: "mississippi" },
  MO: { name: "Missouri", slug: "missouri" },
  MT: { name: "Montana", slug: "montana" },
  NE: { name: "Nebraska", slug: "nebraska" },
  NV: { name: "Nevada", slug: "nevada" },
  NH: { name: "New Hampshire", slug: "new-hampshire" },
  NJ: { name: "New Jersey", slug: "new-jersey" },
  NM: { name: "New Mexico", slug: "new-mexico" },
  NY: { name: "New York", slug: "new-york" },
  NC: { name: "North Carolina", slug: "north-carolina" },
  ND: { name: "North Dakota", slug: "north-dakota" },
  OH: { name: "Ohio", slug: "ohio" },
  OK: { name: "Oklahoma", slug: "oklahoma" },
  OR: { name: "Oregon", slug: "oregon" },
  PA: { name: "Pennsylvania", slug: "pennsylvania" },
  RI: { name: "Rhode Island", slug: "rhode-island" },
  SC: { name: "South Carolina", slug: "south-carolina" },
  SD: { name: "South Dakota", slug: "south-dakota" },
  TN: { name: "Tennessee", slug: "tennessee" },
  TX: { name: "Texas", slug: "texas" },
  UT: { name: "Utah", slug: "utah" },
  VT: { name: "Vermont", slug: "vermont" },
  VA: { name: "Virginia", slug: "virginia" },
  WA: { name: "Washington", slug: "washington" },
  WV: { name: "West Virginia", slug: "west-virginia" },
  WI: { name: "Wisconsin", slug: "wisconsin" },
  WY: { name: "Wyoming", slug: "wyoming" },
};

// Build a lookup from full name (lowercase) → same record
const US_STATE_BY_FULLNAME = new Map<string, { name: string; slug: string }>();
for (const [abbr, rec] of Object.entries(US_STATES)) {
  US_STATE_BY_FULLNAME.set(rec.name.toLowerCase(), rec);
  // Also index the abbreviation itself
  US_STATE_BY_FULLNAME.set(abbr.toLowerCase(), rec);
}

/**
 * Resolve a raw state token (abbreviation or full name) to a canonical
 * { name, slug } pair. Returns null if unrecognised.
 */
function resolveState(raw: string): { name: string; slug: string } | null {
  const trimmed = raw.trim();
  // Try exact abbreviation (2-letter uppercase)
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && US_STATES[upper]) return US_STATES[upper];
  // Try full name / abbreviation (case-insensitive)
  return US_STATE_BY_FULLNAME.get(trimmed.toLowerCase()) ?? null;
}

// ─── Slug helper ─────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ─── Location interfaces ─────────────────────────────────────────────────────

interface LocationSuggestion {
  cityName: string | null;
  citySlug: string | null;
  stateName: string | null;
  stateSlug: string | null;
  postalCode: string | null;
  confidence: number;
  source: "deterministic";
}

interface ServiceSuggestion {
  serviceSlug: string;
  confidence: number;
  source: "deterministic";
}

interface EntryClassificationPreview {
  entryId: number;
  entryTitle: string;
  locationSuggestion: LocationSuggestion | null;
  serviceSuggestions: ServiceSuggestion[];
}

// ─── Conservative location parser ────────────────────────────────────────────
/**
 * Scans comma-separated segments from the END of the string looking for:
 *   … City, ST [ZIP] [, trailing]
 *   … City, StateName [ZIP] [, trailing]
 *   … ST ZIP  (no city)
 *   … StateName ZIP  (no city)
 *
 * A candidate is accepted only when the state token resolves to a known US
 * state. Confidence is:
 *   0.9  — unambiguous trailing City, State [ZIP] pair (2 or 3 final segments)
 *   0.75 — state-only with ZIP (no city identifiable)
 *   0.6  — state found but more than 3 trailing segments (might be a full address)
 *
 * The function never returns confidence ≥ 0.8 for ambiguous/full-address strings.
 */
function suggestLocationFromText(location: string | null): LocationSuggestion | null {
  if (!location) return null;
  const text = location.trim();
  if (!text) return null;

  // Split on commas and trim each segment
  const segments = text.split(",").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  // We search from the END for a segment containing a US state token
  // The segment immediately before it (if present) is the candidate city.
  // ZIP may appear appended to the state segment: "WI 54956" or "Wisconsin 54956"

  // Regex for a segment that is: <StateToken> [<ZIP>]
  const stateSegRe = /^([A-Za-z][A-Za-z ]{1,30})\s*(\d{5}(?:-\d{4})?)?$/;

  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    const m = stateSegRe.exec(seg);
    if (!m) continue;

    const stateToken = m[1].trim();
    const zip = m[2] ?? null;

    const resolved = resolveState(stateToken);
    if (!resolved) continue;

    // Found a valid state segment at position i.
    // City candidate is the segment immediately before (i-1), if any.
    const cityRaw = i > 0 ? segments[i - 1] : null;

    // Reject city candidates that look like street addresses:
    //   starts with digits (e.g. "6582 WI-76") → not a city
    const cityIsAddress = cityRaw ? /^\d/.test(cityRaw) : false;
    const cityName = cityRaw && !cityIsAddress ? cityRaw : null;
    const citySlug = cityName ? slugify(cityName) : null;

    // Determine total trailing segments consumed
    // trailing = from i to end
    const trailingCount = segments.length - i;

    let confidence: number;
    if (trailingCount <= 2 && cityName) {
      // Ideal: exactly 2 trailing segments (city + state[+zip])
      confidence = 0.9;
    } else if (trailingCount <= 2 && !cityName && zip) {
      // State+ZIP only, no city
      confidence = 0.75;
    } else if (trailingCount <= 2 && !cityName) {
      // State only, no city, no zip
      confidence = 0.6;
    } else if (trailingCount === 3 && cityName) {
      // e.g. "… City, State ZIP, ExtraTrailing" — slightly less certain
      confidence = 0.75;
    } else {
      // More than 3 trailing segments — full address; reduce confidence
      confidence = 0.6;
    }

    return {
      cityName,
      citySlug,
      stateName: resolved.name,
      stateSlug: resolved.slug,
      postalCode: zip,
      confidence,
      source: "deterministic",
    };
  }

  return null;
}

// ─── Service suggestion rules ────────────────────────────────────────────────

/** Suggest services based on title/category/tags text */
function suggestServicesFromText(entry: {
  title: string | null;
  category: string | null;
  tags: string | null;
  customFields: Record<string, unknown> | null;
}): ServiceSuggestion[] {
  const text = [entry.title, entry.category, entry.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const suggestions: ServiceSuggestion[] = [];

  const rules: Array<{ patterns: RegExp[]; slug: KnownServiceSlug; confidence: number }> =
    [
      {
        patterns: [/\blessons?\b/, /\binstruct/, /\bschool\b/, /\brides?\s+lesson/],
        slug: "horse-riding-lessons",
        confidence: 0.7,
      },
      {
        patterns: [/\btraining\b/, /\btrainer\b/, /\bbreaking\b/, /\bstarting\b/],
        slug: "horse-training",
        confidence: 0.7,
      },
      {
        patterns: [/\bboard(ing)?\b/, /\bstable\b/, /\bstall\b/, /\bpasture\b/],
        slug: "horse-boarding",
        confidence: 0.7,
      },
      {
        patterns: [/\btrail\b/, /\btrek\b/, /\brides?\b.*\btrail/],
        slug: "trail-riding",
        confidence: 0.65,
      },
      {
        patterns: [/\bfarrier\b/, /\bshoe(ing)?\b/, /\bhoof\b/],
        slug: "farrier-services",
        confidence: 0.8,
      },
      {
        patterns: [/\bvet(erinar)?\b/, /\bequine\s+vet/, /\bequine\s+med/, /\bhorse\s+vet/],
        slug: "equine-veterinary",
        confidence: 0.8,
      },
      {
        patterns: [/\brescue\b/, /\bsanctuary\b/, /\brehab(ilitat)?\b/],
        slug: "horse-rescue",
        confidence: 0.75,
      },
    ];

  for (const rule of rules) {
    if (rule.patterns.some((p) => p.test(text))) {
      suggestions.push({
        serviceSlug: rule.slug,
        confidence: rule.confidence,
        source: "deterministic",
      });
    }
  }

  return suggestions;
}

// ─── Seed/upsert taxonomy ───────────────────────────────────────────────────

export async function seedServiceTypes(): Promise<void> {
  for (const st of EQUESTRIAN_TAXONOMY) {
    await db
      .insert(serviceTypes)
      .values({
        slug: st.slug,
        label: st.label,
        description: st.description,
      })
      .onConflictDoNothing();
  }
}

// ─── Preview (read-only) ────────────────────────────────────────────────────

export async function previewClassifications(
  limit = 50,
): Promise<EntryClassificationPreview[]> {
  const rows = await db
    .select({
      id: entries.id,
      title: entries.title,
      location: entries.location,
      category: entries.category,
      tags: entries.tags,
      customFields: entries.customFields,
    })
    .from(entries)
    .where(eq(entries.published, true))
    .limit(limit);

  const previews: EntryClassificationPreview[] = [];
  for (const row of rows) {
    const locationSug = suggestLocationFromText(row.location);
    const serviceSugs = suggestServicesFromText({
      title: row.title,
      category: row.category,
      tags: row.tags,
      customFields: row.customFields as Record<string, unknown> | null,
    });

    const cf = row.customFields as Record<string, unknown> | null;
    const ridingType = typeof cf?.ridingtype === "string" ? cf.ridingtype : null;
    if (ridingType) {
      const mapped = RIDING_TYPE_TO_SERVICE[ridingType];
      if (mapped && !serviceSugs.find((s) => s.serviceSlug === mapped)) {
        serviceSugs.push({ serviceSlug: mapped, confidence: 0.9, source: "deterministic" });
      }
    }

    previews.push({
      entryId: row.id,
      entryTitle: row.title,
      locationSuggestion: locationSug,
      serviceSuggestions: serviceSugs,
    });
  }
  return previews;
}

// ─── Apply classifications (idempotent) ─────────────────────────────────────
// - Location confidence >=0.8 → confirmed; lower → manual_review
// - Service suggestions → always manual_review (never auto-confirm)
// - Never overwrite confirmed/rejected values

export async function applyClassifications(): Promise<{
  locationsApplied: number;
  servicesQueued: number;
}> {
  await seedServiceTypes();

  const allServiceTypes = await db.select().from(serviceTypes);
  const slugToId = new Map(allServiceTypes.map((st: typeof serviceTypes.$inferSelect) => [st.slug, st.id]));

  const rows = await db
    .select({
      id: entries.id,
      title: entries.title,
      location: entries.location,
      category: entries.category,
      tags: entries.tags,
      customFields: entries.customFields,
    })
    .from(entries)
    .where(eq(entries.published, true));

  let locationsApplied = 0;
  let servicesQueued = 0;

  for (const row of rows) {
    // ── Location ──
    const [existingLoc] = await db
      .select({ id: entryLocations.id, locationStatus: entryLocations.locationStatus })
      .from(entryLocations)
      .where(eq(entryLocations.entryId, row.id))
      .limit(1);

    // Only touch entries with no location or with a manual_review location
    if (!existingLoc || existingLoc.locationStatus === "manual_review") {
      const locSug = suggestLocationFromText(row.location);
      if (locSug && locSug.confidence >= 0.8) {
        if (!existingLoc) {
          await db.insert(entryLocations).values({
            entryId: row.id,
            cityName: locSug.cityName,
            citySlug: locSug.citySlug,
            stateName: locSug.stateName,
            stateSlug: locSug.stateSlug,
            postalCode: locSug.postalCode,
            locationStatus: "confirmed",
            locationSource: "deterministic",
            locationConfidence: locSug.confidence,
          });
          locationsApplied++;
        } else {
          await db
            .update(entryLocations)
            .set({
              cityName: locSug.cityName,
              citySlug: locSug.citySlug,
              stateName: locSug.stateName,
              stateSlug: locSug.stateSlug,
              postalCode: locSug.postalCode,
              locationStatus: "confirmed",
              locationSource: "deterministic",
              locationConfidence: locSug.confidence,
              updatedAt: new Date(),
            })
            .where(eq(entryLocations.id, existingLoc.id));
          locationsApplied++;
        }
      } else if (locSug && !existingLoc) {
        await db.insert(entryLocations).values({
          entryId: row.id,
          cityName: locSug.cityName,
          citySlug: locSug.citySlug,
          stateName: locSug.stateName,
          stateSlug: locSug.stateSlug,
          postalCode: locSug.postalCode,
          locationStatus: "manual_review",
          locationSource: "deterministic",
          locationConfidence: locSug.confidence,
        });
      }
    }

    // ── Services ──
    const cf = row.customFields as Record<string, unknown> | null;
    const ridingType = typeof cf?.ridingtype === "string" ? cf.ridingtype : null;
    const serviceSugs = suggestServicesFromText({
      title: row.title,
      category: row.category,
      tags: row.tags,
      customFields: cf,
    });
    if (ridingType) {
      const mapped = RIDING_TYPE_TO_SERVICE[ridingType];
      if (mapped && !serviceSugs.find((s) => s.serviceSlug === mapped)) {
        serviceSugs.push({ serviceSlug: mapped, confidence: 0.9, source: "deterministic" });
      }
    }

    for (const sug of serviceSugs) {
      const stId = slugToId.get(sug.serviceSlug);
      if (!stId) continue;

      const [existing] = await db
        .select({ id: entryServiceTypes.id, status: entryServiceTypes.status })
        .from(entryServiceTypes)
        .where(
          and(
            eq(entryServiceTypes.entryId, row.id),
            eq(entryServiceTypes.serviceTypeId, stId),
          ),
        )
        .limit(1);

      if (!existing) {
        await db.insert(entryServiceTypes).values({
          entryId: row.id,
          serviceTypeId: stId,
          status: "manual_review",
          source: "deterministic",
          confidence: sug.confidence,
        });
        servicesQueued++;
      }
      // Never overwrite confirmed/rejected
    }
  }

  return { locationsApplied, servicesQueued };
}

// ─── Coverage summary ────────────────────────────────────────────────────────

export async function getLocalSeoCoverage() {
  const [totalEntriesRow] = await db
    .select({ count: count() })
    .from(entries)
    .where(eq(entries.published, true));
  const totalEntries = Number(totalEntriesRow.count);

  const [confirmedLocRow] = await db
    .select({ count: count() })
    .from(entryLocations)
    .innerJoin(entries, eq(entryLocations.entryId, entries.id))
    .where(
      and(
        eq(entryLocations.locationStatus, "confirmed"),
        eq(entries.published, true),
      ),
    );
  const confirmedLocations = Number(confirmedLocRow.count);

  const [reviewLocRow] = await db
    .select({ count: count() })
    .from(entryLocations)
    .innerJoin(entries, eq(entryLocations.entryId, entries.id))
    .where(
      and(
        eq(entryLocations.locationStatus, "manual_review"),
        eq(entries.published, true),
      ),
    );
  const locationReviewQueue = Number(reviewLocRow.count);

  const [confirmedSvcRow] = await db
    .select({ count: count() })
    .from(entryServiceTypes)
    .innerJoin(entries, eq(entryServiceTypes.entryId, entries.id))
    .where(
      and(
        eq(entryServiceTypes.status, "confirmed"),
        eq(entries.published, true),
      ),
    );
  const confirmedServices = Number(confirmedSvcRow.count);

  const [reviewSvcRow] = await db
    .select({ count: count() })
    .from(entryServiceTypes)
    .innerJoin(entries, eq(entryServiceTypes.entryId, entries.id))
    .where(
      and(
        eq(entryServiceTypes.status, "manual_review"),
        eq(entries.published, true),
      ),
    );
  const serviceReviewQueue = Number(reviewSvcRow.count);

  // Eligible hubs — published only
  const stateHubs = await db
    .select({ stateSlug: entryLocations.stateSlug, cnt: count() })
    .from(entryLocations)
    .innerJoin(entries, eq(entryLocations.entryId, entries.id))
    .where(
      and(
        eq(entryLocations.locationStatus, "confirmed"),
        eq(entries.published, true),
        isNotNull(entryLocations.stateSlug),
      ),
    )
    .groupBy(entryLocations.stateSlug)
    .having(gte(count(), STATE_THRESHOLD));

  const cityHubs = await db
    .select({ citySlug: entryLocations.citySlug, stateSlug: entryLocations.stateSlug, cnt: count() })
    .from(entryLocations)
    .innerJoin(entries, eq(entryLocations.entryId, entries.id))
    .where(
      and(
        eq(entryLocations.locationStatus, "confirmed"),
        eq(entries.published, true),
        isNotNull(entryLocations.citySlug),
        isNotNull(entryLocations.stateSlug),
      ),
    )
    .groupBy(entryLocations.citySlug, entryLocations.stateSlug)
    .having(gte(count(), CITY_THRESHOLD));

  return {
    totalEntries,
    confirmedLocations,
    locationReviewQueue,
    confirmedServices,
    serviceReviewQueue,
    eligibleStateHubs: stateHubs.length,
    eligibleCityHubs: cityHubs.length,
  };
}

// ─── Review queue ────────────────────────────────────────────────────────────
// Returns entries that have EITHER a manual_review location OR a manual_review
// service assignment. Each row includes both location (any status) and ALL
// service suggestions for context.

export async function getReviewQueue(page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  // Step 1: collect distinct published entry IDs from both sources
  const locEntryIdRows = await db
    .selectDistinct({ entryId: entryLocations.entryId })
    .from(entryLocations)
    .innerJoin(entries, eq(entryLocations.entryId, entries.id))
    .where(
      and(
        eq(entryLocations.locationStatus, "manual_review"),
        eq(entries.published, true),
      ),
    );

  const svcEntryIdRows = await db
    .selectDistinct({ entryId: entryServiceTypes.entryId })
    .from(entryServiceTypes)
    .innerJoin(entries, eq(entryServiceTypes.entryId, entries.id))
    .where(
      and(
        eq(entryServiceTypes.status, "manual_review"),
        eq(entries.published, true),
      ),
    );

  // Union into a single deduplicated sorted set
  const allIdSet = new Set<number>();
  for (const r of locEntryIdRows) allIdSet.add(r.entryId);
  for (const r of svcEntryIdRows) allIdSet.add(r.entryId);

  const allIds = Array.from(allIdSet).sort((a, b) => a - b);
  const total = allIds.length;

  // Paginate
  const pageIds = allIds.slice(offset, offset + limit);

  type EntryRow = { id: number; title: string; location: string | null };
  type ServiceRow = {
    entryId: number;
    serviceTypeId: number;
    status: string;
    confidence: number | null;
    slug: string | null;
    label: string | null;
  };
  type LocRow = {
    id: number;
    entryId: number;
    cityName: string | null;
    citySlug: string | null;
    stateName: string | null;
    stateSlug: string | null;
    postalCode: string | null;
    locationStatus: string;
    locationSource: string | null;
    locationConfidence: number | null;
  };

  if (pageIds.length === 0) {
    return { rows: [], total, page, totalPages: Math.ceil(total / limit) };
  }

  // Fetch entries
  const entryRows = (await db
    .select({ id: entries.id, title: entries.title, location: entries.location })
    .from(entries)
    .where(inArray(entries.id, pageIds))) as EntryRow[];
  const entryMap = new Map(entryRows.map((e) => [e.id, e]));

  // Fetch locations for these entries (any status for context)
  const locRows = (await db
    .select({
      id: entryLocations.id,
      entryId: entryLocations.entryId,
      cityName: entryLocations.cityName,
      citySlug: entryLocations.citySlug,
      stateName: entryLocations.stateName,
      stateSlug: entryLocations.stateSlug,
      postalCode: entryLocations.postalCode,
      locationStatus: entryLocations.locationStatus,
      locationSource: entryLocations.locationSource,
      locationConfidence: entryLocations.locationConfidence,
    })
    .from(entryLocations)
    .where(inArray(entryLocations.entryId, pageIds))) as LocRow[];
  const locMap = new Map(locRows.map((l) => [l.entryId, l]));

  // Fetch services (all statuses for context)
  const serviceRows = (await db
    .select({
      entryId: entryServiceTypes.entryId,
      serviceTypeId: entryServiceTypes.serviceTypeId,
      status: entryServiceTypes.status,
      confidence: entryServiceTypes.confidence,
      slug: serviceTypes.slug,
      label: serviceTypes.label,
    })
    .from(entryServiceTypes)
    .leftJoin(serviceTypes, eq(entryServiceTypes.serviceTypeId, serviceTypes.id))
    .where(inArray(entryServiceTypes.entryId, pageIds))) as ServiceRow[];

  const servicesByEntry = new Map<number, ServiceRow[]>();
  for (const sr of serviceRows) {
    const arr = servicesByEntry.get(sr.entryId) ?? [];
    arr.push(sr);
    servicesByEntry.set(sr.entryId, arr);
  }

  const rows = pageIds.map((id) => {
    const entry = entryMap.get(id);
    const loc = locMap.get(id) ?? null;
    const svcs = servicesByEntry.get(id) ?? [];
    return {
      entryId: id,
      entryTitle: entry?.title ?? null,
      originalLocation: entry?.location ?? null,
      location: loc
        ? {
            id: loc.id,
            cityName: loc.cityName,
            citySlug: loc.citySlug,
            stateName: loc.stateName,
            stateSlug: loc.stateSlug,
            postalCode: loc.postalCode,
            locationStatus: loc.locationStatus,
            locationSource: loc.locationSource,
            locationConfidence: loc.locationConfidence,
          }
        : null,
      serviceSuggestions: svcs
        .filter((s) => s.status === "manual_review")
        .map((s) => ({
          serviceTypeId: s.serviceTypeId,
          serviceSlug: s.slug,
          serviceLabel: s.label,
          confidence: s.confidence,
        })),
    };
  });

  return { rows, total, page, totalPages: Math.ceil(total / limit) };
}

// ─── Hub eligibility thresholds ──────────────────────────────────────────────

const STATE_THRESHOLD = 10;
const CITY_THRESHOLD = 8;
const GLOBAL_SERVICE_THRESHOLD = 10;
const STATE_SERVICE_THRESHOLD = 8;
const CITY_SERVICE_THRESHOLD = 5;
const CITY_SERVICE_MIN_BUSINESSES = 3;

// ─── Eligible hubs (published-only, with service hubs) ───────────────────────

export async function getEligibleHubs() {
  // Eligible states
  const states = await db
    .selectDistinct({
      stateSlug: entryLocations.stateSlug,
      stateName: entryLocations.stateName,
      cnt: count(),
    })
    .from(entryLocations)
    .innerJoin(entries, eq(entryLocations.entryId, entries.id))
    .where(
      and(
        eq(entryLocations.locationStatus, "confirmed"),
        eq(entries.published, true),
        isNotNull(entryLocations.stateSlug),
      ),
    )
    .groupBy(entryLocations.stateSlug, entryLocations.stateName)
    .having(gte(count(), STATE_THRESHOLD));

  // Eligible cities (scoped by state to avoid same-name collisions)
  const cities = await db
    .selectDistinct({
      citySlug: entryLocations.citySlug,
      cityName: entryLocations.cityName,
      stateSlug: entryLocations.stateSlug,
      stateName: entryLocations.stateName,
      cnt: count(),
    })
    .from(entryLocations)
    .innerJoin(entries, eq(entryLocations.entryId, entries.id))
    .where(
      and(
        eq(entryLocations.locationStatus, "confirmed"),
        eq(entries.published, true),
        isNotNull(entryLocations.citySlug),
        isNotNull(entryLocations.stateSlug),
      ),
    )
    .groupBy(
      entryLocations.citySlug,
      entryLocations.cityName,
      entryLocations.stateSlug,
      entryLocations.stateName,
    )
    .having(gte(count(), CITY_THRESHOLD));

  // Eligible global services (published entries only)
  const globalServices = await db
    .select({
      slug: serviceTypes.slug,
      label: serviceTypes.label,
      cnt: count(),
    })
    .from(entryServiceTypes)
    .innerJoin(serviceTypes, eq(entryServiceTypes.serviceTypeId, serviceTypes.id))
    .innerJoin(entries, eq(entryServiceTypes.entryId, entries.id))
    .where(
      and(
        eq(entryServiceTypes.status, "confirmed"),
        eq(entries.published, true),
      ),
    )
    .groupBy(serviceTypes.slug, serviceTypes.label)
    .having(gte(count(), GLOBAL_SERVICE_THRESHOLD));

  // Eligible state-service combos
  const stateServices = await db
    .select({
      stateSlug: entryLocations.stateSlug,
      stateName: entryLocations.stateName,
      serviceSlug: serviceTypes.slug,
      serviceLabel: serviceTypes.label,
      cnt: count(),
    })
    .from(entryServiceTypes)
    .innerJoin(serviceTypes, eq(entryServiceTypes.serviceTypeId, serviceTypes.id))
    .innerJoin(entries, eq(entryServiceTypes.entryId, entries.id))
    .innerJoin(
      entryLocations,
      and(
        eq(entryLocations.entryId, entries.id),
        eq(entryLocations.locationStatus, "confirmed"),
      ),
    )
    .where(
      and(
        eq(entryServiceTypes.status, "confirmed"),
        eq(entries.published, true),
        isNotNull(entryLocations.stateSlug),
      ),
    )
    .groupBy(
      entryLocations.stateSlug,
      entryLocations.stateName,
      serviceTypes.slug,
      serviceTypes.label,
    )
    .having(gte(count(), STATE_SERVICE_THRESHOLD));

  // Eligible city-service combos (distinct entry IDs to avoid duplicates)
  // We do a two-step: first get counts per city+service, then filter
  const cityServiceCandidates = await db
    .select({
      citySlug: entryLocations.citySlug,
      cityName: entryLocations.cityName,
      stateSlug: entryLocations.stateSlug,
      stateName: entryLocations.stateName,
      serviceSlug: serviceTypes.slug,
      serviceLabel: serviceTypes.label,
      entryId: entries.id,
    })
    .from(entryServiceTypes)
    .innerJoin(serviceTypes, eq(entryServiceTypes.serviceTypeId, serviceTypes.id))
    .innerJoin(entries, eq(entryServiceTypes.entryId, entries.id))
    .innerJoin(
      entryLocations,
      and(
        eq(entryLocations.entryId, entries.id),
        eq(entryLocations.locationStatus, "confirmed"),
      ),
    )
    .where(
      and(
        eq(entryServiceTypes.status, "confirmed"),
        eq(entries.published, true),
        isNotNull(entryLocations.citySlug),
        isNotNull(entryLocations.stateSlug),
      ),
    );

  // Group city-service combos in JS to get distinct counts
  type CityServiceKey = string;
  const cityServiceMap = new Map<
    CityServiceKey,
    {
      citySlug: string;
      cityName: string | null;
      stateSlug: string;
      stateName: string | null;
      serviceSlug: string;
      serviceLabel: string | null;
      entryIds: Set<number>;
    }
  >();
  for (const r of cityServiceCandidates) {
    if (!r.citySlug || !r.stateSlug || !r.serviceSlug) continue;
    const key = `${r.stateSlug}:${r.citySlug}:${r.serviceSlug}`;
    if (!cityServiceMap.has(key)) {
      cityServiceMap.set(key, {
        citySlug: r.citySlug,
        cityName: r.cityName,
        stateSlug: r.stateSlug,
        stateName: r.stateName,
        serviceSlug: r.serviceSlug,
        serviceLabel: r.serviceLabel,
        entryIds: new Set(),
      });
    }
    cityServiceMap.get(key)!.entryIds.add(r.entryId);
  }
  const cityServices = Array.from(cityServiceMap.values())
    .filter(
      (cs) =>
        cs.entryIds.size >= CITY_SERVICE_THRESHOLD &&
        cs.entryIds.size >= CITY_SERVICE_MIN_BUSINESSES,
    )
    .map((cs) => ({
      citySlug: cs.citySlug,
      cityName: cs.cityName,
      stateSlug: cs.stateSlug,
      stateName: cs.stateName,
      serviceSlug: cs.serviceSlug,
      serviceLabel: cs.serviceLabel,
      entryCount: cs.entryIds.size,
    }));

  type StateRow = { stateSlug: string | null; stateName: string | null; cnt: number | bigint };
  type CityRow = { citySlug: string | null; cityName: string | null; stateSlug: string | null; stateName: string | null; cnt: number | bigint };
  type SvcRow = { slug: string | null; label: string | null; cnt: number | bigint };
  type StateSvcRow = { stateSlug: string | null; stateName: string | null; serviceSlug: string | null; serviceLabel: string | null; cnt: number | bigint };

  return {
    states: (states as StateRow[]).map((s) => ({
      stateSlug: s.stateSlug,
      stateName: s.stateName,
      entryCount: Number(s.cnt),
    })),
    cities: (cities as CityRow[]).map((c) => ({
      citySlug: c.citySlug,
      cityName: c.cityName,
      stateSlug: c.stateSlug,
      stateName: c.stateName,
      entryCount: Number(c.cnt),
    })),
    globalServices: (globalServices as SvcRow[]).map((s) => ({
      serviceSlug: s.slug,
      serviceLabel: s.label,
      entryCount: Number(s.cnt),
    })),
    stateServices: (stateServices as StateSvcRow[]).map((s) => ({
      stateSlug: s.stateSlug,
      stateName: s.stateName,
      serviceSlug: s.serviceSlug,
      serviceLabel: s.serviceLabel,
      entryCount: Number(s.cnt),
    })),
    cityServices,
  };
}

// ─── Landing page query ──────────────────────────────────────────────────────

interface LandingParams {
  stateSlug?: string;
  citySlug?: string;
  serviceSlug?: string;
  page?: number;
  limit?: number;
}

interface LandingMeta {
  stateSlug: string | null;
  stateName: string | null;
  citySlug: string | null;
  cityName: string | null;
  serviceSlug: string | null;
  serviceLabel: string | null;
}

export async function getLandingEntries(params: LandingParams) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(50, params.limit ?? 20);
  const offset = (page - 1) * limit;
  const { stateSlug, citySlug, serviceSlug } = params;

  const ineligible = { eligible: false, entries: [], total: 0, page, totalPages: 0, meta: null, relatedHubs: null };

  // ── Resolve canonical names from confirmed locations/services ──

  // Resolve serviceLabel if serviceSlug provided
  let serviceLabel: string | null = null;
  if (serviceSlug) {
    const [stRow] = await db
      .select({ label: serviceTypes.label })
      .from(serviceTypes)
      .where(eq(serviceTypes.slug, serviceSlug))
      .limit(1);
    if (!stRow) return ineligible; // Unknown service slug
    serviceLabel = stRow.label;
  }

  // Resolve stateName from a confirmed location if stateSlug provided
  let resolvedStateName: string | null = null;
  if (stateSlug) {
    const [stateNameRow] = await db
      .select({ stateName: entryLocations.stateName })
      .from(entryLocations)
      .innerJoin(entries, eq(entryLocations.entryId, entries.id))
      .where(
        and(
          eq(entryLocations.stateSlug, stateSlug),
          eq(entryLocations.locationStatus, "confirmed"),
          eq(entries.published, true),
        ),
      )
      .limit(1);
    if (!stateNameRow) return ineligible; // Unknown stateSlug (no published entries)
    resolvedStateName = stateNameRow.stateName;
  }

  // Resolve cityName; also validate stateSlug+citySlug combination
  let resolvedCityName: string | null = null;
  if (citySlug) {
    const cityConditions = [
      eq(entryLocations.citySlug, citySlug),
      eq(entryLocations.locationStatus, "confirmed"),
      eq(entries.published, true),
    ] as ReturnType<typeof eq>[];
    if (stateSlug) {
      cityConditions.push(eq(entryLocations.stateSlug, stateSlug) as ReturnType<typeof eq>);
    }
    const [cityNameRow] = await db
      .select({ cityName: entryLocations.cityName, stateName: entryLocations.stateName })
      .from(entryLocations)
      .innerJoin(entries, eq(entryLocations.entryId, entries.id))
      .where(and(...(cityConditions as any[])))
      .limit(1);
    if (!cityNameRow) return ineligible; // Unknown citySlug or invalid state+city combo
    resolvedCityName = cityNameRow.cityName;
    if (!resolvedStateName && cityNameRow.stateName) {
      resolvedStateName = cityNameRow.stateName;
    }
  }

  // ── Threshold checks (published entries only) ──

  if (serviceSlug && !stateSlug && !citySlug) {
    const [globalSvcRow] = await db
      .select({ cnt: count() })
      .from(entryServiceTypes)
      .innerJoin(serviceTypes, eq(entryServiceTypes.serviceTypeId, serviceTypes.id))
      .innerJoin(entries, eq(entryServiceTypes.entryId, entries.id))
      .where(
        and(
          eq(entryServiceTypes.status, "confirmed"),
          eq(serviceTypes.slug, serviceSlug),
          eq(entries.published, true),
        ),
      );
    if (Number(globalSvcRow?.cnt ?? 0) < GLOBAL_SERVICE_THRESHOLD) return ineligible;
  }

  // State-service threshold: only when there is NO citySlug.
  // A city-service request (stateSlug + citySlug + serviceSlug) must be evaluated
  // solely against city-service requirements and must NOT be blocked by a
  // state-service threshold shortfall.
  if (stateSlug && serviceSlug && !citySlug) {
    const [row] = await db
      .select({ cnt: count() })
      .from(entryLocations)
      .innerJoin(entries, eq(entryLocations.entryId, entries.id))
      .innerJoin(entryServiceTypes, eq(entryLocations.entryId, entryServiceTypes.entryId))
      .innerJoin(serviceTypes, eq(entryServiceTypes.serviceTypeId, serviceTypes.id))
      .where(
        and(
          eq(entryLocations.locationStatus, "confirmed"),
          eq(entryLocations.stateSlug, stateSlug),
          eq(entryServiceTypes.status, "confirmed"),
          eq(serviceTypes.slug, serviceSlug),
          eq(entries.published, true),
        ),
      );
    if (Number(row?.cnt ?? 0) < STATE_SERVICE_THRESHOLD) return ineligible;
  }

  if (citySlug && serviceSlug) {
    const conditions = [
      eq(entryLocations.locationStatus, "confirmed"),
      eq(entryLocations.citySlug, citySlug),
      eq(entryServiceTypes.status, "confirmed"),
      eq(serviceTypes.slug, serviceSlug),
      eq(entries.published, true),
    ] as ReturnType<typeof eq>[];
    if (stateSlug) {
      conditions.push(eq(entryLocations.stateSlug, stateSlug) as ReturnType<typeof eq>);
    }
    const candidateRows = await db
      .selectDistinct({ entryId: entryLocations.entryId })
      .from(entryLocations)
      .innerJoin(entries, eq(entryLocations.entryId, entries.id))
      .innerJoin(entryServiceTypes, eq(entryLocations.entryId, entryServiceTypes.entryId))
      .innerJoin(serviceTypes, eq(entryServiceTypes.serviceTypeId, serviceTypes.id))
      .where(and(...(conditions as any[])));
    const distinctEntries = new Set(candidateRows.map((r: { entryId: number }) => r.entryId));
    if (
      distinctEntries.size < CITY_SERVICE_THRESHOLD ||
      distinctEntries.size < CITY_SERVICE_MIN_BUSINESSES
    ) {
      return ineligible;
    }
  }

  if (stateSlug && !serviceSlug) {
    const conditions = [
      eq(entryLocations.locationStatus, "confirmed"),
      eq(entryLocations.stateSlug, stateSlug),
      eq(entries.published, true),
    ] as ReturnType<typeof eq>[];
    if (citySlug) {
      conditions.push(eq(entryLocations.citySlug, citySlug) as ReturnType<typeof eq>);
    }
    const [row] = await db
      .select({ cnt: count() })
      .from(entryLocations)
      .innerJoin(entries, eq(entryLocations.entryId, entries.id))
      .where(and(...(conditions as any[])));
    const threshold = citySlug ? CITY_THRESHOLD : STATE_THRESHOLD;
    if (Number(row?.cnt ?? 0) < threshold) return ineligible;
  }

  if (citySlug && !stateSlug && !serviceSlug) {
    const [row] = await db
      .select({ cnt: count() })
      .from(entryLocations)
      .innerJoin(entries, eq(entryLocations.entryId, entries.id))
      .where(
        and(
          eq(entryLocations.locationStatus, "confirmed"),
          eq(entryLocations.citySlug, citySlug),
          eq(entries.published, true),
        ),
      );
    if (Number(row?.cnt ?? 0) < CITY_THRESHOLD) return ineligible;
  }

  // ── Build matching ID list (published + confirmed filters) ──

  const conditions: ReturnType<typeof and>[] = [eq(entries.published, true)];

  let query = db
    .select({ id: entries.id })
    .from(entries)
    .$dynamic();

  if (stateSlug || citySlug) {
    query = query.innerJoin(
      entryLocations,
      and(
        eq(entryLocations.entryId, entries.id),
        eq(entryLocations.locationStatus, "confirmed"),
      ),
    ) as typeof query;
    if (stateSlug) conditions.push(eq(entryLocations.stateSlug, stateSlug) as any);
    if (citySlug) conditions.push(eq(entryLocations.citySlug, citySlug) as any);
  }

  if (serviceSlug) {
    query = query
      .innerJoin(entryServiceTypes, eq(entryServiceTypes.entryId, entries.id))
      .innerJoin(serviceTypes, eq(entryServiceTypes.serviceTypeId, serviceTypes.id)) as typeof query;
    conditions.push(eq(entryServiceTypes.status, "confirmed") as any);
    conditions.push(eq(serviceTypes.slug, serviceSlug) as any);
  }

  query = query.where(and(...(conditions as any[]))) as typeof query;

  const matchingRows = await query;
  // Deduplicate IDs (joins may produce duplicates)
  const distinctIds = Array.from(new Set((matchingRows as Array<{ id: number }>).map((r) => r.id)));
  const total = distinctIds.length;

  // ── Fetch full entries with priority ordering ──

  const priorityExpr = sql`CASE WHEN ${entries.premium} THEN 0 WHEN ${entries.featured} THEN 1 ELSE 2 END`;

  let fullRows: (typeof entries.$inferSelect)[] = [];
  if (distinctIds.length > 0) {
    fullRows = await db
      .select()
      .from(entries)
      .where(inArray(entries.id, distinctIds))
      .orderBy(priorityExpr, sql`${entries.createdAt} DESC`, sql`${entries.id} DESC`)
      .limit(limit)
      .offset(offset);
  }

  const returnedIds = fullRows.map((r) => r.id);

  // ── Fetch confirmed services for returned entries ──
  type ConfirmedSvc = { entryId: number; slug: string | null; label: string | null };
  let confirmedServices: ConfirmedSvc[] = [];
  if (returnedIds.length > 0) {
    confirmedServices = (await db
      .select({
        entryId: entryServiceTypes.entryId,
        slug: serviceTypes.slug,
        label: serviceTypes.label,
      })
      .from(entryServiceTypes)
      .innerJoin(serviceTypes, eq(entryServiceTypes.serviceTypeId, serviceTypes.id))
      .where(
        and(
          inArray(entryServiceTypes.entryId, returnedIds),
          eq(entryServiceTypes.status, "confirmed"),
        ),
      )) as ConfirmedSvc[];
  }

  const servicesByEntry = new Map<number, Array<{ slug: string | null; label: string | null }>>();
  for (const cs of confirmedServices) {
    const arr = servicesByEntry.get(cs.entryId) ?? [];
    arr.push({ slug: cs.slug, label: cs.label });
    servicesByEntry.set(cs.entryId, arr);
  }

  // ── Fetch confirmed locations for returned entries ──
  let locationsByEntry: (typeof entryLocations.$inferSelect)[] = [];
  if (returnedIds.length > 0) {
    locationsByEntry = await db
      .select()
      .from(entryLocations)
      .where(
        and(
          inArray(entryLocations.entryId, returnedIds),
          eq(entryLocations.locationStatus, "confirmed"),
        ),
      );
  }
  const locMap = new Map(locationsByEntry.map((l) => [l.entryId, l]));

  // ── Related hubs ──
  const relatedHubs = await getEligibleHubs();

  // ── Build canonical meta ──
  const meta: LandingMeta = {
    stateSlug: stateSlug ?? null,
    stateName: resolvedStateName,
    citySlug: citySlug ?? null,
    cityName: resolvedCityName,
    serviceSlug: serviceSlug ?? null,
    serviceLabel,
  };

  return {
    eligible: true,
    entries: fullRows.map((e) => ({
      id: e.id,
      title: e.title,
      slug: e.slug,
      category: e.category,
      summary: e.summary,
      location: e.location,
      website: e.website,
      contactPhone: e.contactPhone,
      featured: e.featured,
      premium: e.premium,
      published: e.published,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      normalizedLocation: locMap.get(e.id)
        ? {
            cityName: locMap.get(e.id)!.cityName,
            citySlug: locMap.get(e.id)!.citySlug,
            stateName: locMap.get(e.id)!.stateName,
            stateSlug: locMap.get(e.id)!.stateSlug,
            postalCode: locMap.get(e.id)!.postalCode,
          }
        : null,
      confirmedServices: servicesByEntry.get(e.id) ?? [],
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
    meta,
    relatedHubs,
  };
}

// ─── Import helpers ──────────────────────────────────────────────────────────

/** Called after an entry is inserted from import with explicit city/state/zip values */
export async function applyImportLocation(
  entryId: number,
  opts: {
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  },
) {
  if (!opts.city && !opts.state && !opts.zip) return;

  const cityName = opts.city?.trim() || null;
  const rawState = opts.state?.trim() || null;

  // Normalize state to full name + stable slug
  const resolvedState = rawState ? resolveState(rawState) : null;
  const stateName = resolvedState ? resolvedState.name : rawState;
  const stateSlug = resolvedState ? resolvedState.slug : (rawState ? slugify(rawState) : null);

  await db
    .insert(entryLocations)
    .values({
      entryId,
      cityName,
      citySlug: cityName ? slugify(cityName) : null,
      stateName,
      stateSlug,
      postalCode: opts.zip?.trim() || null,
      locationStatus: "confirmed",
      locationSource: "import",
      locationConfidence: 1.0,
    })
    .onConflictDoNothing();
}

/**
 * Non-destructively review an entry's CURRENT manual_review service suggestions.
 * - Suggestions whose slug is in `selectedSlugs` become `confirmed`.
 * - Remaining manual_review suggestions become `rejected` (audit row retained).
 * - Existing `confirmed` and `rejected` assignments are NEVER touched or deleted.
 *
 * Optionally runs against a provided transaction/db executor (`exec`) so callers
 * can wrap it in a rollback for testing. Returns the counts of changes.
 */
export async function reviewServiceSuggestions(
  entryId: number,
  selectedSlugs: string[],
  reviewerId: string,
  // Accepts the shared `db` or a transaction executor (same query API).
  exec: any = db,
): Promise<{ confirmed: number; rejected: number }> {
  const now = new Date();

  const pendingSuggestions = (await exec
    .select({
      id: entryServiceTypes.id,
      serviceTypeId: entryServiceTypes.serviceTypeId,
      slug: serviceTypes.slug,
    })
    .from(entryServiceTypes)
    .leftJoin(serviceTypes, eq(entryServiceTypes.serviceTypeId, serviceTypes.id))
    .where(
      and(
        eq(entryServiceTypes.entryId, entryId),
        eq(entryServiceTypes.status, "manual_review"),
      ),
    )) as Array<{ id: number; serviceTypeId: number; slug: string | null }>;

  const selected = new Set(selectedSlugs);
  let confirmed = 0;
  let rejected = 0;

  for (const sug of pendingSuggestions) {
    const isSelected = sug.slug != null && selected.has(sug.slug);
    await exec
      .update(entryServiceTypes)
      .set({
        status: isSelected ? "confirmed" : "rejected",
        source: "manual",
        reviewedAt: now,
        reviewedBy: reviewerId,
        updatedAt: now,
      })
      .where(eq(entryServiceTypes.id, sug.id));
    if (isSelected) confirmed++;
    else rejected++;
  }

  return { confirmed, rejected };
}

/** Called after an entry is inserted from import with a custom_ridingtype value */
export async function applyImportServiceType(entryId: number, ridingType: string) {
  const mapped = RIDING_TYPE_TO_SERVICE[ridingType?.toLowerCase?.().trim()];
  if (!mapped) return;

  await seedServiceTypes();

  const [st] = await db
    .select({ id: serviceTypes.id })
    .from(serviceTypes)
    .where(eq(serviceTypes.slug, mapped))
    .limit(1);
  if (!st) return;

  await db
    .insert(entryServiceTypes)
    .values({
      entryId,
      serviceTypeId: st.id,
      status: "confirmed",
      source: "import",
      confidence: 1.0,
    })
    .onConflictDoNothing();
}
