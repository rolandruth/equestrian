import { Router } from "express";
import { db } from "@workspace/db";
import { entries } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth.js";
import { getGeminiClient } from "../lib/gemini.js";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import { ENTRY_SLUG_ADVISORY_LOCK_ID } from "../lib/entrySlugs.js";
import {
  buildListingSeo,
  cleanListingText,
  getListingSeoQuality,
  isMeaningfulListingMetaDescription,
  isMeaningfulListingMetaTitle,
} from "@workspace/listing-seo";

const router = Router();

type SeoJobStatus = {
  status: "running" | "complete" | "error";
  total: number;
  processed: number;
  progress: number;
  message: string;
  error?: string;
};

const seoJobs = new Map<string, SeoJobStatus>();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function extractJson(text: string): any {
  try { return JSON.parse(text); } catch {}
  const stripped = text.replace(/^```(?:json)?\s*/im, "").replace(/\s*```$/im, "").trim();
  try { return JSON.parse(stripped); } catch {}
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  throw new Error("No valid JSON found in Gemini response");
}

const SEO_BATCH = 20;

type SeoEntry = {
  id: number;
  title: string;
  category: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  slug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
};

async function generateSeoBatch(
  batch: SeoEntry[],
): Promise<Map<number, { metaTitle: string; metaDescription: string; ogTitle: string; ogDescription: string }>> {
  const prompt = `You are an SEO expert. For each directory entry below, generate SEO metadata.

Rules:
- metaTitle: 50–60 characters, include the entry title naturally, avoid keyword stuffing
- metaDescription: 140–160 characters, compelling, describes the entry, includes a call to action
- ogTitle: same as metaTitle or slightly more engaging for social sharing
- ogDescription: same as metaDescription or slightly more conversational for social media

Return ONLY valid JSON, no markdown fences:
{
  "results": [
    { "id": <number>, "metaTitle": "...", "metaDescription": "...", "ogTitle": "...", "ogDescription": "..." }
  ]
}

  Entries:
${batch.map(e => `[${e.id}] Title: "${e.title}" | Category: ${e.category || "General"} | Location: ${e.location || "Not provided"} | Summary: ${(e.summary || "").slice(0, 200)} | Description: ${(e.description || "").slice(0, 300)}`).join("\n")}`;

  const aiClient = await getGeminiClient();
  const response = await aiClient.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { maxOutputTokens: 16384 },
  });

  const text = response.text ?? "";
  if (!text) return new Map();

  const parsed = extractJson(text);
  const result = new Map<number, { metaTitle: string; metaDescription: string; ogTitle: string; ogDescription: string }>();
  for (const r of parsed.results ?? []) {
    if (r.id && r.metaTitle) {
      result.set(r.id, {
        metaTitle: (r.metaTitle || "").slice(0, 60),
        metaDescription: (r.metaDescription || "").slice(0, 160),
        ogTitle: (r.ogTitle || r.metaTitle || "").slice(0, 60),
        ogDescription: (r.ogDescription || r.metaDescription || "").slice(0, 160),
      });
    }
  }
  return result;
}

