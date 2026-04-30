import { Router } from "express";
import { db } from "@workspace/db";
import { categories, entries } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { eq, count, sql } from "drizzle-orm";

const router = Router();

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

router.get("/", async (req, res) => {
  try {
    const cats = await db.select().from(categories).orderBy(categories.name);
    const counts = await db.select({
      category: entries.category,
      count: count(),
    }).from(entries)
      .where(sql`${entries.category} IS NOT NULL`)
      .groupBy(entries.category);

    const countMap = new Map(counts.map(c => [c.category, Number(c.count)]));

    res.json(cats.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      entryCount: countMap.get(c.name) ?? 0,
      createdAt: c.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list categories" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) { res.status(400).json({ error: "Name is required" }); return; }
    const slug = slugify(name);
    const [cat] = await db.insert(categories).values({ name, slug, description: description ?? null }).returning();
    res.status(201).json({ id: cat.id, name: cat.name, slug: cat.slug, description: cat.description, entryCount: 0, createdAt: cat.createdAt.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create category" });
  }
});

router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) { updates.name = name; updates.slug = slugify(name); }
    if (description !== undefined) updates.description = description;
    const [cat] = await db.update(categories).set(updates).where(eq(categories.id, id)).returning();
    if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
    res.json({ id: cat.id, name: cat.name, slug: cat.slug, description: cat.description, entryCount: 0, createdAt: cat.createdAt.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update category" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(categories).where(eq(categories.id, id));
    res.json({ success: true, message: null });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

export default router;
