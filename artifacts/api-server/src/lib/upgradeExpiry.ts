import { db, entries } from "@workspace/db";
import { and, eq, lt, sql } from "drizzle-orm";

let lastSweep = 0;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // at most once every 5 minutes

/**
 * Clears featured/premium flags whose 30-day window has passed.
 * Runs lazily (throttled) from read endpoints so no cron is needed.
 */
export async function expireStaleUpgrades(): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  try {
    const nowDate = new Date();
    await db.update(entries)
      .set({ featured: false, featuredUntil: null, updatedAt: nowDate })
      .where(and(eq(entries.featured, true), lt(entries.featuredUntil, nowDate)));
    await db.update(entries)
      .set({ premium: false, premiumUntil: null, updatedAt: nowDate })
      .where(and(eq(entries.premium, true), lt(entries.premiumUntil, nowDate)));
  } catch (err) {
    // Don't let a sweep failure break the request that triggered it,
    // but allow a retry on the next interval.
    lastSweep = 0;
    console.error("Failed to expire stale featured/premium upgrades:", err);
  }
}
