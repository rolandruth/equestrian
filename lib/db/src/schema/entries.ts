import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const entries = pgTable("entries", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category"),
  summary: text("summary"),
  description: text("description"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  website: text("website"),
  location: text("location"),
  tags: text("tags"),
  moreDetails: text("more_details"),
  sourceCsvRow: text("source_csv_row"),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertEntrySchema = createInsertSchema(entries).omit({ id: true, createdAt: true, updatedAt: true });
export type Entry = typeof entries.$inferSelect;
export type InsertEntry = z.infer<typeof insertEntrySchema>;
