import { Router } from "express";
import { db } from "@workspace/db";
import { directorySettings, users } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth.js";
import { eq } from "drizzle-orm";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { sendMailWithResult } from "../lib/mailer.js";

const router = Router();

function formatSettings(s: typeof directorySettings.$inferSelect) {
  return {
    id: s.id,
    siteTitle: s.siteTitle,
    logoUrl: s.logoUrl,
    homepageHeadline: s.homepageHeadline,
    homepageDescription: s.homepageDescription,
    heroHeadlineColor: s.heroHeadlineColor,
    heroSubtitleColor: s.heroSubtitleColor,
    themeColor: s.themeColor,
    navbarBgColor: s.navbarBgColor,
    navbarTextColor: s.navbarTextColor,
    heroSearchPlaceholder: s.heroSearchPlaceholder,
    heroSearchButtonText: s.heroSearchButtonText,
    heroSearchButtonColor: s.heroSearchButtonColor,
    heroSearchButtonTextColor: s.heroSearchButtonTextColor,
    footerText: s.footerText,
    privacyPolicyUrl: s.privacyPolicyUrl,
    termsUrl: s.termsUrl,
    headScripts: s.headScripts,
    bodyScripts: s.bodyScripts,
    calloutSections: s.calloutSections,
    faviconUrl: s.faviconUrl,
    homepageMetaTitle: s.homepageMetaTitle,
    homepageMetaDescription: s.homepageMetaDescription,
    homepageOgImageUrl: s.homepageOgImageUrl,
    templateSettings: s.templateSettings ?? null,
    installed: s.installed,
    updatedAt: s.updatedAt.toISOString(),
    // Never expose the raw key — return only whether it is set and a masked hint
    geminiApiKeySet: !!s.geminiApiKey,
    geminiApiKeyHint: s.geminiApiKey
      ? `${"•".repeat(Math.max(0, s.geminiApiKey.length - 4))}${s.geminiApiKey.slice(-4)}`
      : null,
    // SMTP config for outbound email (e.g. expiry reminders). Host/port/user/
    // from are not secret so they're returned as-is for editing; the password
    // follows the same set+hint pattern as the Gemini key and is never
    // returned in full.
    smtpHost: s.smtpHost,
    smtpPort: s.smtpPort,
    smtpUser: s.smtpUser,
    smtpFrom: s.smtpFrom,
    smtpPassSet: !!s.smtpPass,
    smtpPassHint: s.smtpPass
      ? `${"•".repeat(Math.max(0, s.smtpPass.length - 4))}${s.smtpPass.slice(-4)}`
      : null,
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
    if (req.body.heroHeadlineColor !== undefined)   dbUpdates.heroHeadlineColor = req.body.heroHeadlineColor;
    if (req.body.heroSubtitleColor !== undefined)   dbUpdates.heroSubtitleColor = req.body.heroSubtitleColor;
    if (req.body.themeColor !== undefined)          dbUpdates.themeColor = req.body.themeColor;
    if (req.body.navbarBgColor !== undefined)           dbUpdates.navbarBgColor = req.body.navbarBgColor;
    if (req.body.navbarTextColor !== undefined)         dbUpdates.navbarTextColor = req.body.navbarTextColor;
    if (req.body.heroSearchPlaceholder !== undefined)       dbUpdates.heroSearchPlaceholder = req.body.heroSearchPlaceholder;
    if (req.body.heroSearchButtonText !== undefined)        dbUpdates.heroSearchButtonText = req.body.heroSearchButtonText;
    if (req.body.heroSearchButtonColor !== undefined)       dbUpdates.heroSearchButtonColor = req.body.heroSearchButtonColor;
    if (req.body.heroSearchButtonTextColor !== undefined)   dbUpdates.heroSearchButtonTextColor = req.body.heroSearchButtonTextColor;
    if (req.body.footerText !== undefined)              dbUpdates.footerText = req.body.footerText;
    if (req.body.privacyPolicyUrl !== undefined)        dbUpdates.privacyPolicyUrl = req.body.privacyPolicyUrl;
    if (req.body.termsUrl !== undefined)                dbUpdates.termsUrl = req.body.termsUrl;
    if (req.body.headScripts !== undefined)             dbUpdates.headScripts = req.body.headScripts;
    if (req.body.bodyScripts !== undefined)             dbUpdates.bodyScripts = req.body.bodyScripts;
    if (req.body.calloutSections !== undefined)             dbUpdates.calloutSections = req.body.calloutSections;
    if (req.body.faviconUrl !== undefined)                  dbUpdates.faviconUrl = req.body.faviconUrl || null;
    if (req.body.homepageMetaTitle !== undefined)           dbUpdates.homepageMetaTitle = req.body.homepageMetaTitle || null;
    if (req.body.homepageMetaDescription !== undefined)     dbUpdates.homepageMetaDescription = req.body.homepageMetaDescription || null;
    if (req.body.homepageOgImageUrl !== undefined)          dbUpdates.homepageOgImageUrl = req.body.homepageOgImageUrl || null;
    if (req.body.templateSettings !== undefined)            dbUpdates.templateSettings = req.body.templateSettings;
    // geminiApiKey: null/empty clears the key; non-empty string stores it
    if (req.body.geminiApiKey !== undefined) {
      dbUpdates.geminiApiKey = req.body.geminiApiKey || null;
    }
    if (req.body.smtpHost !== undefined) dbUpdates.smtpHost = req.body.smtpHost || null;
    if (req.body.smtpPort !== undefined) {
      const port = Number(req.body.smtpPort);
      dbUpdates.smtpPort = req.body.smtpPort === null || req.body.smtpPort === "" || Number.isNaN(port) ? null : port;
    }
    if (req.body.smtpUser !== undefined) dbUpdates.smtpUser = req.body.smtpUser || null;
    if (req.body.smtpFrom !== undefined) dbUpdates.smtpFrom = req.body.smtpFrom || null;
    // smtpPass: null/empty clears it; non-empty string stores it (same pattern as geminiApiKey)
    if (req.body.smtpPass !== undefined) {
      dbUpdates.smtpPass = req.body.smtpPass || null;
    }

    const [updated] = await db.update(directorySettings).set(dbUpdates).where(eq(directorySettings.id, existing.id)).returning();
    res.json(formatSettings(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Basic per-admin throttle so this endpoint can't be hammered to spam an
// inbox or exhaust the configured mail provider's quota.
const lastTestSentAt = new Map<number, number>();
const TEST_EMAIL_COOLDOWN_MS = 30_000;

router.post("/smtp-test", requireAdmin, async (req, res) => {
  try {
    const userId = (req as any).userId as number;
    const now = Date.now();
    const last = lastTestSentAt.get(userId);
    if (last && now - last < TEST_EMAIL_COOLDOWN_MS) {
      res.status(429).json({ error: "Please wait a moment before sending another test email" });
      return;
    }

    const { to } = req.body as { to?: string | null };
    let recipient = typeof to === "string" ? to.trim() : "";
    if (!recipient) {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      recipient = user?.email ?? "";
    }
    if (!recipient || !EMAIL_RE.test(recipient)) {
      res.status(400).json({ error: "A valid recipient email is required" });
      return;
    }

    const [settings] = await db.select().from(directorySettings).limit(1);
    if (!settings?.smtpHost || !settings?.smtpPort || !settings?.smtpUser || !settings?.smtpPass) {
      res.status(400).json({ error: "SMTP is not configured yet — save your settings first" });
      return;
    }

    lastTestSentAt.set(userId, now);

    const siteTitle = settings.siteTitle || "Directory Master";
    const result = await sendMailWithResult({
      to: recipient,
      subject: `${siteTitle}: SMTP test email`,
      text: `This is a test email from ${siteTitle} confirming your SMTP settings are working correctly.`,
      html: `<p>This is a test email from <strong>${siteTitle}</strong> confirming your SMTP settings are working correctly.</p>`,
    });

    if (!result.success) {
      res.status(200).json({ success: false, message: result.error ?? "Failed to send test email" });
      return;
    }
    res.json({ success: true, message: `Test email sent to ${recipient}` });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to send test email" });
  }
});

const ALLOWED_FAVICON_TYPES: Record<string, string> = {
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
};

router.post("/upload-favicon", requireAdmin, async (req, res) => {
  try {
    const { data, contentType } = req.body as { data?: string; contentType?: string };
    if (!data || !contentType) {
      res.status(400).json({ error: "Missing data or contentType" });
      return;
    }
    const ext = ALLOWED_FAVICON_TYPES[contentType] ?? (contentType.startsWith("image/") ? ".png" : null);
    if (!ext) {
      res.status(400).json({ error: "Unsupported image type" });
      return;
    }
    const buffer = Buffer.from(data, "base64");
    if (buffer.length > 2 * 1024 * 1024) {
      res.status(400).json({ error: "Favicon must be under 2 MB" });
      return;
    }
    const publicDir = path.join(process.cwd(), "artifacts", "directory-master", "public");
    await mkdir(publicDir, { recursive: true });
    const filename = `favicon${ext}`;
    await writeFile(path.join(publicDir, filename), buffer);
    res.json({ url: `/${filename}` });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to upload favicon" });
  }
});

const ALLOWED_LOGO_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

router.post("/upload-logo", requireAdmin, async (req, res) => {
  try {
    const { data, contentType } = req.body as { data?: string; contentType?: string };
    if (!data || !contentType) {
      res.status(400).json({ error: "Missing data or contentType" });
      return;
    }
    const ext = ALLOWED_LOGO_TYPES[contentType];
    if (!ext) {
      res.status(400).json({ error: "Unsupported image type" });
      return;
    }
    const MAX_BYTES = 5 * 1024 * 1024;
    const buffer = Buffer.from(data, "base64");
    if (buffer.length > MAX_BYTES) {
      res.status(400).json({ error: "Logo file must be under 5 MB" });
      return;
    }
    const publicDir = path.join(process.cwd(), "artifacts", "directory-master", "public");
    await mkdir(publicDir, { recursive: true });
    const filename = `logo${ext}`;
    await writeFile(path.join(publicDir, filename), buffer);
    res.json({ url: `/${filename}` });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to upload logo" });
  }
});

export default router;
