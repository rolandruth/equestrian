import { db, entries, entryLocations } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  DuplicateLocationRepairConflictError,
  previewDuplicateLocationRepair,
  repairDuplicateLocations,
} from "../lib/duplicateLocationRepair.js";

const insertedIds: number[] = [];

try {
  const baseline = await previewDuplicateLocationRepair();
  if (baseline.totalMatches !== 0) {
    throw new Error(
      `Refusing to run smoke test while ${baseline.totalMatches} real repair candidates exist`,
    );
  }

  const inserted = await db
    .insert(entries)
    .values([
      {
        title: "[SMOKE TEST] Full-state duplicate location",
        location: "10 Test Rd, Chester, AR 72934, Chester, Arkansas 72934",
        published: false,
      },
      {
        title: "[SMOKE TEST] Abbreviated duplicate location",
        location: "20 Test Rd, Chester, AR 72934, Chester, AR 72934",
        published: false,
      },
      {
        title: "[SMOKE TEST] Valid full-state location",
        location: "30 Test Rd, Chester, Arkansas 72934",
        published: false,
      },
      {
        title: "[SMOKE TEST] Valid abbreviated location",
        location: "40 Test Rd, Chester, AR 72934",
        published: false,
      },
    ])
    .returning({ id: entries.id });
  insertedIds.push(...inserted.map((row) => row.id));

  await db.insert(entryLocations).values(
    inserted.map((row) => ({
      entryId: row.id,
      cityName: "Chester",
      citySlug: "chester",
      stateName: "Arkansas",
      stateSlug: "arkansas",
      postalCode: "72934",
      locationStatus: "confirmed",
      locationSource: "import",
      locationConfidence: 1,
    })),
  );

  const preview = await previewDuplicateLocationRepair();
  if (
    preview.totalMatches !== 2 ||
    preview.fullStateMatches !== 1 ||
    preview.abbreviatedMatches !== 1
  ) {
    throw new Error(`Unexpected repair preview: ${JSON.stringify(preview)}`);
  }

  let conflictObserved = false;
  try {
    await repairDuplicateLocations(1);
  } catch (error) {
    conflictObserved =
      error instanceof DuplicateLocationRepairConflictError &&
      error.currentCount === 2;
  }
  if (!conflictObserved) {
    throw new Error("Expected-count mismatch did not abort the repair");
  }

  const result = await repairDuplicateLocations(2);
  if (result.repairedCount !== 2 || result.remainingMatches !== 0) {
    throw new Error(`Unexpected repair result: ${JSON.stringify(result)}`);
  }

  const repaired = await Promise.all(
    insertedIds.map(async (id) => {
      const [row] = await db
        .select({ location: entries.location })
        .from(entries)
        .where(eq(entries.id, id))
        .limit(1);
      return row.location;
    }),
  );
  if (
    repaired[0] !== "10 Test Rd, Chester, Arkansas 72934" ||
    repaired[1] !== "20 Test Rd, Chester, Arkansas 72934" ||
    repaired[2] !== "30 Test Rd, Chester, Arkansas 72934" ||
    repaired[3] !== "40 Test Rd, Chester, AR 72934"
  ) {
    throw new Error(`Unexpected repaired locations: ${repaired.join(" | ")}`);
  }

  console.log("Duplicate-location repair smoke test: passed");
} finally {
  for (const id of insertedIds) {
    await db.delete(entries).where(eq(entries.id, id));
  }
}