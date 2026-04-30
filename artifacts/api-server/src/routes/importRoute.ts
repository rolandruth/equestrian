import { Router } from "express";
import { db } from "@workspace/db";
import { importJobs, entries, categories } from "@workspace/db";
import { requireEditor } from "../middlewares/auth.js";
import { ai } from "@workspace/integrations-gemini-ai";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";

const router = Router();

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function processImport(jobId: string, csvContent: string) {
  try {
    const lines = csvContent.trim().split("\n");
    const totalRows = lines.length - 1;

    await db.update(importJobs).set({
      status: "processing",
      totalRows,
      processedRows: 0,
      message: "Directory Master is reviewing your CSV and organizing your directory.",
      updatedAt: new Date(),
    }).where(eq(importJobs.jobId, jobId));

    const prompt = `You are a directory data organizer. I have CSV data that needs to be organized into structured directory entries.

CSV Content:
${csvContent}

Instructions:
1. Parse every row of CSV data (skip the header row).
2. For each row, create a structured entry with these fields:
   - title: the most prominent name/title field
   - category: assign a category (group similar entries together, max 10 categories)
   - summary: a 1-2 sentence summary
   - description: more detailed description
   - contactEmail: email if present
   - contactPhone: phone if present
   - website: URL if present
   - location: city/state/country if present
   - tags: comma-separated tags relevant to the entry
   - moreDetails: any other important info that doesn't fit above (as JSON string or plain text)
   - sourceCsvRow: the original CSV row as a string

3. Also return the unique categories found.

Return a JSON object with this structure:
{
  "entries": [
    {
      "title": "...",
      "category": "...",
      "summary": "...",
      "description": "...",
      "contactEmail": null,
      "contactPhone": null,
      "website": null,
      "location": null,
      "tags": "tag1, tag2",
      "moreDetails": null,
      "sourceCsvRow": "..."
    }
  ],
  "categories": ["Category1", "Category2"]
}

Return ONLY valid JSON. No markdown, no explanation.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 8192, responseMimeType: "application/json" },
    });

    const text = response.text ?? "";
    if (!text) throw new Error("Gemini returned an empty response. Please try again.");

    let parsed: { entries: any[]; categories: string[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error(`Failed to parse Gemini response. Raw: ${text.slice(0, 200)}`);
      parsed = JSON.parse(match[0]);
    }

    if (!parsed.entries || !Array.isArray(parsed.entries)) {
      throw new Error("Gemini did not return a valid entries array. Please check your CSV format.");
    }

    let categoriesCreated = 0;
    for (const catName of (parsed.categories ?? [])) {
      const slug = slugify(catName);
      const existing = await db.select().from(categories).where(eq(categories.name, catName)).limit(1);
      if (existing.length === 0) {
        await db.insert(categories).values({ name: catName, slug }).onConflictDoNothing();
        categoriesCreated++;
      }
    }

    let entriesCreated = 0;
    for (const entry of (parsed.entries ?? [])) {
      await db.insert(entries).values({
        title: entry.title || "Untitled",
        category: entry.category || null,
        summary: entry.summary || null,
        description: entry.description || null,
        contactEmail: entry.contactEmail || null,
        contactPhone: entry.contactPhone || null,
        website: entry.website || null,
        location: entry.location || null,
        tags: entry.tags || null,
        moreDetails: entry.moreDetails || null,
        sourceCsvRow: entry.sourceCsvRow || null,
        published: true,
      });
      entriesCreated++;

      await db.update(importJobs).set({
        processedRows: entriesCreated,
        progress: Math.round((entriesCreated / totalRows) * 100),
        updatedAt: new Date(),
      }).where(eq(importJobs.jobId, jobId));
    }

    await db.update(importJobs).set({
      status: "complete",
      message: `Import complete! Created ${entriesCreated} entries in ${categoriesCreated} categories.`,
      processedRows: entriesCreated,
      entriesCreated,
      categoriesCreated,
      progress: 100,
      updatedAt: new Date(),
    }).where(eq(importJobs.jobId, jobId));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await db.update(importJobs).set({
      status: "error",
      error: errMsg,
      message: "Something went wrong during import. Please check your CSV and try again.",
      updatedAt: new Date(),
    }).where(eq(importJobs.jobId, jobId));
  }
}

router.post("/csv", requireEditor, async (req, res) => {
  try {
    const { csvContent } = req.body;
    if (!csvContent) {
      res.status(400).json({ error: "CSV content is required" });
      return;
    }

    const jobId = randomUUID();
    const [job] = await db.insert(importJobs).values({
      jobId,
      status: "pending",
      message: "Import job created",
    }).returning();

    processImport(jobId, csvContent).catch((err) => logger.error(err, "processImport failed"));

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
