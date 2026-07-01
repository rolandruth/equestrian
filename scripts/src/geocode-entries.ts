import { db } from "@workspace/db";
import { entries } from "@workspace/db";
import { eq, isNull, isNotNull, and } from "drizzle-orm";

const DELAY_MS = 1100;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function geocode(location: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "SaddleUpGuide/1.0 (equestrian directory)" },
    });
    if (!res.ok) return null;
    const data = await res.json() as any[];
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

async function main() {
  const rows = await db
    .select({ id: entries.id, location: entries.location })
    .from(entries)
    .where(and(isNull(entries.latitude), isNotNull(entries.location)));

  console.log(`Geocoding ${rows.length} entries with locations but no coordinates...`);
  let done = 0, failed = 0;

  for (const row of rows) {
    if (!row.location) continue;
    await sleep(DELAY_MS);
    const coords = await geocode(row.location);
    if (coords) {
      await db.update(entries)
        .set({ latitude: coords.lat, longitude: coords.lon })
        .where(eq(entries.id, row.id));
      done++;
      if (done % 10 === 0) console.log(`  ${done} geocoded...`);
    } else {
      failed++;
    }
  }
  console.log(`Done. ${done} geocoded, ${failed} failed.`);
}

main().catch(console.error).finally(() => process.exit(0));
