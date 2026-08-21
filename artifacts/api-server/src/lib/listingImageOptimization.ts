import { createHash, randomUUID } from "crypto";
import {
  db,
  entries,
  imageOptimizationItems,
  imageOptimizationJobs,
} from "@workspace/db";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  deleteOptimizedListingImage,
  getListingImageTargets,
  optimizeListingImageTarget,
  type ListingImageTarget,
} from "./imageStore";
import { logger } from "./logger";

interface ImageSnapshotEntry {
  id: number;
  title: string;
  updatedAt: string;
  targets: ListingImageTarget[];
}

export interface ListingImageOptimizationPreview {
  totalEntries: number;
  totalImages: number;
  snapshot: string;
  sample: Array<{ id: number; title: string; imageCount: number }>;
}

export interface ListingImageOptimizationJob {
  jobId: string;
  status: "running" | "complete" | "error";
  total: number;
  processed: number;
  optimized: number;
  removed: number;
  skipped: number;
  failed: number;
  remaining?: number;
  message: string;
  error?: string;
}

interface ClaimedItem {
  id: number;
  jobId: string;
  entryId: number;
  targets: ListingImageTarget[];
  imageCount: number;
  attempts: number;
}

const START_JOB_ADVISORY_LOCK = 74_290_013;
const WORKER_CONCURRENCY = 3;
const WORKER_POLL_MS = 5_000;
const STALE_PROCESSING_MS = 10 * 60_000;
const MAX_ITEM_ATTEMPTS = 3;
const MAX_TARGET_ATTEMPTS = 3;
let localWorkerRunning = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildSnapshot(): Promise<{
  preview: ListingImageOptimizationPreview;
  entries: ImageSnapshotEntry[];
}> {
  const rows = await db
    .select({
      id: entries.id,
      title: entries.title,
      customFields: entries.customFields,
      updatedAt: entries.updatedAt,
    })
    .from(entries)
    .orderBy(entries.id);

  const snapshotEntries: ImageSnapshotEntry[] = rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      targets: getListingImageTargets(row.customFields as Record<string, unknown> | null),
    }))
    .filter((row) => row.targets.length > 0);
  const totalImages = snapshotEntries.reduce((total, entry) => total + entry.targets.length, 0);
  const snapshot = createHash("sha256")
    .update(JSON.stringify(snapshotEntries))
    .digest("hex");

  return {
    entries: snapshotEntries,
    preview: {
      totalEntries: snapshotEntries.length,
      totalImages,
      snapshot,
      sample: snapshotEntries.slice(0, 8).map((entry) => ({
        id: entry.id,
        title: entry.title,
        imageCount: entry.targets.length,
      })),
    },
  };
}

function toPublicJob(
  job: typeof imageOptimizationJobs.$inferSelect,
): ListingImageOptimizationJob {
  return {
    jobId: job.jobId,
    status: job.status === "complete" ? "complete" : job.status === "error" ? "error" : "running",
    total: job.totalImages,
    processed: job.processedImages,
    optimized: job.optimizedImages,
    removed: job.removedImages,
    skipped: job.skippedImages,
    failed: job.failedImages,
    remaining: job.remainingImages ?? undefined,
    message: job.message,
    error: job.error ?? undefined,
  };
}

export async function getListingImageOptimizationPreview(): Promise<ListingImageOptimizationPreview> {
  return (await buildSnapshot()).preview;
}

