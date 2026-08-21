import { Router } from "express";
import { db } from "@workspace/db";
import { entries, categories, bizUsers, entryLocations, entryServiceTypes, serviceTypes } from "@workspace/db";
import { requireAuth, requireEditor, requireAdmin } from "../middlewares/auth.js";
import { eq, ilike, and, or, desc, count, sql, inArray } from "drizzle-orm";
import { expireStaleUpgrades } from "../lib/upgradeExpiry.js";
import {
  ENTRY_SLUG_ADVISORY_LOCK_ID,
  isEntrySlugUniqueViolation,
} from "../lib/entrySlugs.js";
import {
  getListingImageOptimizationJob,
  getListingImageOptimizationPreview,
  startListingImageOptimization,
} from "../lib/listingImageOptimization.js";

// Normalize featured/premium fields on generic create/update payloads so the
// 30-day auto-expiry cannot be bypassed: enabling a flag always sets its
// expiry to +30 days, disabling always clears it. Clients may not set the
// *Until fields directly.
function normalizeUpgradeFields(body: Record<string, unknown>, current?: { featured: boolean; premium: boolean }) {
  const out: Record<string, unknown> = { ...body };
  delete out.featuredUntil;
  delete out.premiumUntil;
  const in30Days = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (typeof out.featured === "boolean") {
    if (out.featured && !current?.featured) out.featuredUntil = in30Days();
    if (!out.featured) out.featuredUntil = null;
  }
  if (typeof out.premium === "boolean") {
    if (out.premium && !current?.premium) out.premiumUntil = in30Days();
    if (!out.premium) out.premiumUntil = null;
  }
  return out;
}

async function getOwnersMap(ownerIds: (string | null)[]) {
  const ids = [...new Set(ownerIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map<string, typeof bizUsers.$inferSelect>();
  const owners = await db.select().from(bizUsers).where(inArray(bizUsers.id, ids));
  return new Map(owners.map((o) => [o.id, o]));
}

const router = Router();

// Lazily clear expired featured/premium upgrades (throttled internally)
router.use((_req, _res, next) => { expireStaleUpgrades().finally(next); });

router.get("/", requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || "";
    const category = (req.query.category as string) || "";
    const publishedParam = req.query.published as string;

    const featuredParam = req.query.featured as string;

    const conditions = [];
    if (search && search !== "null") {
      const q = `%${search}%`;
      conditions.push(or(
        ilike(entries.title, q),
        ilike(entries.summary, q),
        ilike(entries.description, q),
        ilike(entries.tags, q),
        ilike(entries.location, q),
        ilike(entries.venue, q),
        ilike(entries.eventType, q),
        ilike(entries.category, q),
        ilike(entries.moreDetails, q),
      )!);
    }
    if (category && category !== "null") conditions.push(eq(entries.category, category));
    if (publishedParam === "true") conditions.push(eq(entries.published, true));
    if (publishedParam === "false") conditions.push(eq(entries.published, false));
    if (featuredParam === "true") conditions.push(eq(entries.featured, true));
    if (featuredParam === "false") conditions.push(eq(entries.featured, false));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [total] = await db.select({ count: count() }).from(entries).where(where);
    const rows = await db.select().from(entries).where(where)
      .orderBy(desc(entries.createdAt)).limit(limit).offset(offset);

    const ownersMap = await getOwnersMap(rows.map((r) => r.ownerId));

    const formatted = await Promise.all(rows.map((r) => enrichEntry(r, ownersMap.get(r.ownerId ?? ""))));

    res.json({
      entries: formatted,
      total: Number(total.count),
      page,
      totalPages: Math.ceil(Number(total.count) / limit),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list entries" });
  }
});

router.post("/", requireEditor, async (req, res) => {
  try {
    const { title, ...rest } = req.body;
    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }
    const values = { title, ...normalizeUpgradeFields(rest) } as any;
    const [entry] = await db.transaction(async (tx) => {
      if (typeof values.slug === "string" && values.slug.trim()) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${ENTRY_SLUG_ADVISORY_LOCK_ID})`);
      }
      return tx.insert(entries).values(values).returning();
    });
    res.status(201).json(await enrichEntry(entry));
  } catch (err) {
    if (isEntrySlugUniqueViolation(err)) {
      res.status(409).json({ error: "That public URL slug is already in use" });
      return;
    }
    req.log.error(err);
    res.status(500).json({ error: "Failed to create entry" });
  }
});

router.post("/image-optimization/preview", requireAdmin, async (req, res) => {
  try {
    res.json(await getListingImageOptimizationPreview());
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to inspect listing images" });
  }
});

router.post("/image-optimization/apply", requireAdmin, async (req, res) => {
  try {
    const snapshot = typeof req.body?.snapshot === "string" ? req.body.snapshot : "";
    const confirmation = typeof req.body?.confirmation === "string" ? req.body.confirmation : "";
    const result = await startListingImageOptimization(snapshot, confirmation);
    if (!result.job) {
      res.status(result.status ?? 400).json({ error: result.error ?? "Could not start image optimization" });
      return;
    }
    res.status(202).json(result.job);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to start listing image optimization" });
  }
});

router.get("/image-optimization/status/:jobId", requireAdmin, async (req, res) => {
  try {
    const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
    const job = await getListingImageOptimizationJob(jobId);
    if (!job) {
      res.status(404).json({ error: "Image optimization job not found" });
      return;
    }
    res.json(job);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to load image optimization status" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [entry] = await db.select().from(entries).where(eq(entries.id, id)).limit(1);
    if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
    const ownersMap = await getOwnersMap([entry.ownerId]);
    res.json(await enrichEntry(entry, ownersMap.get(entry.ownerId ?? "")));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get entry" });
  }
});

router.patch("/:id", requireEditor, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select({ featured: entries.featured, premium: entries.premium })
      .from(entries).where(eq(entries.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "Entry not found" }); return; }
    const updates = { ...normalizeUpgradeFields(req.body, existing), updatedAt: new Date() } as any;
    const [entry] = await db.transaction(async (tx) => {
      if (typeof updates.slug === "string" && updates.slug.trim()) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${ENTRY_SLUG_ADVISORY_LOCK_ID})`);
      }
      return tx.update(entries).set(updates).where(eq(entries.id, id)).returning();
    });
    if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
    const ownersMap = await getOwnersMap([entry.ownerId]);
    res.json(await enrichEntry(entry, ownersMap.get(entry.ownerId ?? "")));
  } catch (err) {
    if (isEntrySlugUniqueViolation(err)) {
      res.status(409).json({ error: "That public URL slug is already in use" });
      return;
    }
    req.log.error(err);
    res.status(500).json({ error: "Failed to update entry" });
  }
});

