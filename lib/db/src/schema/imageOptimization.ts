import {
  pgTable,
  serial,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const imageOptimizationJobs = pgTable(
  "image_optimization_jobs",
  {
    jobId: text("job_id").primaryKey(),
    snapshot: text("snapshot").notNull(),
    status: text("status").notNull().default("pending"),
    totalEntries: integer("total_entries").notNull(),
    totalImages: integer("total_images").notNull(),
    processedImages: integer("processed_images").notNull().default(0),
    optimizedImages: integer("optimized_images").notNull().default(0),
    removedImages: integer("removed_images").notNull().default(0),
    skippedImages: integer("skipped_images").notNull().default(0),
    failedImages: integer("failed_images").notNull().default(0),
    remainingImages: integer("remaining_images"),
    message: text("message").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("image_optimization_jobs_status_idx").on(t.status, t.createdAt),
  ],
);

export const imageOptimizationItems = pgTable(
  "image_optimization_items",
  {
    id: serial("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => imageOptimizationJobs.jobId, { onDelete: "cascade" }),
    entryId: integer("entry_id").notNull(),
    entryTitle: text("entry_title").notNull(),
    targets: jsonb("targets").notNull(),
    imageCount: integer("image_count").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    optimizedCount: integer("optimized_count").notNull().default(0),
    removedCount: integer("removed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("image_optimization_items_job_entry_idx").on(t.jobId, t.entryId),
    index("image_optimization_items_queue_idx").on(t.status, t.updatedAt),
    index("image_optimization_items_job_idx").on(t.jobId),
  ],
);