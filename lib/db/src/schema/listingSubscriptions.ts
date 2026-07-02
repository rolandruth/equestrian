import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

// Tracks the Stripe subscription backing a "featured"/"premium" listing upgrade,
// so we know who owns it, whether it's set to cancel at period end, and when
// the current billing period actually expires (for the webhook-driven revert).
export const listingSubscriptions = pgTable("listing_subscriptions", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").notNull(),
  ownerId: text("owner_id").notNull(),
  plan: text("plan").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  status: text("status").notNull().default("active"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  // Set once the "your badge is about to lapse" email has been sent for the
  // *current* cancellation, so the reminder job never re-sends it on every
  // run. Reset back to null whenever cancelAtPeriodEnd flips back to false
  // (owner resubscribes/uncancels), so a future cancellation gets its own reminder.
  expiryReminderSentAt: timestamp("expiry_reminder_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ListingSubscription = typeof listingSubscriptions.$inferSelect;
