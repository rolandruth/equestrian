import { Router } from "express";
import { db } from "@workspace/db";
import { directorySettings } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth.js";
import { eq } from "drizzle-orm";

const router = Router();

function formatSettings(s: typeof directorySettings.$inferSelect) {
  return {
    id: s.id,
    siteTitle: s.siteTitle,
    logoUrl: s.logoUrl,
    homepageHeadline: s.homepageHeadline,
    homepageDescription: s.homepageDescription,
    themeColor: s.themeColor,
    calloutSections: s.calloutSections,
    installed: s.installed,
    updatedAt: s.updatedAt.toISOString(),
  };
}

router.get("/", requireAdmin, async (req, res) => {
  try {
    const [settings] = await db.select().from(directorySettings).limit(1);
    if (!settings) { res.status(404).json({ error: "Settings not found" }); return; }
    res.json(formatSettings(settings));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get settings" });
  }
});

router.patch("/", requireAdmin, async (req, res) => {
  try {
    const [existing] = await db.select().from(directorySettings).limit(1);
    if (!existing) { res.status(404).json({ error: "Settings not found" }); return; }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const allowed = ["siteTitle", "logoUrl", "homepageHeadline", "homepageDescription", "themeColor", "calloutSections"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key === "siteTitle" ? "siteTitle" : key] = req.body[key];
    }

    const dbUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (req.body.siteTitle !== undefined) dbUpdates.siteTitle = req.body.siteTitle;
    if (req.body.logoUrl !== undefined) dbUpdates.logoUrl = req.body.logoUrl;
    if (req.body.homepageHeadline !== undefined) dbUpdates.homepageHeadline = req.body.homepageHeadline;
    if (req.body.homepageDescription !== undefined) dbUpdates.homepageDescription = req.body.homepageDescription;
    if (req.body.themeColor !== undefined) dbUpdates.themeColor = req.body.themeColor;
    if (req.body.calloutSections !== undefined) dbUpdates.calloutSections = req.body.calloutSections;

    const [updated] = await db.update(directorySettings).set(dbUpdates).where(eq(directorySettings.id, existing.id)).returning();
    res.json(formatSettings(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
