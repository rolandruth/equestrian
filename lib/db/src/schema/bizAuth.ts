import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

// Business-owner authentication (Replit Auth / OIDC), kept fully separate from
// the staff admin/editor/viewer tables ("users" / "sessions") to avoid any
// name or ID-space collisions between the two auth systems.
export const bizUsers = pgTable("biz_users", {
  id: text("id").primaryKey(),
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bizSessions = pgTable("biz_sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
});

export type BizUser = typeof bizUsers.$inferSelect;
