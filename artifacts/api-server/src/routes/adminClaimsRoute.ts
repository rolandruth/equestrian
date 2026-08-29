import { Router } from "express";
import { db, entries, entryClaims, bizUsers } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth.js";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

const router = Router();

async function hydrateClaims(claims: (typeof entryClaims.$inferSelect)[]) {
  const entryIds = [...new Set(claims.map((c) => c.entryId))];
  const userIds = [...new Set(claims.map((c) => c.bizUserId))];

  const [entryRows, userRows] = await Promise.all([
    entryIds.length
      ? db
          .select({
            id: entries.id,
            title: entries.title,
            category: entries.category,
            location: entries.location,
            contactEmail: entries.contactEmail,
            ownerId: entries.ownerId,
          })
          .from(entries)
          .where(inArray(entries.id, entryIds))
      : Promise.resolve([]),
    userIds.length
      ? db
          .select({
            id: bizUsers.id,
            email: bizUsers.email,
            firstName: bizUsers.firstName,
            lastName: bizUsers.lastName,
          })
          .from(bizUsers)
          .where(inArray(bizUsers.id, userIds))
      : Promise.resolve([]),
  ]);

  const entryMap = new Map(entryRows.map((r) => [r.id, r]));
  const userMap = new Map(userRows.map((r) => [r.id, r]));

  return claims.map((c) => ({
    id: c.id,
    entryId: c.entryId,
    bizUserId: c.bizUserId,
    status: c.status,
    approvedVia: c.approvedVia,
    createdAt: c.createdAt,
    decidedAt: c.decidedAt,
    entry: entryMap.get(c.entryId) ?? null,
    bizUser: userMap.get(c.bizUserId) ?? null,
  }));
}

// GET /api/admin/claims?status=pending — list claim requests for review.
router.get("/admin/claims", requireAdmin, async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const where = status ? eq(entryClaims.status, status) : undefined;
    const claims = await db
      .select()
      .from(entryClaims)
      .where(where)
      .orderBy(desc(entryClaims.createdAt))
      .limit(200);
    res.json({ claims: await hydrateClaims(claims) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list claims" });
  }
});

// POST /api/admin/claims/:id/approve — assign ownership to the claimant.
router.post("/admin/claims/:id/approve", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [claim] = await db.select().from(entryClaims).where(eq(entryClaims.id, id));
    if (!claim) { res.status(404).json({ error: "Claim not found" }); return; }
    if (claim.status !== "pending") {
      res.status(400).json({ error: `Claim is already ${claim.status}` });
      return;
    }

    // Atomic conditional update — only wins while the listing is unclaimed
    // (or already owned by the claimant).
    const [updated] = await db
      .update(entries)
      .set({ ownerId: claim.bizUserId, updatedAt: new Date() })
      .where(
        and(
          eq(entries.id, claim.entryId),
          or(isNull(entries.ownerId), eq(entries.ownerId, claim.bizUserId)),
        ),
      )
      .returning();

    if (!updated) {
      res.status(409).json({ error: "This listing is already owned by another account" });
      return;
    }

    const [saved] = await db
      .update(entryClaims)
      .set({
        status: "approved",
        approvedVia: "admin",
        decidedBy: (req as any).userId ?? null,
        decidedAt: new Date(),
      })
      .where(eq(entryClaims.id, id))
      .returning();

    // Auto-reject any other pending claims for the same listing.
    await db
      .update(entryClaims)
      .set({ status: "rejected", decidedBy: (req as any).userId ?? null, decidedAt: new Date() })
      .where(
        and(
          eq(entryClaims.entryId, claim.entryId),
          eq(entryClaims.status, "pending"),
        ),
      );

    req.log.info({ claimId: id, entryId: claim.entryId }, "Admin approved listing claim");
    res.json({ claim: (await hydrateClaims([saved]))[0] });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to approve claim" });
  }
});

// POST /api/admin/claims/:id/reject — decline a pending claim.
router.post("/admin/claims/:id/reject", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [saved] = await db
      .update(entryClaims)
      .set({ status: "rejected", decidedBy: (req as any).userId ?? null, decidedAt: new Date() })
      .where(and(eq(entryClaims.id, id), eq(entryClaims.status, "pending")))
      .returning();
    if (!saved) { res.status(404).json({ error: "Pending claim not found" }); return; }
    req.log.info({ claimId: id }, "Admin rejected listing claim");
    res.json({ claim: (await hydrateClaims([saved]))[0] });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to reject claim" });
  }
});

// POST /api/admin/claims/:id/revoke — undo an approved claim: clears the
// listing's ownerId (if still held by the claimant) and marks the claim revoked.
router.post("/admin/claims/:id/revoke", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [claim] = await db.select().from(entryClaims).where(eq(entryClaims.id, id));
    if (!claim) { res.status(404).json({ error: "Claim not found" }); return; }
    if (claim.status !== "approved") {
      res.status(400).json({ error: "Only approved claims can be revoked" });
      return;
    }

    await db
      .update(entries)
      .set({ ownerId: null, updatedAt: new Date() })
      .where(and(eq(entries.id, claim.entryId), eq(entries.ownerId, claim.bizUserId)));

    const [saved] = await db
      .update(entryClaims)
      .set({ status: "revoked", decidedBy: (req as any).userId ?? null, decidedAt: new Date() })
      .where(eq(entryClaims.id, id))
      .returning();

    req.log.info({ claimId: id, entryId: claim.entryId }, "Admin revoked listing claim");
    res.json({ claim: (await hydrateClaims([saved]))[0] });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to revoke claim" });
  }
});

export default router;
