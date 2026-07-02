import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Last time this user successfully triggered the SMTP test-email endpoint.
  // Persisted (rather than kept in an in-memory Map) so the per-admin
  // cooldown is enforced consistently across server restarts and across
  // multiple API server instances if the app is ever scaled horizontally.
  smtpTestLastSentAt: timestamp("smtp_test_last_sent_at", { withTimezone: true }),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
