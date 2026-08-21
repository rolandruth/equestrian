import { db, entries } from "@workspace/db";
import { eq, isNotNull, sql } from "drizzle-orm";
import { allocateSlugs, slugifyTitle } from "../lib/importHelpers.js";
import {
  ENTRY_SLUG_ADVISORY_LOCK_ID,
  isEntrySlugUniqueViolation,
} from "../lib/entrySlugs.js";
import { randomUUID } from "crypto";

const runId = randomUUID().slice(0, 8);
const title = `[SMOKE TEST] Concurrent Slug ${runId}`;
const baseSlug = slugifyTitle(title);
let seoEntryId: number | null = null;
let importedEntryId: number | null = null;
const cleanupIds = new Set<number>();

async function allocateAvailableSlug(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  const existing = await tx
    .select({ slug: entries.slug })
    .from(entries)
    .where(isNotNull(entries.slug));
  return allocateSlugs(
    [title],
    new Set(existing.map((row) => row.slug!).filter(Boolean)),
  )[0];
}

try {
  const [seoTarget] = await db
    .insert(entries)
    .values({ title, slug: null, published: false })
    .returning({ id: entries.id });
  seoEntryId = seoTarget.id;
  cleanupIds.add(seoTarget.id);

  const importWriter = db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ENTRY_SLUG_ADVISORY_LOCK_ID})`);
    const slug = await allocateAvailableSlug(tx);
    const [created] = await tx
      .insert(entries)
      .values({ title, slug, published: false })
      .returning({ id: entries.id, slug: entries.slug });
    importedEntryId = created.id;
    cleanupIds.add(created.id);
    return created;
  });

  const seoWriter = db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ENTRY_SLUG_ADVISORY_LOCK_ID})`);
    const slug = await allocateAvailableSlug(tx);
    const [updated] = await tx
      .update(entries)
      .set({ slug, updatedAt: new Date() })
      .where(eq(entries.id, seoEntryId!))
      .returning({ id: entries.id, slug: entries.slug });
    return updated;
  });

  const [imported, seoUpdated] = await Promise.all([importWriter, seoWriter]);
  importedEntryId = imported.id;
  const slugs = [imported.slug, seoUpdated.slug].sort();
  const expected = [baseSlug, `${baseSlug}-2`].sort();
  if (JSON.stringify(slugs) !== JSON.stringify(expected)) {
    throw new Error(`Expected serialized slugs ${expected.join(", ")}, got ${slugs.join(", ")}`);
  }

  let uniquenessRejected = false;
  try {
    await db
      .update(entries)
      .set({ slug: imported.slug })
      .where(eq(entries.id, seoEntryId));
  } catch (error) {
    uniquenessRejected = isEntrySlugUniqueViolation(error);
  }
  if (!uniquenessRejected) {
    throw new Error("Database did not reject a duplicate entry slug");
  }

  const swapSlugA = `${baseSlug}-swap-a`;
  const swapSlugB = `${baseSlug}-swap-b`;
  const swapRows = await db
    .insert(entries)
    .values([
      { title: `${title} Swap A`, slug: swapSlugA, published: false },
      { title: `${title} Swap B`, slug: swapSlugB, published: false },
    ])
    .returning({ id: entries.id, slug: entries.slug });
  for (const row of swapRows) cleanupIds.add(row.id);

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ENTRY_SLUG_ADVISORY_LOCK_ID})`);
    for (const row of swapRows) {
      await tx
        .update(entries)
        .set({ slug: `seo-tmp-${runId}-${row.id}` })
        .where(eq(entries.id, row.id));
    }
    await tx.update(entries).set({ slug: swapSlugB }).where(eq(entries.id, swapRows[0].id));
    await tx.update(entries).set({ slug: swapSlugA }).where(eq(entries.id, swapRows[1].id));
  });

  const swapped = await Promise.all(swapRows.map(async (row) => {
    const [current] = await db
      .select({ slug: entries.slug })
      .from(entries)
      .where(eq(entries.id, row.id))
      .limit(1);
    return current.slug;
  }));
  if (swapped[0] !== swapSlugB || swapped[1] !== swapSlugA) {
    throw new Error(`Expected swapped slugs ${swapSlugB}, ${swapSlugA}; got ${swapped.join(", ")}`);
  }

  console.log("Entry slug concurrency and swap smoke tests: passed");
} finally {
  for (const id of cleanupIds) {
    await db.delete(entries).where(eq(entries.id, id));
  }
}