import { pgTable, serial, integer, text, smallint, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").notNull(),
  reviewerName: text("reviewer_name").notNull(),
  reviewerEmail: text("reviewer_email"),
  rating: smallint("rating").notNull(),
  body: text("body"),
  isApproved: boolean("is_approved").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertReviewSchema = createInsertSchema(reviews).omit({ id: true, createdAt: true });
export type Review = typeof reviews.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;
