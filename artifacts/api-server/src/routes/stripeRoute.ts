import { Router } from "express";
import { getUncachableStripeClient } from "../stripeClient.js";
import { db, entries } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

const AD_PLACEMENTS = [
  { key: "homepage",     label: "Homepage Banner",               price: 9900  },
  { key: "sidebar",      label: "Browse Sidebar",                price: 7900  },
  { key: "browse_inline",label: "Browse — Between Listings",     price: 8900  },
  { key: "entry_page",   label: "Entry Detail Page",             price: 4900  },
  { key: "bundle",       label: "Directory Sponsor Bundle (All 4)", price: 24900 },
];

const LISTING_PLANS: Record<string, { label: string; price: number }> = {
  featured: { label: "Featured Listing", price: 3900 },
  premium:  { label: "Premium Listing",  price: 15000 },
};

router.post("/checkout", async (req, res) => {
  try {
    const { placement } = req.body as { placement: string };

    const item = AD_PLACEMENTS.find((p) => p.key === placement);
    if (!item) {
      res.status(400).json({ error: "Invalid placement" });
      return;
    }

    const stripe = await getUncachableStripeClient();

    const origin = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: item.price,
            recurring: { interval: "month" },
            product_data: {
              name: `SaddleUpGuide Ad — ${item.label}`,
              description: `Monthly advertising placement: ${item.label}`,
            },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${origin}/advertise?success=1&placement=${placement}`,
      cancel_url:  `${origin}/advertise?canceled=1`,
      metadata: { placement },
    });

    res.json({ url: session.url });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message || "Checkout failed" });
  }
});

router.post("/checkout-plan", async (req, res) => {
  try {
    const { entryId, plan } = req.body as { entryId: number; plan: string };

    const item = LISTING_PLANS[plan];
    if (!item) {
      res.status(400).json({ error: "Invalid plan" });
      return;
    }
    if (!entryId || typeof entryId !== "number") {
      res.status(400).json({ error: "entryId is required" });
      return;
    }

    const [entry] = await db.select().from(entries).where(eq(entries.id, entryId));
    if (!entry || !entry.published) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const origin = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: item.price,
            recurring: { interval: "month" },
            product_data: {
              name: `SaddleUpGuide — ${item.label}`,
              description: `${item.label} upgrade for "${entry.title}"`,
            },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${origin}/listing-plans?success=1&plan=${plan}&entry=${encodeURIComponent(entry.title)}`,
      cancel_url:  `${origin}/listing-plans?canceled=1`,
      metadata: { type: "listing_plan", entryId: String(entryId), plan },
    });

    res.json({ url: session.url });
  } catch (err: any) {
    req.log.error(err);
    res.status(500).json({ error: err.message || "Checkout failed" });
  }
});

export default router;
