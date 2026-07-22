/**
 * One-off migration: download all remote listing images (Google Places API
 * URLs etc.) into our own object storage and rewrite entry customFields to
 * point at locally-served copies.
 *
 * Run: pnpm --filter @workspace/api-server exec tsx src/scripts/mirrorImages.ts
 */
import { db, entries } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { mirrorEntryImages, isRemoteImageUrl } from "../lib/imageStore.js";

const IMAGE_KEY_RE = /^(listingimage|image\d+)$/;

async function main() {
  const all = await db
    .select({ id: entries.id, customFields: entries.customFields })
    .from(entries)
    .where(isNotNull(entries.customFields));

  const targets = all.filter((e) => {
    const cf = e.customFields as Record<string, unknown> | null;
    return cf && Object.entries(cf).some(
      ([k, v]) => IMAGE_KEY_RE.test(k) && typeof v === "string" && isRemoteImageUrl(v),
    );
  });

  console.log(`Entries with remote images: ${targets.length} / ${all.length}`);

  let done = 0, updated = 0, failures = 0;
  const CONCURRENCY = 8;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (entry) => {
      const cf = entry.customFields as Record<string, unknown>;
      const { fields, changed } = await mirrorEntryImages(cf);
      if (changed) {
        await db.update(entries)
          .set({ customFields: fields, updatedAt: new Date() })
          .where(eq(entries.id, entry.id));
        updated++;
      }
      const after = Object.entries(fields ?? {}).filter(
        ([k, v]) => IMAGE_KEY_RE.test(k) && typeof v === "string" && isRemoteImageUrl(v),
      ).length;
      failures += after;
      done++;
    }));
    console.log(`Progress: ${done}/${targets.length} (updated ${updated}, still-remote image fields: ${failures})`);
  }

  console.log(`Done. Updated ${updated} entries. Remaining remote image fields: ${failures}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
