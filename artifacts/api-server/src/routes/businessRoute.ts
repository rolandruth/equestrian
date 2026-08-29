import { Router, type Request, type Response } from "express";
import { db, entries, entryClaims } from "@workspace/db";
import { and, desc, eq, ilike, inArray, isNull } from "drizzle-orm";

const router = Router();

function requireBizAuth(req: Request, res: Response): boolean {
  if (!req.isBizAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

// Search restricted to unclaimed + published listings — the only listings a
// business owner is allowed to request a claim for.
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

// Claiming a listing requires verification. Business-account emails are
// self-declared at signup (there is no inbox/ownership verification), so an
// email match against the listing's publicly displayed contact email proves
// nothing — an attacker could simply sign up with that address. Therefore
// EVERY claim is queued as pending for admin review; entries.ownerId is only
// assigned when an admin approves the claim. Do not add an email-match
// auto-approval branch here unless a real control-of-inbox verification
// (e.g. one-time code sent to the listing's contact email) exists first.
router.post("/claim", async (req: Request, res: Response) => {
  if (!requireBizAuth(req, res)) return;

  const { entryId } = req.body as { entryId?: number };
  if (!entryId || typeof entryId !== "number") {
    res.status(400).json({ error: "entryId is required" });
    return;
  }

  const [entry] = await db.select().from(entries).where(eq(entries.id, entryId));
  if (!entry) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  if (!entry.published) {
    res.status(400).json({ error: "This listing is not published yet" });
    return;
  }
  if (entry.ownerId && entry.ownerId !== req.bizUser!.id) {
    res.status(409).json({ error: "This listing has already been claimed" });
    return;
  }
  if (entry.ownerId === req.bizUser!.id) {
    res.json({ entry, approved: true });
    return;
  }

  // Queue the claim for admin review. De-dupe: one pending claim per
  // (entry, user).
  const [existing] = await db
    .select()
    .from(entryClaims)
    .where(
      and(
        eq(entryClaims.entryId, entryId),
        eq(entryClaims.bizUserId, req.bizUser!.id),
        eq(entryClaims.status, "pending"),
      ),
    );
  if (existing) {
    res.json({ pending: true, claim: existing });
    return;
  }

  const [claim] = await db
    .insert(entryClaims)
    .values({ entryId, bizUserId: req.bizUser!.id })
    .returning();

  res.json({ pending: true, claim });
});

// The current user's claim requests, with listing titles, so the dashboard
// can show pending/rejected status.
router.get("/my-claims", async (req: Request, res: Response) => {
  if (!requireBizAuth(req, res)) return;

  const claims = await db
    .select()
    .from(entryClaims)
    .where(eq(entryClaims.bizUserId, req.bizUser!.id))
    .orderBy(desc(entryClaims.createdAt));

  const entryIds = [...new Set(claims.map((c) => c.entryId))];
  const rows = entryIds.length
    ? await db
        .select({ id: entries.id, title: entries.title, category: entries.category, location: entries.location })
        .from(entries)
        .where(inArray(entries.id, entryIds))
    : [];
  const entryMap = new Map(rows.map((r) => [r.id, r]));

  res.json({
    claims: claims.map((c) => ({
      id: c.id,
      entryId: c.entryId,
      status: c.status,
      createdAt: c.createdAt,
      entry: entryMap.get(c.entryId) ?? null,
    })),
  });
});

// Cancel one of my own pending claims.
router.delete("/my-claims/:id", async (req: Request, res: Response) => {
  if (!requireBizAuth(req, res)) return;

  const id = parseInt(String(req.params.id));
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid claim id" });
    return;
  }

  const deleted = await db
    .delete(entryClaims)
    .where(
      and(
        eq(entryClaims.id, id),
        eq(entryClaims.bizUserId, req.bizUser!.id),
        eq(entryClaims.status, "pending"),
      ),
    )
    .returning();

  if (deleted.length === 0) {
    res.status(404).json({ error: "Pending claim not found" });
    return;
  }
  res.json({ success: true });
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