export async function startListingImageOptimization(
  snapshot: string,
  confirmation: string,
): Promise<{ job?: ListingImageOptimizationJob; error?: string; status?: number }> {
  const current = await buildSnapshot();
  if (snapshot !== current.preview.snapshot) {
    return { error: "The image list changed. Refresh the preview before running optimization.", status: 409 };
  }
  const expectedConfirmation = `OPTIMIZE ${current.preview.totalImages} IMAGES`;
  if (confirmation.trim().toUpperCase() !== expectedConfirmation) {
    return { error: `Type "${expectedConfirmation}" to confirm.`, status: 400 };
  }
  if (current.preview.totalImages === 0) {
    return { error: "There are no listing images waiting for optimization.", status: 400 };
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${START_JOB_ADVISORY_LOCK})`);
    const [active] = await tx
      .select({ jobId: imageOptimizationJobs.jobId })
      .from(imageOptimizationJobs)
      .where(inArray(imageOptimizationJobs.status, ["pending", "running"]))
      .limit(1);
    if (active) {
      return { error: "An image optimization job is already running.", status: 409 } as const;
    }

    const jobId = randomUUID();
    const [job] = await tx
      .insert(imageOptimizationJobs)
      .values({
        jobId,
        snapshot: current.preview.snapshot,
        status: "running",
        totalEntries: current.preview.totalEntries,
        totalImages: current.preview.totalImages,
        message: "Preparing listing images…",
      })
      .returning();

    const itemRows = current.entries.map((entry) => ({
      jobId,
      entryId: entry.id,
      entryTitle: entry.title,
      targets: entry.targets,
      imageCount: entry.targets.length,
    }));
    for (let offset = 0; offset < itemRows.length; offset += 250) {
      await tx.insert(imageOptimizationItems).values(itemRows.slice(offset, offset + 250));
    }
    return { job: toPublicJob(job) } as const;
  });

  if (result.job) ensureListingImageOptimizationWorker();
  return result;
}

async function recoverStaleItems(): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  await db
    .update(imageOptimizationItems)
    .set({
      status: "pending",
      error: "Recovered after an interrupted worker.",
      updatedAt: new Date(),
    })
    .where(and(
      eq(imageOptimizationItems.status, "processing"),
      lt(imageOptimizationItems.updatedAt, staleBefore),
    ));
}

async function claimItems(): Promise<ClaimedItem[]> {
  return await db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      with next_items as (
        select item.id
        from image_optimization_items item
        inner join image_optimization_jobs job on job.job_id = item.job_id
        where item.status = 'pending' and job.status = 'running'
        order by job.created_at asc, item.id asc
        limit ${WORKER_CONCURRENCY}
        for update of item skip locked
      )
      update image_optimization_items item
      set
        status = 'processing',
        attempts = item.attempts + 1,
        updated_at = now()
      from next_items
      where item.id = next_items.id
      returning
        item.id,
        item.job_id as "jobId",
        item.entry_id as "entryId",
        item.targets,
        item.image_count as "imageCount",
        item.attempts
    `);
    return result.rows as unknown as ClaimedItem[];
  });
}

async function removeCreatedObjects(paths: string[]): Promise<void> {
  const results = await Promise.allSettled(paths.map((path) => deleteOptimizedListingImage(path)));
  if (results.some((result) => result.status === "rejected")) {
    logger.warn("Could not remove every unreferenced optimized image after an entry conflict");
  }
}

async function optimizeTargetWithRetries(target: ListingImageTarget): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_TARGET_ATTEMPTS; attempt++) {
    const result = await optimizeListingImageTarget(target);
    if (result) return result;
    if (attempt < MAX_TARGET_ATTEMPTS) await sleep(attempt * 500);
  }
  return null;
}

async function completeItem(
  itemId: number,
  counts: {
    optimized: number;
    removed: number;
    skipped: number;
    failed: number;
  },
  error?: string,
): Promise<void> {
  await db
    .update(imageOptimizationItems)
    .set(completedItemValues(counts, error))
    .where(eq(imageOptimizationItems.id, itemId));
}

function completedItemValues(
  counts: {
    optimized: number;
    removed: number;
    skipped: number;
    failed: number;
  },
  error?: string,
) {
  const now = new Date();
  return {
    status: "complete",
    optimizedCount: counts.optimized,
    removedCount: counts.removed,
    skippedCount: counts.skipped,
    failedCount: counts.failed,
    error: error ?? null,
    updatedAt: now,
    completedAt: now,
  };
}

