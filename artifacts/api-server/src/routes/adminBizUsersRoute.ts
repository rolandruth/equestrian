import { Router } from "express";
import { db, bizUsers } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth.js";
import { desc, eq } from "drizzle-orm";

const router = Router();

function formatBizUser(u: typeof bizUsers.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName ?? null,
    lastName: u.lastName ?? null,
    stripeCustomerId: u.stripeCustomerId ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

router.get("/admin/biz-users", requireAdmin, async (req, res) => {
  try {
    const all = await db.select().from(bizUsers).orderBy(desc(bizUsers.createdAt));
    res.json({ bizUsers: all.map(formatBizUser) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list business accounts" });
  }
});

router.delete("/admin/biz-users/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const deleted = await db.delete(bizUsers).where(eq(bizUsers.id, id)).returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Business account not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete business account" });
  }
});

export default router;
