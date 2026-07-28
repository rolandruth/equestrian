import { Router, type Request, type Response } from "express";
import { db, entries } from "@workspace/db";
import { and, eq, ilike, isNull, or } from "drizzle-orm";

const router = Router();

function requireBizAuth(req: Request, res: Response): boolean {
  if (!req.isBizAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

// Search restricted to unclaimed + published listings — the only listings a
// business owner is allowed to self-serve claim.
router.get("/claimable", async (req: Request, res: Response) => {
  if (!requireBizAuth(req, res)) return;

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (search.length < 2) {
    res.json({ entries: [] });
    return;
  }

  const results = await db
    .select({
      id: entries.id,
      title: entries.title,
      category: entries.category,
      location: entries.location,
    })
    .from(entries)
    .where(
      and(
        isNull(entries.ownerId),
        eq(entries.published, true),
        ilike(entries.title, `%${search}%`),
      ),
    )
    .limit(8);

  res.json({ entries: results });
});

router.post("/claim", async (req: Request, res: Response) => {
  if (!requireBizAuth(req, res)) return;

  const { entryId } = req.body as { entryId?: number };
  if (!entryId || typeof entryId !== "number") {
    res.status(400).json({ error: "entryId is required" });
    return;
  }

  // Atomic conditional update: only succeeds if the listing is published and
  // is either unclaimed or already owned by this same caller. This closes the
  // race window a separate read-then-write would leave open between two
  // concurrent claimants — Postgres row locking guarantees only one UPDATE can
  // win the "ownerId IS NULL" branch for a given row.
  const [updated] = await db
    .update(entries)
    .set({ ownerId: req.bizUser!.id })
    .where(
      and(
        eq(entries.id, entryId),
        eq(entries.published, true),
        or(isNull(entries.ownerId), eq(entries.ownerId, req.bizUser!.id)),
      ),
    )
    .returning();

  if (updated) {
    res.json({ entry: updated });
    return;
  }

  // Nothing matched — figure out why so we can return a useful error.
  const [entry] = await db.select().from(entries).where(eq(entries.id, entryId));
  if (!entry) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  if (!entry.published) {
    res.status(400).json({ error: "This listing is not published yet" });
    return;
  }
  res.status(409).json({ error: "This listing has already been claimed" });
});

router.get("/my-listings", async (req: Request, res: Response) => {
  if (!requireBizAuth(req, res)) return;

  const myEntries = await db
    .select()
    .from(entries)
    .where(eq(entries.ownerId, req.bizUser!.id));

  const listings = myEntries.map((entry) => ({ entry }));

  res.json({ listings });
});

export default router;
