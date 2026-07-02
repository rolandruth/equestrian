import { Router } from "express";
import { db } from "@workspace/db";
import { entries, directorySettings, categories, reviews } from "@workspace/db";
import { eq, ilike, and, desc, asc, count, avg, sql, or } from "drizzle-orm";

const router = Router();

function formatEntry(e: typeof entries.$inferSelect) {
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
    featured: e.featured,
    premium: e.premium,
    published: e.published,
    slug: e.slug,
    metaTitle: e.metaTitle,
    metaDescription: e.metaDescription,
    ogTitle: e.ogTitle,
    ogDescription: e.ogDescription,
    latitude: e.latitude ?? null,
    longitude: e.longitude ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

router.get("/entries", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || "";
    const category = (req.query.category as string) || "";
    const sort = (req.query.sort as string) || "newest";
    const ridingType = (req.query.ridingType as string) || "";

    const conditions = [eq(entries.published, true)];
    if (search && search !== "null") {
      // Split into individual tokens; each token must appear somewhere in the entry (AND of ORs)
      const terms = search
        .split(/[\s,;]+/)
        .map(t => t.trim())
        .filter(t => t.length >= 3);
      if (terms.length === 0) {
        // Fallback: treat the whole string as one phrase
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
      } else {
        for (const term of terms) {
          const q = `%${term}%`;
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
      }
    }
    if (category && category !== "null") conditions.push(eq(entries.category, category));
    if (ridingType && ridingType !== "null") conditions.push(sql`${entries.customFields}->>'ridingtype' = ${ridingType}`);

    const where = and(...conditions);
    const orderBy =
      sort === "a-z" ? asc(entries.title) :
      sort === "z-a" ? desc(entries.title) :
      sort === "oldest" ? asc(entries.createdAt) :
      desc(entries.createdAt);

    const [total] = await db.select({ count: count() }).from(entries).where(where);
    const rows = await db.select().from(entries).where(where).orderBy(orderBy).limit(limit).offset(offset);

    res.json({
      entries: rows.map(formatEntry),
      total: Number(total.count),
      page,
      totalPages: Math.ceil(Number(total.count) / limit),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list entries" });
  }
});

router.get("/entries/:idOrSlug", async (req, res) => {
  try {
    const param = req.params.idOrSlug;
    const numericId = parseInt(param, 10);
    const isNumeric = !isNaN(numericId) && String(numericId) === param;

    const where = isNumeric
      ? and(eq(entries.id, numericId), eq(entries.published, true))
      : and(eq(entries.slug, param), eq(entries.published, true));

    const [entry] = await db.select().from(entries).where(where).limit(1);
    if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
    res.json(formatEntry(entry));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get entry" });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const [totalEntries] = await db.select({ count: count() }).from(entries).where(eq(entries.published, true));
    const breakdown = await db.select({
      category: entries.category,
      count: count(),
    }).from(entries)
      .where(and(eq(entries.published, true), sql`${entries.category} IS NOT NULL`))
      .groupBy(entries.category)
      .orderBy(desc(count()));

    const cats = await db.select({ name: categories.name, imageUrl: categories.imageUrl }).from(categories);
    const imageMap = new Map(cats.map(c => [c.name, c.imageUrl]));

    const ridingBreakdown = await db.select({
      ridingType: sql<string>`${entries.customFields}->>'ridingtype'`,
      count: count(),
    }).from(entries)
      .where(and(eq(entries.published, true), sql`${entries.customFields}->>'ridingtype' IS NOT NULL`))
      .groupBy(sql`${entries.customFields}->>'ridingtype'`)
      .orderBy(desc(count()));

    res.json({
      totalEntries: Number(totalEntries.count),
      totalCategories: breakdown.length,
      categoryBreakdown: breakdown.map(b => ({
        category: b.category!,
        count: Number(b.count),
        imageUrl: imageMap.get(b.category!) ?? null,
      })),
      ridingTypeBreakdown: ridingBreakdown.map(r => ({
        ridingType: r.ridingType,
        count: Number(r.count),
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

router.get("/featured", async (req, res) => {
  try {
    const rows = await db.select().from(entries)
      .where(and(eq(entries.published, true), eq(entries.featured, true)))
      .orderBy(desc(entries.createdAt))
      .limit(6);
    res.json(rows.map(formatEntry));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get featured entries" });
  }
});

router.get("/premium", async (req, res) => {
  try {
    const rows = await db.select().from(entries)
      .where(and(eq(entries.published, true), eq(entries.premium, true)))
      .orderBy(desc(entries.createdAt))
      .limit(4);
    res.json(rows.map(formatEntry));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get premium entries" });
  }
});

router.get("/recent", async (req, res) => {
  try {
    const rows = await db.select().from(entries)
      .where(eq(entries.published, true))
      .orderBy(desc(entries.createdAt))
      .limit(8);
    res.json(rows.map(formatEntry));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get recent entries" });
  }
});

router.get("/settings", async (req, res) => {
  try {
    const [settings] = await db.select().from(directorySettings).limit(1);
    if (!settings) {
      res.json({
        id: 0,
        siteTitle: "Directory Master",
        logoUrl: null,
        homepageHeadline: null,
        homepageDescription: null,
        themeColor: null,
        calloutSections: null,
        templateSettings: null,
        installed: false,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    res.json({
      id: settings.id,
      siteTitle: settings.siteTitle,
      logoUrl: settings.logoUrl,
      homepageHeadline: settings.homepageHeadline,
      homepageDescription: settings.homepageDescription,
      heroHeadlineColor: settings.heroHeadlineColor,
      heroSubtitleColor: settings.heroSubtitleColor,
      themeColor: settings.themeColor,
      navbarBgColor: settings.navbarBgColor,
      navbarTextColor: settings.navbarTextColor,
      heroSearchPlaceholder: settings.heroSearchPlaceholder,
      heroSearchButtonText: settings.heroSearchButtonText,
      heroSearchButtonColor: settings.heroSearchButtonColor,
      heroSearchButtonTextColor: settings.heroSearchButtonTextColor,
      footerText: settings.footerText,
      privacyPolicyUrl: settings.privacyPolicyUrl,
      termsUrl: settings.termsUrl,
      headScripts: settings.headScripts,
      bodyScripts: settings.bodyScripts,
      calloutSections: settings.calloutSections,
      faviconUrl: settings.faviconUrl,
      homepageMetaTitle: settings.homepageMetaTitle,
      homepageMetaDescription: settings.homepageMetaDescription,
      homepageOgImageUrl: settings.homepageOgImageUrl,
      templateSettings: settings.templateSettings ?? null,
      installed: settings.installed,
      updatedAt: settings.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get settings" });
  }
});

router.get("/reviews/:entryId", async (req, res) => {
  try {
    const entryId = parseInt(req.params.entryId, 10);
    if (isNaN(entryId)) { res.status(400).json({ error: "Invalid entry id" }); return; }

    const rows = await db.select().from(reviews)
      .where(and(eq(reviews.entryId, entryId), eq(reviews.isApproved, true)))
      .orderBy(desc(reviews.createdAt));

    const [agg] = await db.select({ avg: avg(reviews.rating), total: count() })
      .from(reviews)
      .where(and(eq(reviews.entryId, entryId), eq(reviews.isApproved, true)));

    res.json({
      reviews: rows.map(r => ({
        id: r.id,
        entryId: r.entryId,
        reviewerName: r.reviewerName,
        rating: r.rating,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
      })),
      avgRating: agg.avg ? parseFloat(String(agg.avg)) : null,
      totalReviews: Number(agg.total),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get reviews" });
  }
});

router.post("/reviews", async (req, res) => {
  try {
    const { entryId, reviewerName, reviewerEmail, rating, body } = req.body;
    if (!entryId || !reviewerName || !rating) {
      res.status(400).json({ error: "entryId, reviewerName, and rating are required" }); return;
    }
    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      res.status(400).json({ error: "rating must be 1–5" }); return;
    }
    const [entry] = await db.select({ id: entries.id }).from(entries)
      .where(and(eq(entries.id, parseInt(entryId, 10)), eq(entries.published, true))).limit(1);
    if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }

    const [created] = await db.insert(reviews).values({
      entryId: parseInt(entryId, 10),
      reviewerName: String(reviewerName).slice(0, 100),
      reviewerEmail: reviewerEmail ? String(reviewerEmail).slice(0, 200) : null,
      rating: ratingNum,
      body: body ? String(body).slice(0, 2000) : null,
      isApproved: true,
    }).returning();

    res.status(201).json({
      id: created.id,
      entryId: created.entryId,
      reviewerName: created.reviewerName,
      rating: created.rating,
      body: created.body,
      createdAt: created.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create review" });
  }
});

export default router;
