import { Router } from "express";
import { db } from "@workspace/db";
import { ads } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { eq, sql } from "drizzle-orm";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

function findWorkspaceRoot(start: string): string {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  return start;
}
const WORKSPACE_ROOT = findWorkspaceRoot(process.cwd());

const router = Router();

const ALLOWED_AD_IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

// --- Admin routes ---

router.get("/", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(ads).orderBy(ads.createdAt);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list ads" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const { title, advertiser, imageUrl, linkUrl, placement, active, startsAt, endsAt } = req.body as {
      title?: string;
      advertiser?: string;
      imageUrl?: string;
      linkUrl?: string;
      placement?: string;
      active?: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
    };
    if (!title || !imageUrl || !linkUrl || !placement) {
      res.status(400).json({ error: "title, imageUrl, linkUrl, and placement are required" });
      return;
    }
    const [row] = await db.insert(ads).values({
      title,
      advertiser: advertiser ?? null,
      imageUrl,
      linkUrl,
      placement,
      active: active ?? false,
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create ad" });
  }
});

router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { title, advertiser, imageUrl, linkUrl, placement, active, startsAt, endsAt } = req.body as {
      title?: string;
      advertiser?: string;
      imageUrl?: string;
      linkUrl?: string;
      placement?: string;
      active?: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
    };
    const [row] = await db.update(ads).set({
      ...(title !== undefined && { title }),
      ...(advertiser !== undefined && { advertiser }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(linkUrl !== undefined && { linkUrl }),
      ...(placement !== undefined && { placement }),
      ...(active !== undefined && { active }),
      ...(startsAt !== undefined && { startsAt: startsAt ? new Date(startsAt) : null }),
      ...(endsAt !== undefined && { endsAt: endsAt ? new Date(endsAt) : null }),
      updatedAt: new Date(),
    }).where(eq(ads.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Ad not found" }); return; }
    res.json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update ad" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(ads).where(eq(ads.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete ad" });
  }
});

router.post("/upload-image", requireAdmin, async (req, res) => {
  try {
    const { data, contentType } = req.body as { data?: string; contentType?: string };
    if (!data || !contentType) {
      res.status(400).json({ error: "Missing data or contentType" });
      return;
    }
    const ext = ALLOWED_AD_IMAGE_TYPES[contentType];
    if (!ext) {
      res.status(400).json({ error: "Unsupported image type. Use PNG, JPG, GIF, or WebP." });
      return;
    }
    const buffer = Buffer.from(data, "base64");
    if (buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({ error: "Ad image must be under 5 MB" });
      return;
    }
    const publicDir = path.join(WORKSPACE_ROOT, "artifacts", "directory-master", "public", "ads");
    await mkdir(publicDir, { recursive: true });
    const filename = `ad-${Date.now()}${ext}`;
    await writeFile(path.join(publicDir, filename), buffer);
    res.json({ url: `/ads/${filename}` });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to upload ad image" });
  }
});

// --- Public routes ---

router.get("/public", async (req, res) => {
  try {
    const placement = (req.query.placement as string) || "sidebar";
    const now = new Date();
    const rows = await db.select().from(ads).where(
      sql`${ads.active} = true AND ${ads.placement} = ${placement}
          AND (${ads.startsAt} IS NULL OR ${ads.startsAt} <= ${now})
          AND (${ads.endsAt} IS NULL OR ${ads.endsAt} >= ${now})`
    );
    if (rows.length === 0) { res.json(null); return; }
    // Pick a random active ad for this placement
    const ad = rows[Math.floor(Math.random() * rows.length)];
    // Track impression
    await db.update(ads).set({ impressions: sql`${ads.impressions} + 1` }).where(eq(ads.id, ad.id));
    res.json(ad);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch ad" });
  }
});

router.post("/public/:id/click", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.update(ads).set({ clicks: sql`${ads.clicks} + 1` }).where(eq(ads.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to track click" });
  }
});

export default router;
