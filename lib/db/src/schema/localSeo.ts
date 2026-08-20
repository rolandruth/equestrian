import {
  pgTable,
  serial,
  text,
  integer,
  real,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { entries } from "./entries";

// ─── Normalized location fields on entries (additive columns) ────────────────
// These are stored as separate columns on the entries table via schema extension.
// The actual ALTER TABLE is handled by Drizzle push.
export const entryLocations = pgTable(
  "entry_locations",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    cityName: text("city_name"),
    citySlug: text("city_slug"),
    stateName: text("state_name"),
    stateSlug: text("state_slug"),
    postalCode: text("postal_code"),
    // status: confirmed | manual_review | rejected
    locationStatus: text("location_status").notNull().default("manual_review"),
    // source: import | deterministic | manual
    locationSource: text("location_source"),
    // confidence: 0.0–1.0
    locationConfidence: real("location_confidence"),
    // reviewer/audit fields
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("entry_locations_entry_id_idx").on(t.entryId),
    index("entry_locations_city_slug_idx").on(t.citySlug),
    index("entry_locations_state_slug_idx").on(t.stateSlug),
    index("entry_locations_status_idx").on(t.locationStatus),
  ],
);

// ─── Controlled service type taxonomy ────────────────────────────────────────
export const serviceTypes = pgTable(
  "service_types",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    label: text("label").notNull(),
    description: text("description"),
    parentSlug: text("parent_slug"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("service_types_slug_idx").on(t.slug)],
);

// ─── Entry ↔ service-type join table (many-to-many) ──────────────────────────
export const entryServiceTypes = pgTable(
  "entry_service_types",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    serviceTypeId: integer("service_type_id")
      .notNull()
      .references(() => serviceTypes.id, { onDelete: "cascade" }),
    // status: confirmed | manual_review | rejected
    status: text("status").notNull().default("manual_review"),
    // source: import | deterministic | manual
    source: text("source"),
    // confidence: 0.0–1.0
    confidence: real("confidence"),
    // reviewer/audit fields
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("entry_service_types_unique_idx").on(t.entryId, t.serviceTypeId),
    index("entry_service_types_entry_id_idx").on(t.entryId),
    index("entry_service_types_service_id_idx").on(t.serviceTypeId),
    index("entry_service_types_status_idx").on(t.status),
  ],
);

// ─── Insert schemas and types ─────────────────────────────────────────────────
export const insertEntryLocationSchema = createInsertSchema(entryLocations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type EntryLocation = typeof entryLocations.$inferSelect;
export type InsertEntryLocation = z.infer<typeof insertEntryLocationSchema>;

export const insertServiceTypeSchema = createInsertSchema(serviceTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ServiceType = typeof serviceTypes.$inferSelect;
export type InsertServiceType = z.infer<typeof insertServiceTypeSchema>;

export const insertEntryServiceTypeSchema = createInsertSchema(entryServiceTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type EntryServiceType = typeof entryServiceTypes.$inferSelect;
export type InsertEntryServiceType = z.infer<typeof insertEntryServiceTypeSchema>;
