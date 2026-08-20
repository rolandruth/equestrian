/**
 * Local SEO admin routes mounted at /api/local-seo
 * and public routes mounted at /api/public/local-seo
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  entries,
  entryLocations,
  serviceTypes,
  entryServiceTypes,
} from "@workspace/db";
import { requireEditor } from "../middlewares/auth.js";
import {
  getLocalSeoCoverage,
  previewClassifications,
  applyClassifications,
  getReviewQueue,
  getEligibleHubs,
  getLandingEntries,
  seedServiceTypes,
  reviewServiceSuggestions,
} from "../lib/localSeo.js";
import { eq, and } from "drizzle-orm";

// ─── Slug helper (must match lib/localSeo.ts) ────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ─── Body validation helpers ─────────────────────────────────────────────────

const VALID_LOCATION_STATUSES = ["confirmed", "manual_review", "rejected"] as const;

interface PreviewInput {
  limit?: number;
}

interface EntryClassificationUpdateInput {
  locationStatus?: "confirmed" | "manual_review" | "rejected";
  cityName?: string | null;
  stateName?: string | null;
  postalCode?: string | null;
  reviewedSuggestionServiceSlugs?: string[];
}

function parsePreviewInput(body: unknown): { ok: true; data: PreviewInput } | { ok: false; error: string } {
  if (body === null || body === undefined) return { ok: true, data: {} };
  if (typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Body must be an object" };
  const b = body as Record<string, unknown>;
  if (b.limit !== undefined) {
    if (typeof b.limit !== "number" || !Number.isInteger(b.limit) || b.limit < 1 || b.limit > 200) {
      return { ok: false, error: "limit must be an integer between 1 and 200" };
    }
  }
  return { ok: true, data: { limit: b.limit as number | undefined } };
}

function parseClassificationUpdate(body: unknown): { ok: true; data: EntryClassificationUpdateInput } | { ok: false; error: string } {
  if (body === null || body === undefined || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be an object" };
  }
  const b = body as Record<string, unknown>;

  if (b.locationStatus !== undefined && !VALID_LOCATION_STATUSES.includes(b.locationStatus as any)) {
    return { ok: false, error: `locationStatus must be one of: ${VALID_LOCATION_STATUSES.join(", ")}` };
  }
  if (b.cityName !== undefined && b.cityName !== null && typeof b.cityName !== "string") {
    return { ok: false, error: "cityName must be a string or null" };
  }
  if (typeof b.cityName === "string" && b.cityName.length > 255) {
    return { ok: false, error: "cityName must be 255 characters or fewer" };
  }
  if (b.stateName !== undefined && b.stateName !== null && typeof b.stateName !== "string") {
    return { ok: false, error: "stateName must be a string or null" };
  }
  if (typeof b.stateName === "string" && b.stateName.length > 255) {
    return { ok: false, error: "stateName must be 255 characters or fewer" };
  }
  if (b.postalCode !== undefined && b.postalCode !== null && typeof b.postalCode !== "string") {
    return { ok: false, error: "postalCode must be a string or null" };
  }
  if (typeof b.postalCode === "string" && b.postalCode.length > 20) {
    return { ok: false, error: "postalCode must be 20 characters or fewer" };
  }
  // Accept reviewedSuggestionServiceSlugs; also accept legacy confirmedServiceSlugs as an alias.
  const reviewedRaw =
    b.reviewedSuggestionServiceSlugs !== undefined
      ? b.reviewedSuggestionServiceSlugs
      : b.confirmedServiceSlugs;
  const reviewedFieldName =
    b.reviewedSuggestionServiceSlugs !== undefined
      ? "reviewedSuggestionServiceSlugs"
      : "confirmedServiceSlugs";
  if (reviewedRaw !== undefined) {
    if (!Array.isArray(reviewedRaw)) {
      return { ok: false, error: `${reviewedFieldName} must be an array` };
    }
    if ((reviewedRaw as unknown[]).some((s) => typeof s !== "string")) {
      return { ok: false, error: `${reviewedFieldName} must be an array of strings` };
    }
  }

  return {
    ok: true,
    data: {
      locationStatus: b.locationStatus as EntryClassificationUpdateInput["locationStatus"],
      cityName: b.cityName as string | null | undefined,
      stateName: b.stateName as string | null | undefined,
      postalCode: b.postalCode as string | null | undefined,
      reviewedSuggestionServiceSlugs: reviewedRaw as string[] | undefined,
    },
  };
}

// ─── Admin router (/api/local-seo) ──────────────────────────────────────────

export const adminLocalSeoRouter = Router();

adminLocalSeoRouter.use(requireEditor);

// GET /api/local-seo/summary
adminLocalSeoRouter.get("/summary", async (req, res) => {
  try {
    const coverage = await getLocalSeoCoverage();
    res.json(coverage);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get local SEO summary" });
  }
});

// POST /api/local-seo/classifications/preview
adminLocalSeoRouter.post("/classifications/preview", async (req, res) => {
  try {
    const parsed = parsePreviewInput(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const limit = Math.min(200, parsed.data.limit ?? 50);
    const previews = await previewClassifications(limit);
    res.json({ previews });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to preview classifications" });
  }
});

// POST /api/local-seo/classifications/apply
adminLocalSeoRouter.post("/classifications/apply", async (req, res) => {
  try {
    const result = await applyClassifications();
    res.json({ success: true, ...result });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to apply classifications" });
  }
});

// GET /api/local-seo/review?page=1&limit=20
adminLocalSeoRouter.get("/review", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const result = await getReviewQueue(page, limit);
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get review queue" });
  }
});

// PATCH /api/local-seo/entries/:id/classification
// Body: { locationStatus?, cityName?, stateName?, postalCode?, reviewedSuggestionServiceSlugs? }
// Note: citySlug and stateSlug are DERIVED server-side from cityName/stateName.
//
// Service decisions are scoped ONLY to the entry's current manual_review
// suggestions. Slugs present in reviewedSuggestionServiceSlugs are confirmed;
// the remaining manual_review suggestions on this entry are rejected (audit row
// retained). Existing confirmed and rejected assignments are NEVER touched or
// deleted. The location decision is fully independent.
adminLocalSeoRouter.patch("/entries/:id/classification", async (req, res) => {
  try {
    const entryId = parseInt(req.params.id, 10);
    if (isNaN(entryId)) {
      res.status(400).json({ error: "Invalid entry id" });
      return;
    }

    // Validate request body first
    const parsed = parseClassificationUpdate(req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const body = parsed.data;

    // Validate service slugs before touching the DB
    let slugToId: Map<string, number> | null = null;
    if (Array.isArray(body.reviewedSuggestionServiceSlugs)) {
      await seedServiceTypes();
      const allSts = await db.select({ slug: serviceTypes.slug, id: serviceTypes.id }).from(serviceTypes);
      slugToId = new Map(allSts.map((st: { slug: string; id: number }) => [st.slug, st.id]));
      const invalidSlugs = body.reviewedSuggestionServiceSlugs.filter((s) => !slugToId!.has(s));
      if (invalidSlugs.length > 0) {
        res.status(400).json({ error: `Unknown service slugs: ${invalidSlugs.join(", ")}` });
        return;
      }
    }

    // Verify entry exists
    const [entry] = await db
      .select({ id: entries.id })
      .from(entries)
      .where(eq(entries.id, entryId))
      .limit(1);
    if (!entry) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }

    // Update or create location record
    const [existingLoc] = await db
      .select({ id: entryLocations.id })
      .from(entryLocations)
      .where(eq(entryLocations.entryId, entryId))
      .limit(1);

    const locUpdate: Record<string, unknown> = { updatedAt: new Date() };
    if (body.locationStatus !== undefined) locUpdate.locationStatus = body.locationStatus;

    // Derive slugs server-side from provided names (never trust caller-supplied slugs)
    if (body.cityName !== undefined) {
      locUpdate.cityName = body.cityName;
      locUpdate.citySlug = body.cityName ? slugify(body.cityName) : null;
    }
    if (body.stateName !== undefined) {
      locUpdate.stateName = body.stateName;
      locUpdate.stateSlug = body.stateName ? slugify(body.stateName) : null;
    }
    if (body.postalCode !== undefined) locUpdate.postalCode = body.postalCode;

    if (body.locationStatus === "confirmed" || body.locationStatus === "rejected") {
      locUpdate.reviewedAt = new Date();
      locUpdate.reviewedBy = String((req as any).userId ?? "admin");
    }

    if (existingLoc) {
      await db
        .update(entryLocations)
        .set(locUpdate)
        .where(eq(entryLocations.id, existingLoc.id));
    } else if (Object.keys(locUpdate).length > 1) {
      await db.insert(entryLocations).values({
        entryId,
        ...locUpdate,
        locationSource: "manual",
        locationConfidence: 1.0,
      } as any);
    }

    // Review service suggestions — non-destructive. Only the entry's CURRENT
    // manual_review suggestions are decided. Confirmed/rejected rows are left
    // untouched. Nothing is ever deleted.
    if (Array.isArray(body.reviewedSuggestionServiceSlugs) && slugToId) {
      const reviewerId = String((req as any).userId ?? "admin");
      await reviewServiceSuggestions(
        entryId,
        body.reviewedSuggestionServiceSlugs,
        reviewerId,
      );
    }

    // Return updated state
    const [updatedLoc] = await db
      .select()
      .from(entryLocations)
      .where(eq(entryLocations.entryId, entryId))
      .limit(1);

    const updatedServices = await db
      .select({
        serviceTypeId: entryServiceTypes.serviceTypeId,
        status: entryServiceTypes.status,
        slug: serviceTypes.slug,
        label: serviceTypes.label,
      })
      .from(entryServiceTypes)
      .leftJoin(serviceTypes, eq(entryServiceTypes.serviceTypeId, serviceTypes.id))
      .where(eq(entryServiceTypes.entryId, entryId));

    res.json({
      entryId,
      location: updatedLoc ?? null,
      services: updatedServices,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update classification" });
  }
});

// ─── Public router (/api/public/local-seo) ───────────────────────────────────

export const publicLocalSeoRouter = Router();

// GET /api/public/local-seo/hubs
publicLocalSeoRouter.get("/hubs", async (req, res) => {
  try {
    const hubs = await getEligibleHubs();
    res.json(hubs);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get hubs" });
  }
});

// GET /api/public/local-seo/landing?stateSlug=&citySlug=&serviceSlug=&page=1&limit=20
publicLocalSeoRouter.get("/landing", async (req, res) => {
  try {
    const stateSlug = (req.query.stateSlug as string) || undefined;
    const citySlug = (req.query.citySlug as string) || undefined;
    const serviceSlug = (req.query.serviceSlug as string) || undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

    if (!stateSlug && !citySlug && !serviceSlug) {
      res.status(400).json({ error: "At least one of stateSlug, citySlug, or serviceSlug is required" });
      return;
    }

    // Require stateSlug when citySlug is supplied
    if (citySlug && !stateSlug) {
      res.status(400).json({ error: "stateSlug is required when citySlug is provided" });
      return;
    }

    // Validate serviceSlug exists in the database if provided.
    // getLandingEntries already queries service_types and returns ineligible for
    // unknown slugs; this early-exit just avoids the deeper query on a clearly
    // bogus slug and enforces consistent ineligible semantics at the route layer.
    if (serviceSlug) {
      const [knownSvc] = await db
        .select({ id: serviceTypes.id })
        .from(serviceTypes)
        .where(eq(serviceTypes.slug, serviceSlug))
        .limit(1);
      if (!knownSvc) {
        res.json({ eligible: false, entries: [], total: 0, page, totalPages: 0, meta: null, relatedHubs: null });
        return;
      }
    }

    const result = await getLandingEntries({ stateSlug, citySlug, serviceSlug, page, limit });
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get landing entries" });
  }
});
