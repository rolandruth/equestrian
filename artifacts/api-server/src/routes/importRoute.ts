import { Router } from "express";
import { db } from "@workspace/db";
import { importJobs, entries, categories } from "@workspace/db";
import { requireEditor } from "../middlewares/auth.js";
import { ai } from "@workspace/integrations-gemini-ai";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";

const router = Router();

const BATCH_SIZE = 15; // Smaller batches = shorter outputs, less chance of hitting token limits

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function extractJson(text: string): any {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Strip markdown code fences
    const stripped = text.replace(/^```(?:json)?\s*/im, "").replace(/\s*```$/im, "").trim();
    try {
      return JSON.parse(stripped);
    } catch {
      // Extract first JSON object
      const match = stripped.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error("No valid JSON found in Gemini response");
    }
  }
}

function buildPrompt(headerRow: string, dataRows: string[]): string {
  const csvChunk = [headerRow, ...dataRows].join("\n");
  return `You are a directory data organizer. Parse this CSV data and return structured JSON.

CSV:
${csvChunk}

For each data row, create an entry with these fields:
- title: the most prominent name/title field
- category: assign a category (group similar entries together, use max 8 categories total)
- summary: a 1-2 sentence summary of this entry
- description: a more detailed description (2-4 sentences)
- contactEmail: email address if present, else null
- contactPhone: phone number if present, else null
- website: URL if present, else null
- location: city/state/country if present, else null
- tags: comma-separated relevant tags (3-5 tags)
- sourceCsvRow: the original CSV row as-is

Return a JSON object ONLY (no markdown, no explanation):
{
  "entries": [{ "title": "...", "category": "...", "summary": "...", "description": "...", "contactEmail": null, "contactPhone": null, "website": null, "location": null, "tags": "...", "sourceCsvRow": "..." }],
  "categories": ["Category1", "Category2"]
}`;
}

