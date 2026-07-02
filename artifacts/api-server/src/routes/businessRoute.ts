import { Router, type Request, type Response } from "express";
import { db, entries, listingSubscriptions } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getUncachableStripeClient } from "../stripeClient.js";

const router = Router();

function requireBizAuth(req: Request, res: Response): boolean {
  if (!req.isBizAuthenticated()) {
    res.status(401).json({ error: "Login required" });
    return false;
  }
  return true;
}

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

  if (entry.ownerId && entry.ownerId !== req.bizUser!.id) {
    res.status(409).json({ error: "This listing has already been claimed" });
    return;
  }

  if (entry.ownerId === req.bizUser!.id) {
    res.json({ entry });
    return;
  }

  const [updated] = await db
    .update(entries)
    .set({ ownerId: req.bizUser!.id })
    .where(eq(entries.id, entryId))
    .returning();

  res.json({ entry: updated });
});

router.get("/my-listings", async (req: Request, res: Response) => {
  if (!requireBizAuth(req, res)) return;

  const myEntries = await db
    .select()
    .from(entries)
    .where(eq(entries.ownerId, req.bizUser!.id));

  const subscriptions = await db
    .select()
    .from(listingSubscriptions)
    .where(eq(listingSubscriptions.ownerId, req.bizUser!.id));

  const listings = myEntries.map((entry) => ({
    entry,
    subscription:
      subscriptions.find(
        (s) => s.entryId === entry.id && s.status === "active",
      ) ?? null,
  }));

  res.json({ listings });
});

router.post("/cancel-plan", async (req: Request, res: Response) => {
  if (!requireBizAuth(req, res)) return;

  const { entryId } = req.body as { entryId?: number };
  if (!entryId || typeof entryId !== "number") {
    res.status(400).json({ error: "entryId is required" });
    return;
  }

  const [entry] = await db.select().from(entries).where(eq(entries.id, entryId));
  if (!entry || entry.ownerId !== req.bizUser!.id) {
    res.status(403).json({ error: "You do not own this listing" });
    return;
  }

  const [subscription] = await db
    .select()
    .from(listingSubscriptions)
    .where(
      and(
        eq(listingSubscriptions.entryId, entryId),
        eq(listingSubscriptions.ownerId, req.bizUser!.id),
        eq(listingSubscriptions.status, "active"),
      ),
    );

  if (!subscription) {
    res.status(404).json({ error: "No active subscription found for this listing" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await db
      .update(listingSubscriptions)
      .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(eq(listingSubscriptions.id, subscription.id));

    res.json({ success: true });
  } catch (err: any) {
    req.log.error(err, "Failed to cancel listing subscription");
    res.status(500).json({ error: err.message || "Cancellation failed" });
  }
});

export default router;
