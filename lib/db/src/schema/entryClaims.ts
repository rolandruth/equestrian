import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

// Claim requests from business owners for directory listings. A claim only
// assigns entries.ownerId once it is approved — either automatically (the
// business account's email matches the listing's contact email) or manually
// by an admin from the claims review queue.
export const entryClaims = pgTable("entry_claims", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").notNull(),
  bizUserId: text("biz_user_id").notNull(),
  // pending | approved | rejected | revoked
  status: text("status").notNull().default("pending"),
  // How the claim was approved: "email_match" (automatic) or "admin".
  approvedVia: text("approved_via"),
  // Staff user id that decided (approve/reject/revoke), null for automatic.
  decidedBy: integer("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EntryClaim = typeof entryClaims.$inferSelect;