router.delete("/:id", requireEditor, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(entries).where(eq(entries.id, id));
    res.json({ success: true, message: null });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete entry" });
  }
});

router.patch("/:id/publish", requireEditor, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { published } = req.body;
    const [entry] = await db.update(entries).set({ published, updatedAt: new Date() })
      .where(eq(entries.id, id)).returning();
    if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
    res.json(await enrichEntry(entry));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update entry" });
  }
});

router.patch("/:id/featured", requireEditor, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { featured } = req.body;
    const featuredUntil = featured ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
    const [entry] = await db.update(entries).set({ featured, featuredUntil, updatedAt: new Date() })
      .where(eq(entries.id, id)).returning();
    if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
    res.json(await enrichEntry(entry));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update featured status" });
  }
});

router.patch("/:id/premium", requireEditor, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { premium } = req.body;
    const premiumUntil = premium ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
    const [entry] = await db.update(entries).set({ premium, premiumUntil, updatedAt: new Date() })
      .where(eq(entries.id, id)).returning();
    if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
    res.json(await enrichEntry(entry));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update premium status" });
  }
});

// DELETE /api/entries/:id/owner — release a claimed listing back to unclaimed (admin only)
router.delete("/:id/owner", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [entry] = await db.update(entries).set({ ownerId: null, updatedAt: new Date() })
      .where(eq(entries.id, id)).returning();
    if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
    req.log.info({ entryId: id }, "Admin cleared entry owner");
    res.json(await enrichEntry(entry));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to clear entry owner" });
  }
});

// DELETE /api/entries — wipe all entries + categories (admin only)
router.delete("/", requireAdmin, async (req, res) => {
  try {
    const deleted = await db.delete(entries).returning({ id: entries.id });
    await db.delete(categories);
    req.log.warn({ entriesDeleted: deleted.length }, "Admin cleared all entries and categories");
    res.json({ success: true, entriesDeleted: deleted.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to clear entries" });
  }
});

function formatEntry(
  e: typeof entries.$inferSelect,
  owner?: typeof bizUsers.$inferSelect,
  normalizedLocation?: typeof entryLocations.$inferSelect | null,
  confirmedServices?: Array<{ slug: string | null; label: string | null }>,
) {
  return {
    id: e.id,
    title: e.title,
    category: e.category,
    summary: e.summary,
    description: e.description,
    contactEmail: e.contactEmail,
    contactPhone: e.contactPhone,
    website: e.website,
    location: e.location,
    venue: e.venue,
    eventType: e.eventType,
    startDate: e.startDate,
    endDate: e.endDate,
    tags: e.tags,
    moreDetails: e.moreDetails,
    customFields: e.customFields,
    sourceCsvRow: e.sourceCsvRow,
    published: e.published,
    featured: e.featured,
    premium: e.premium,
    slug: e.slug,
    metaTitle: e.metaTitle,
    metaDescription: e.metaDescription,
    ogTitle: e.ogTitle,
    ogDescription: e.ogDescription,
    ownerId: e.ownerId,
    owner: owner
      ? {
          id: owner.id,
          email: owner.email,
          firstName: owner.firstName,
          lastName: owner.lastName,
        }
      : null,
    normalizedLocation: normalizedLocation
      ? {
          cityName: normalizedLocation.cityName,
          citySlug: normalizedLocation.citySlug,
          stateName: normalizedLocation.stateName,
          stateSlug: normalizedLocation.stateSlug,
          postalCode: normalizedLocation.postalCode,
          locationStatus: normalizedLocation.locationStatus,
          locationSource: normalizedLocation.locationSource,
          locationConfidence: normalizedLocation.locationConfidence,
        }
      : null,
    confirmedServices: confirmedServices ?? [],
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

async function enrichEntry(e: typeof entries.$inferSelect, owner?: typeof bizUsers.$inferSelect) {
  const [loc] = await db
    .select()
    .from(entryLocations)
    .where(eq(entryLocations.entryId, e.id))
    .limit(1);

  const svcs = await db
    .select({ slug: serviceTypes.slug, label: serviceTypes.label })
    .from(entryServiceTypes)
    .leftJoin(serviceTypes, eq(entryServiceTypes.serviceTypeId, serviceTypes.id))
    .where(and(eq(entryServiceTypes.entryId, e.id), eq(entryServiceTypes.status, "confirmed")));

  return formatEntry(e, owner, loc ?? null, svcs);
}

export default router;
