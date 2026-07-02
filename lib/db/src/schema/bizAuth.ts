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
  // Stripe Customer backing this owner's billing — created lazily on first
  // checkout, then reused for every subsequent checkout and for the
  // customer-portal session so all their subscriptions/invoices live under
  // one Stripe Customer.
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bizSessions = pgTable("biz_sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
});

export type BizUser = typeof bizUsers.$inferSelect;
