import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  db,
  entries,
  imageOptimizationItems,
  imageOptimizationJobs,
  pool,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import {
  ensureListingImageOptimizationWorker,
  getListingImageOptimizationJob,
} from "../lib/listingImageOptimization";
import {
  deleteOptimizedListingImage,
  type ListingImageTarget,
} from "../lib/imageStore";
import { objectStorageClient } from "../lib/objectStorage";

const [active] = await db
  .select({ jobId: imageOptimizationJobs.jobId })
  .from(imageOptimizationJobs)
  .where(inArray(imageOptimizationJobs.status, ["pending", "running"]))
  .limit(1);
assert.equal(active, undefined, "Refusing to run queue smoke check while a real job is active");

const suffix = randomUUID();
const jobId = `smoke-${suffix}`;
const publicPath = (process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)[0];
assert.ok(publicPath, "PUBLIC_OBJECT_SEARCH_PATHS is required");
const [bucketName, ...baseParts] = publicPath.replace(/^\//, "").split("/");
const relativeKey = `listing-images/queue-smoke-${suffix}.jpg`;
const objectName = [...baseParts, relativeKey].filter(Boolean).join("/");
const sourceFile = objectStorageClient.bucket(bucketName).file(objectName);
const sourceUrl = `/api/storage/public-objects/${relativeKey}`;
let entryId: number | null = null;
let optimizedPath: string | null = null;

try {
  const sourceBuffer = await sharp({
    create: {
      width: 2200,
      height: 1400,
      channels: 3,
      background: { r: 64, g: 112, b: 72 },
    },
  }).jpeg({ quality: 94 }).toBuffer();
  await sourceFile.save(sourceBuffer, {
    contentType: "image/jpeg",
    resumable: false,
  });

  const [entry] = await db
    .insert(entries)
    .values({
      title: `Image queue smoke ${suffix}`,
      published: false,
      customFields: { listingimage: sourceUrl },
    })
    .returning({ id: entries.id });
  entryId = entry.id;

  // PostgreSQL defaults retain more timestamp precision than JavaScript Date.
  // Use xmin as the exact row version and prove a stale version is rejected.
  const [versioned] = await db
    .select({
      rowVersion: sql<string>`${entries}.xmin::text`.as("row_version"),
    })
    .from(entries)
    .where(eq(entries.id, entryId))
    .limit(1);
  await db
    .update(entries)
    .set({ summary: "Concurrent edit marker", updatedAt: new Date() })
    .where(eq(entries.id, entryId));
  const staleWrite = await db
    .update(entries)
    .set({ location: "This stale write must not apply" })
    .where(and(
      eq(entries.id, entryId),
      sql`${entries}.xmin::text = ${versioned.rowVersion}`,
    ))
    .returning({ id: entries.id });
  assert.equal(staleWrite.length, 0);

  const targets: ListingImageTarget[] = [{
    key: "listingimage",
    value: sourceUrl,
    source: "stored",
  }];
  await db.insert(imageOptimizationJobs).values({
    jobId,
    snapshot: "smoke",
    status: "running",
    totalEntries: 1,
    totalImages: 1,
    message: "Queue smoke check",
  });
  await db.insert(imageOptimizationItems).values({
    jobId,
    entryId,
    entryTitle: `Image queue smoke ${suffix}`,
    targets,
    imageCount: 1,
  });

  ensureListingImageOptimizationWorker();
  const deadline = Date.now() + 20_000;
  let job = await getListingImageOptimizationJob(jobId);
  while (job?.status === "running" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    job = await getListingImageOptimizationJob(jobId);
  }

  assert.ok(job);
  assert.equal(job.status, "complete");
  assert.equal(job.processed, 1);
  assert.equal(job.optimized, 1);
  assert.equal(job.skipped, 0);
  assert.equal(job.failed, 0);

  const [updatedEntry] = await db
    .select({
      customFields: entries.customFields,
      summary: entries.summary,
      location: entries.location,
    })
    .from(entries)
    .where(eq(entries.id, entryId))
    .limit(1);
  const updatedFields = updatedEntry.customFields as Record<string, unknown>;
  optimizedPath = typeof updatedFields.listingimage === "string"
    ? updatedFields.listingimage
    : null;
  assert.ok(optimizedPath);
  assert.ok(optimizedPath.startsWith("/api/storage/public-objects/listing-images/optimized/"));
  assert.equal(updatedEntry.summary, "Concurrent edit marker");
  assert.equal(updatedEntry.location, null);
  assert.equal((await sourceFile.exists())[0], true, "Original source object must be retained");

  const optimizedKey = optimizedPath.slice("/api/storage/public-objects/".length);
  const optimizedName = [...baseParts, optimizedKey].filter(Boolean).join("/");
  const [optimizedBuffer] = await objectStorageClient.bucket(bucketName).file(optimizedName).download();
  const optimizedMetadata = await sharp(optimizedBuffer).metadata();
  assert.equal(optimizedMetadata.format, "webp");
  assert.ok((optimizedMetadata.width ?? 0) <= 1600);
  assert.ok((optimizedMetadata.height ?? 0) <= 1200);
  console.info("listing image queue smoke checks passed");
} finally {
  await db
    .delete(imageOptimizationJobs)
    .where(eq(imageOptimizationJobs.jobId, jobId));
  if (entryId !== null) {
    await db.delete(entries).where(eq(entries.id, entryId));
  }
  if (optimizedPath) {
    await deleteOptimizedListingImage(optimizedPath);
  }
  await sourceFile.delete({ ignoreNotFound: true });
  await new Promise((resolve) => setTimeout(resolve, 100));
  await pool.end();
}