import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { reviews, entries } from "@workspace/db";
import { requireEditor } from "../middlewares/auth.js";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

function formatReview(r: typeof reviews.$inferSelect, entryTitle?: string | null) {
  return {
    id: r.id,
    entryId: r.entryId,
    entryTitle: entryTitle ?? null,
    reviewerName: r.reviewerName,
    reviewerEmail: r.reviewerEmail,
    rating: r.rating,
    body: r.body,
    isApproved: r.isApproved,
    createdAt: r.createdAt.toISOString(),
  };
}

// GET /api/reviews — list all reviews (admin/editor), newest first
router.get("/", requireEditor, async (req, res) => {
  try {
    const rows = await db.select({ review: reviews, entryTitle: entries.title })
      .from(reviews)
      .leftJoin(entries, eq(reviews.entryId, entries.id))
      .orderBy(desc(reviews.createdAt));
    res.json(rows.map((r) => formatReview(r.review, r.entryTitle)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list reviews" });
  }
});

// PATCH /api/reviews/:id — approve / unapprove
router.patch("/:id", requireEditor, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { isApproved } = req.body;
    if (typeof isApproved !== "boolean") {
      res.status(400).json({ error: "isApproved (boolean) is required" }); return;
    }
    const [updated] = await db.update(reviews).set({ isApproved })
      .where(eq(reviews.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Review not found" }); return; }
    res.json(formatReview(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update review" });
  }
});

// DELETE /api/reviews/:id
router.delete("/:id", requireEditor, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(reviews).where(eq(reviews.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Review not found" }); return; }
    res.json({ success: true, message: null });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete review" });
  }
});

export default router;