async function runBulkSeo(jobId: string, overwrite: boolean) {
  const job = seoJobs.get(jobId)!;
  try {
    const publicEntries = await db
      .select({
        id: entries.id,
        title: entries.title,
        category: entries.category,
        summary: entries.summary,
        description: entries.description,
        location: entries.location,
        slug: entries.slug,
        metaTitle: entries.metaTitle,
        metaDescription: entries.metaDescription,
        ogTitle: entries.ogTitle,
        ogDescription: entries.ogDescription,
      })
      .from(entries)
      .where(eq(entries.published, true));
    const allEntries = overwrite
      ? publicEntries
      : publicEntries.filter((entry) => !entry.slug || getListingSeoQuality(entry).needsImprovement);

    job.total = allEntries.length;
    job.message = `Processing ${allEntries.length} entries...`;

    if (allEntries.length === 0) {
      Object.assign(job, { status: "complete", progress: 100, message: "All entries already have SEO data." });
      return;
    }

    job.progress = 10;
    job.message = "Entries prepared, calling Gemini for meta content...";

    // Step 2: Generate meta titles/descriptions in batches via Gemini
    const totalBatches = Math.ceil(allEntries.length / SEO_BATCH);
    const seoMap = new Map<number, { metaTitle: string; metaDescription: string; ogTitle: string; ogDescription: string }>();

    for (let b = 0; b < totalBatches; b++) {
      const batchSlice = allEntries.slice(b * SEO_BATCH, (b + 1) * SEO_BATCH);
      job.progress = 10 + Math.round((b / totalBatches) * 70);
      job.message = `Generating SEO metadata via Gemini: batch ${b + 1} of ${totalBatches}...`;

      try {
        const batchResult = await generateSeoBatch(batchSlice);
        for (const [id, seo] of batchResult) {
          seoMap.set(id, seo);
        }
        logger.info({ jobId, batch: b, enrichedCount: batchResult.size }, "SEO batch done");
      } catch (err) {
        logger.warn({ jobId, batch: b, err }, "SEO batch failed — using fallbacks");
        for (const entry of batchSlice) {
          const fallback = buildListingSeo(entry);
          seoMap.set(entry.id, {
            metaTitle: fallback.title,
            metaDescription: fallback.description,
            ogTitle: fallback.ogTitle,
            ogDescription: fallback.ogDescription,
          });
        }
      }
    }

    // Step 3: Write all updates to DB
    job.progress = 85;
    job.message = "Saving SEO data to database...";

    let saved = 0;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${ENTRY_SLUG_ADVISORY_LOCK_ID})`);

      // Recompute slug availability immediately before writing. Imports and
      // manual slug edits use the same lock, while the DB unique constraint is
      // the final invariant for any writer outside the application.
      const targetIds = new Set(allEntries.map((entry) => entry.id));
      const currentSlugs = await tx.select({ id: entries.id, slug: entries.slug }).from(entries);
      const usedSlugs = new Set<string>();
      for (const row of currentSlugs) {
        if (row.slug && (!overwrite || !targetIds.has(row.id))) {
          usedSlugs.add(row.slug);
        }
      }

      const slugMap = new Map<number, string>();
      const orderedEntries = [...allEntries].sort((a, b) => a.id - b.id);
      for (const entry of orderedEntries) {
        if (!overwrite && entry.slug) {
          slugMap.set(entry.id, entry.slug);
          continue;
        }
        let base = slugify(entry.title);
        if (!base) base = `entry-${entry.id}`;
        let slug = base;
        let counter = 2;
        while (usedSlugs.has(slug)) {
          slug = `${base}-${counter++}`;
        }
        usedSlugs.add(slug);
        slugMap.set(entry.id, slug);
      }

      if (overwrite) {
        // The unique constraint is immediate, so slug swaps cannot be written
        // directly one row at a time (A→B would collide while B still owns B).
        // Move every target to a transaction-local unique value first, then
        // apply the final slug map below. These values never commit.
        const occupiedSlugs = new Set(
          currentSlugs.map((row) => row.slug).filter((slug): slug is string => !!slug),
        );
        for (const finalSlug of slugMap.values()) occupiedSlugs.add(finalSlug);

        for (const entry of orderedEntries) {
          let temporarySlug = `seo-tmp-${jobId}-${entry.id}`;
          let counter = 2;
          while (occupiedSlugs.has(temporarySlug)) {
            temporarySlug = `seo-tmp-${jobId}-${entry.id}-${counter++}`;
          }
          occupiedSlugs.add(temporarySlug);
          await tx.update(entries)
            .set({ slug: temporarySlug })
            .where(eq(entries.id, entry.id));
        }
      }

      for (const entry of allEntries) {
        const generated = seoMap.get(entry.id);
        const generatedSeo = buildListingSeo({
          ...entry,
          metaTitle: generated?.metaTitle ?? null,
          metaDescription: generated?.metaDescription ?? null,
          ogTitle: generated?.ogTitle ?? null,
          ogDescription: generated?.ogDescription ?? null,
        });
        const slug = slugMap.get(entry.id)!;
        await tx.update(entries).set({
          slug,
          metaTitle: !overwrite && isMeaningfulListingMetaTitle(entry.metaTitle, entry.title)
            ? cleanListingText(entry.metaTitle)
            : generatedSeo.title,
          metaDescription: !overwrite && isMeaningfulListingMetaDescription(entry.metaDescription, entry.title)
            ? cleanListingText(entry.metaDescription)
            : generatedSeo.description,
          ogTitle: !overwrite && isMeaningfulListingMetaTitle(entry.ogTitle, entry.title)
            ? cleanListingText(entry.ogTitle)
            : generatedSeo.ogTitle,
          ogDescription: !overwrite && isMeaningfulListingMetaDescription(entry.ogDescription, entry.title)
            ? cleanListingText(entry.ogDescription)
            : generatedSeo.ogDescription,
          updatedAt: new Date(),
        }).where(eq(entries.id, entry.id));
        saved++;
        job.processed = saved;
        if (saved % 10 === 0 || saved === allEntries.length) {
          job.progress = 85 + Math.round((saved / allEntries.length) * 15);
        }
      }
    });

    Object.assign(job, {
      status: "complete",
      progress: 100,
      processed: saved,
      message: `SEO data generated for ${saved} entries.`,
    });
    logger.info({ jobId, saved }, "Bulk SEO complete");
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ jobId, err }, "Bulk SEO failed");
    Object.assign(job, { status: "error", error: errMsg, message: "SEO generation failed." });
  }
}

// GET /api/seo/summary
router.get("/summary", requireAdmin, async (req, res) => {
  try {
    const publicEntries = await db
      .select({
        title: entries.title,
        metaTitle: entries.metaTitle,
        metaDescription: entries.metaDescription,
      })
      .from(entries)
      .where(eq(entries.published, true));
    const qualities = publicEntries.map((entry) => getListingSeoQuality(entry));
    const totalCount = publicEntries.length;
    const missingSeo = qualities.filter(
      (quality) => quality.missingTitle || quality.missingDescription,
    ).length;
    const weakSeo = qualities.filter(
      (quality) => !quality.missingTitle
        && !quality.missingDescription
        && (quality.weakTitle || quality.weakDescription),
    ).length;
    const needsImprovement = qualities.filter((quality) => quality.needsImprovement).length;

    res.json({
      total: totalCount,
      withSeo: totalCount - needsImprovement,
      missingSeo,
      weakSeo,
      needsImprovement,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get SEO summary" });
  }
});

// POST /api/seo/bulk
router.post("/bulk", requireAdmin, async (req, res) => {
  try {
    const { overwrite = false } = req.body as { overwrite?: boolean };

    // Reject if a bulk SEO job is already running to prevent resource exhaustion
    for (const [, job] of seoJobs) {
      if (job.status === "running") {
        res.status(409).json({ error: "A bulk SEO job is already in progress. Wait for it to finish before starting a new one." });
        return;
      }
    }

    // Prune finished/errored jobs so the map does not grow without bound
    for (const [id, job] of seoJobs) {
      if (job.status !== "running") seoJobs.delete(id);
    }

    const jobId = randomUUID();
    const initialStatus: SeoJobStatus = {
      status: "running",
      total: 0,
      processed: 0,
      progress: 0,
      message: "Starting SEO generation...",
    };
    seoJobs.set(jobId, initialStatus);

    runBulkSeo(jobId, overwrite).catch(err =>
      logger.error(err, "runBulkSeo unhandled error")
    );

    res.json({ jobId, ...initialStatus });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to start SEO job" });
  }
});

// GET /api/seo/status/:jobId
router.get("/status/:jobId", requireAdmin, async (req, res) => {
  const job = seoJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json({ jobId: req.params.jobId, ...job });
});

export default router;
