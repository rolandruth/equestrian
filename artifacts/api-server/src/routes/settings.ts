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
    navbarBgColor: s.navbarBgColor,
    navbarTextColor: s.navbarTextColor,
    heroSearchPlaceholder: s.heroSearchPlaceholder,
    heroSearchButtonText: s.heroSearchButtonText,
    footerText: s.footerText,
    privacyPolicyUrl: s.privacyPolicyUrl,
    termsUrl: s.termsUrl,
    calloutSections: s.calloutSections,
    templateSettings: s.templateSettings ?? null,
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

    const dbUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (req.body.siteTitle !== undefined)           dbUpdates.siteTitle = req.body.siteTitle;
    if (req.body.logoUrl !== undefined)             dbUpdates.logoUrl = req.body.logoUrl;
    if (req.body.homepageHeadline !== undefined)    dbUpdates.homepageHeadline = req.body.homepageHeadline;
    if (req.body.homepageDescription !== undefined) dbUpdates.homepageDescription = req.body.homepageDescription;
    if (req.body.themeColor !== undefined)          dbUpdates.themeColor = req.body.themeColor;
    if (req.body.navbarBgColor !== undefined)           dbUpdates.navbarBgColor = req.body.navbarBgColor;
    if (req.body.navbarTextColor !== undefined)         dbUpdates.navbarTextColor = req.body.navbarTextColor;
    if (req.body.heroSearchPlaceholder !== undefined)   dbUpdates.heroSearchPlaceholder = req.body.heroSearchPlaceholder;
    if (req.body.heroSearchButtonText !== undefined)    dbUpdates.heroSearchButtonText = req.body.heroSearchButtonText;
    if (req.body.footerText !== undefined)              dbUpdates.footerText = req.body.footerText;
    if (req.body.privacyPolicyUrl !== undefined)        dbUpdates.privacyPolicyUrl = req.body.privacyPolicyUrl;
    if (req.body.termsUrl !== undefined)                dbUpdates.termsUrl = req.body.termsUrl;
    if (req.body.calloutSections !== undefined)         dbUpdates.calloutSections = req.body.calloutSections;
    if (req.body.templateSettings !== undefined)    dbUpdates.templateSettings = req.body.templateSettings;

    const [updated] = await db.update(directorySettings).set(dbUpdates).where(eq(directorySettings.id, existing.id)).returning();
    res.json(formatSettings(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