async function processItem(item: ClaimedItem): Promise<void> {
  const createdPaths: string[] = [];
  try {
    const [current] = await db
      .select({
        customFields: entries.customFields,
        rowVersion: sql<string>`${entries}.xmin::text`.as("row_version"),
      })
      .from(entries)
      .where(eq(entries.id, item.entryId))
      .limit(1);
    if (
      !current ||
      !current.customFields ||
      typeof current.customFields !== "object" ||
      Array.isArray(current.customFields)
    ) {
      await completeItem(item.id, {
        optimized: 0,
        removed: 0,
        skipped: item.imageCount,
        failed: 0,
      }, "Listing was deleted or its image fields changed.");
      return;
    }

    const updatedFields: Record<string, unknown> = {
      ...(current.customFields as Record<string, unknown>),
    };
    let optimized = 0;
    let removed = 0;
    let skipped = 0;
    let failed = 0;
    let changed = false;

    for (const target of item.targets) {
      if (updatedFields[target.key] !== target.value) {
        skipped++;
        continue;
      }
      if (target.source === "paid") {
        delete updatedFields[target.key];
        removed++;
        changed = true;
        continue;
      }
      const optimizedPath = await optimizeTargetWithRetries(target);
      if (!optimizedPath) {
        failed++;
        continue;
      }
      createdPaths.push(optimizedPath);
      updatedFields[target.key] = optimizedPath;
      optimized++;
      changed = true;
    }

    if (!changed) {
      await completeItem(item.id, { optimized, removed, skipped, failed },
        failed > 0 ? "One or more images could not be optimized." : undefined);
      return;
    }

    const counts = { optimized, removed, skipped, failed };
    const committed = await db.transaction(async (tx) => {
      const updated = await tx
        .update(entries)
        .set({ customFields: updatedFields, updatedAt: new Date() })
        .where(and(
          eq(entries.id, item.entryId),
          sql`${entries}.xmin::text = ${current.rowVersion}`,
        ))
        .returning({ id: entries.id });
      if (updated.length === 0) return false;
      await tx
        .update(imageOptimizationItems)
        .set(completedItemValues(
          counts,
          failed > 0 ? "One or more images could not be optimized." : undefined,
        ))
        .where(eq(imageOptimizationItems.id, item.id));
      return true;
    });
    if (!committed) {
      await removeCreatedObjects(createdPaths);
      await completeItem(item.id, {
        optimized: 0,
        removed: 0,
        skipped: item.imageCount,
        failed: 0,
      }, "Skipped because the listing changed during image processing.");
      return;
    }
  } catch (err) {
    await removeCreatedObjects(createdPaths);
    const message = err instanceof Error ? err.message : "Unexpected image processing error";
    logger.error({ err, itemId: item.id, jobId: item.jobId }, "Listing image queue item failed");
    if (item.attempts < MAX_ITEM_ATTEMPTS) {
      await db
        .update(imageOptimizationItems)
        .set({
          status: "pending",
          error: message.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(imageOptimizationItems.id, item.id));
    } else {
      await completeItem(item.id, {
        optimized: 0,
        removed: 0,
        skipped: 0,
        failed: item.imageCount,
      }, message.slice(0, 500));
    }
  }
}

async function refreshJob(jobId: string): Promise<void> {
  const [job] = await db
    .select()
    .from(imageOptimizationJobs)
    .where(eq(imageOptimizationJobs.jobId, jobId))
    .limit(1);
  if (!job || job.status !== "running") return;

  const items = await db
    .select({
      status: imageOptimizationItems.status,
      imageCount: imageOptimizationItems.imageCount,
      optimizedCount: imageOptimizationItems.optimizedCount,
      removedCount: imageOptimizationItems.removedCount,
      skippedCount: imageOptimizationItems.skippedCount,
      failedCount: imageOptimizationItems.failedCount,
    })
    .from(imageOptimizationItems)
    .where(eq(imageOptimizationItems.jobId, jobId));

  const completedItems = items.filter((item) => item.status === "complete");
  const processed = completedItems.reduce((sum, item) => sum + item.imageCount, 0);
  const optimized = completedItems.reduce((sum, item) => sum + item.optimizedCount, 0);
  const removed = completedItems.reduce((sum, item) => sum + item.removedCount, 0);
  const skipped = completedItems.reduce((sum, item) => sum + item.skippedCount, 0);
  const failed = completedItems.reduce((sum, item) => sum + item.failedCount, 0);
  const hasWork = items.some((item) => item.status === "pending" || item.status === "processing");

  if (hasWork) {
    await db
      .update(imageOptimizationJobs)
      .set({
        processedImages: processed,
        optimizedImages: optimized,
        removedImages: removed,
        skippedImages: skipped,
        failedImages: failed,
        message: `Processed ${processed} of ${job.totalImages} listing images…`,
        updatedAt: new Date(),
      })
      .where(eq(imageOptimizationJobs.jobId, jobId));
    return;
  }

  const remaining = (await buildSnapshot()).preview.totalImages;
  await db
    .update(imageOptimizationJobs)
    .set({
      status: "complete",
      processedImages: processed,
      optimizedImages: optimized,
      removedImages: removed,
      skippedImages: skipped,
      failedImages: failed,
      remainingImages: remaining,
      message: failed > 0
        ? `Finished with ${optimized} optimized, ${removed} removed, and ${failed} needing attention.`
        : `Finished optimizing ${optimized} and safely removing ${removed} listing images.`,
      updatedAt: new Date(),
      completedAt: new Date(),
    })
    .where(eq(imageOptimizationJobs.jobId, jobId));
}

async function getActiveJobIds(): Promise<string[]> {
  const rows = await db
    .select({ jobId: imageOptimizationJobs.jobId })
    .from(imageOptimizationJobs)
    .where(inArray(imageOptimizationJobs.status, ["pending", "running"]))
    .orderBy(asc(imageOptimizationJobs.createdAt));
  return rows.map((row) => row.jobId);
}

async function runWorker(): Promise<void> {
  try {
    for (;;) {
      await recoverStaleItems();
      const claimed = await claimItems();
      if (claimed.length > 0) {
        await Promise.all(claimed.map(processItem));
        for (const jobId of new Set(claimed.map((item) => item.jobId))) {
          await refreshJob(jobId);
        }
        continue;
      }

      const activeJobIds = await getActiveJobIds();
      if (activeJobIds.length === 0) return;
      for (const jobId of activeJobIds) await refreshJob(jobId);
      if ((await getActiveJobIds()).length === 0) return;
      await sleep(WORKER_POLL_MS);
    }
  } catch (err) {
    logger.error({ err }, "Listing image optimization worker stopped unexpectedly");
    setTimeout(ensureListingImageOptimizationWorker, WORKER_POLL_MS);
  } finally {
    localWorkerRunning = false;
  }
}

export function ensureListingImageOptimizationWorker(): void {
  if (localWorkerRunning) return;
  localWorkerRunning = true;
  setImmediate(() => { void runWorker(); });
}

export async function resumeListingImageOptimizationJobs(): Promise<void> {
  await recoverStaleItems();
  if ((await getActiveJobIds()).length > 0) ensureListingImageOptimizationWorker();
}

export async function getListingImageOptimizationJob(
  jobId: string,
): Promise<ListingImageOptimizationJob | null> {
  const [job] = await db
    .select()
    .from(imageOptimizationJobs)
    .where(eq(imageOptimizationJobs.jobId, jobId))
    .limit(1);
  if (!job) return null;
  if (job.status === "running" || job.status === "pending") ensureListingImageOptimizationWorker();
  return toPublicJob(job);
}