import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";

export const ads = pgTable("ads", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  advertiser: text("advertiser"),
  imageUrl: text("image_url").notNull(),
  linkUrl: text("link_url").notNull(),
  placement: text("placement").notNull().default("sidebar"),
  active: boolean("active").notNull().default(false),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