async function processImport(jobId: string, csvContent: string) {
  try {
    logger.info({ jobId, csvBytes: csvContent.length }, "processImport started");
    const lines = csvContent.trim().split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      throw new Error("CSV must have at least a header row and one data row.");
    }

    const headerRow = lines[0];
    const dataRows = lines.slice(1);
    const totalRows = dataRows.length;

    await db.update(importJobs).set({
      status: "processing",
      totalRows,
      processedRows: 0,
      progress: 0,
      message: `Preparing to analyze ${totalRows} rows...`,
      updatedAt: new Date(),
    }).where(eq(importJobs.jobId, jobId));

    // Split into batches
    const batches: string[][] = [];
    for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
      batches.push(dataRows.slice(i, i + BATCH_SIZE));
    }

    const allEntries: any[] = [];
    const allCategories = new Set<string>();

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchNum = batchIndex + 1;
      const rowsProcessedSoFar = batchIndex * BATCH_SIZE;
      const geminiProgress = Math.round((batchIndex / batches.length) * 50); // 0-50% for Gemini phase

      await db.update(importJobs).set({
        progress: geminiProgress,
        message: `Gemini AI is analyzing batch ${batchNum} of ${batches.length} (${batch.length} rows)...`,
        updatedAt: new Date(),
      }).where(eq(importJobs.jobId, jobId));

      const prompt = buildPrompt(headerRow, batch);

      let attempts = 0;
      let parsed: { entries: any[]; categories: string[] } | null = null;

      logger.info({ batchIndex, promptLength: prompt.length, batchRows: batch.length }, "Sending batch to Gemini");

      while (attempts < 3 && !parsed) {
        attempts++;
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { maxOutputTokens: 32768 },
          });

          const finishReason = response.candidates?.[0]?.finishReason;
          const textLength = response.text?.length ?? 0;
          const usage = response.usageMetadata;
          logger.info(
            { batchIndex, attempt: attempts, finishReason, textLength, usage },
            "Gemini response received"
          );

          const text = response.text ?? "";
          if (!text) {
            logger.warn({ batchIndex, attempt: attempts, finishReason, usage }, "Gemini returned empty text, retrying...");
            if (attempts < 3) {
              await new Promise((r) => setTimeout(r, 3000 * attempts));
              continue;
            }
            throw new Error(`Gemini returned an empty response after ${attempts} attempts. finishReason: ${finishReason}`);
          }

          const result = extractJson(text);
          if (!result.entries || !Array.isArray(result.entries)) {
            throw new Error("Gemini response missing entries array");
          }

          parsed = result;
        } catch (err) {
          if (attempts >= 3) throw err;
          logger.warn({ err, batchIndex, attempt: attempts }, "Gemini call failed, retrying...");
          await new Promise((r) => setTimeout(r, 3000 * attempts));
        }
      }

      if (parsed) {
        for (const cat of parsed.categories ?? []) {
          if (cat) allCategories.add(String(cat));
        }
        allEntries.push(...parsed.entries);
      }
    }

    // Insert categories (50-60% progress range)
    await db.update(importJobs).set({
      progress: 55,
      message: `Creating ${allCategories.size} categories...`,
      updatedAt: new Date(),
    }).where(eq(importJobs.jobId, jobId));

    let categoriesCreated = 0;
    for (const catName of allCategories) {
      const slug = slugify(catName);
      const existing = await db.select().from(categories).where(eq(categories.name, catName)).limit(1);
      if (existing.length === 0) {
        await db.insert(categories).values({ name: catName, slug }).onConflictDoNothing();
        categoriesCreated++;
      }
    }

    // Insert entries (60-100% progress range)
    let entriesCreated = 0;
    const totalEntries = allEntries.length;

    for (const entry of allEntries) {
      await db.insert(entries).values({
        title: String(entry.title || "Untitled").slice(0, 500),
        category: entry.category ? String(entry.category).slice(0, 200) : null,
        summary: entry.summary ? String(entry.summary).slice(0, 1000) : null,
        description: entry.description ? String(entry.description) : null,
        contactEmail: entry.contactEmail ? String(entry.contactEmail).slice(0, 200) : null,
        contactPhone: entry.contactPhone ? String(entry.contactPhone).slice(0, 50) : null,
        website: entry.website ? String(entry.website).slice(0, 500) : null,
        location: entry.location ? String(entry.location).slice(0, 200) : null,
        tags: entry.tags ? String(entry.tags).slice(0, 500) : null,
        moreDetails: entry.moreDetails ? String(entry.moreDetails) : null,
        sourceCsvRow: entry.sourceCsvRow ? String(entry.sourceCsvRow).slice(0, 1000) : null,
        published: true,
      });
      entriesCreated++;

      const insertProgress = 60 + Math.round((entriesCreated / totalEntries) * 40);
      if (entriesCreated % 5 === 0 || entriesCreated === totalEntries) {
        await db.update(importJobs).set({
          processedRows: entriesCreated,
          progress: insertProgress,
          message: `Saving entries... (${entriesCreated}/${totalEntries})`,
          updatedAt: new Date(),
        }).where(eq(importJobs.jobId, jobId));
      }
    }

    await db.update(importJobs).set({
      status: "complete",
      message: `Import complete! Created ${entriesCreated} entries across ${categoriesCreated} new categories.`,
      processedRows: entriesCreated,
      entriesCreated,
      categoriesCreated,
      progress: 100,
      updatedAt: new Date(),
    }).where(eq(importJobs.jobId, jobId));

    logger.info({ jobId, entriesCreated, categoriesCreated }, "Import complete");
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ jobId, err }, "Import failed");
    await db.update(importJobs).set({
      status: "error",
      error: errMsg,
      message: "Import failed. See error details below.",
      updatedAt: new Date(),
    }).where(eq(importJobs.jobId, jobId));
  }
}

router.post("/csv", requireEditor, async (req, res) => {
  try {
    const { csvContent } = req.body;
    if (!csvContent || typeof csvContent !== "string" || !csvContent.trim()) {
      res.status(400).json({ error: "CSV content is required" });
      return;
    }

    const jobId = randomUUID();
    const [job] = await db.insert(importJobs).values({
      jobId,
      status: "pending",
      message: "Import job queued",
    }).returning();

    processImport(jobId, csvContent).catch((err) => logger.error(err, "processImport unhandled error"));

    res.json({
      jobId: job.jobId,
      status: job.status,
      message: job.message,
      progress: null,
      totalRows: null,
      processedRows: null,
      entriesCreated: null,
      categoriesCreated: null,
      error: null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to start import" });
  }
});

router.get("/status/:jobId", requireEditor, async (req, res) => {
  try {
    const [job] = await db.select().from(importJobs).where(eq(importJobs.jobId, req.params.jobId)).limit(1);
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    res.json({
      jobId: job.jobId,
      status: job.status,
      message: job.message,
      progress: job.progress,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      entriesCreated: job.entriesCreated,
      categoriesCreated: job.categoriesCreated,
      error: job.error,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get import status" });
  }
});

export default router;
