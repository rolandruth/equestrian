import { db, listingSubscriptions, entries, bizUsers } from "@workspace/db";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendMail } from "../lib/mailer";

// How far ahead of expiration we start warning owners by email. Kept in sync
// with the in-app dashboard banner's EXPIRY_WARNING_WINDOW_DAYS.
const REMINDER_WINDOW_DAYS = 7;

const PLAN_LABELS: Record<string, string> = {
  featured: "Featured",
  premium: "Premium",
};

function formatExpiryDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// Sends a "your badge is about to lapse" email to owners whose canceled
// subscription is expiring within the reminder window and haven't already
// been emailed for this cancellation. Safe to run repeatedly (e.g. on an
// interval) — each row is only emailed once per cancellation via
// expiryReminderSentAt.
export async function runExpiryReminderJob(): Promise<{ checked: number; sent: number }> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await db
    .select({
      subscriptionId: listingSubscriptions.id,
      plan: listingSubscriptions.plan,
      currentPeriodEnd: listingSubscriptions.currentPeriodEnd,
      entryTitle: entries.title,
      ownerEmail: bizUsers.email,
    })
    .from(listingSubscriptions)
    .innerJoin(entries, eq(entries.id, listingSubscriptions.entryId))
    .innerJoin(bizUsers, eq(bizUsers.id, listingSubscriptions.ownerId))
    .where(
      and(
        eq(listingSubscriptions.cancelAtPeriodEnd, true),
        eq(listingSubscriptions.status, "active"),
        isNull(listingSubscriptions.expiryReminderSentAt),
        gte(listingSubscriptions.currentPeriodEnd, now),
        lte(listingSubscriptions.currentPeriodEnd, windowEnd),
      ),
    );

  let sent = 0;
  for (const row of candidates) {
    if (!row.ownerEmail || !row.currentPeriodEnd) continue;

    const planLabel = PLAN_LABELS[row.plan] ?? row.plan;
    const expiryDate = formatExpiryDate(row.currentPeriodEnd);

    const delivered = await sendMail({
      to: row.ownerEmail,
      subject: `Your ${planLabel} badge for "${row.entryTitle}" is expiring soon`,
      text:
        `Your ${planLabel} plan for "${row.entryTitle}" is set to cancel and will expire on ${expiryDate}. ` +
        `After that date, the ${planLabel} badge will be removed from your listing. ` +
        `If this was a mistake, you can resubscribe any time from your business dashboard.`,
      html:
        `<p>Your <strong>${planLabel}</strong> plan for <strong>${row.entryTitle}</strong> is set to cancel and will expire on <strong>${expiryDate}</strong>.</p>` +
        `<p>After that date, the ${planLabel} badge will be removed from your listing.</p>` +
        `<p>If this was a mistake, you can resubscribe any time from your business dashboard.</p>`,
    });

    // Only mark as reminded once delivery actually succeeds, so a transient
    // SMTP outage results in a retry on the next run instead of silently
    // skipping the owner's reminder for this cancellation.
    if (delivered) {
      await db
        .update(listingSubscriptions)
        .set({ expiryReminderSentAt: new Date() })
        .where(eq(listingSubscriptions.id, row.subscriptionId));
      sent++;
    }
  }

  if (candidates.length > 0) {
    logger.info({ checked: candidates.length, sent }, "Expiry reminder job run complete");
  }

  return { checked: candidates.length, sent };
}
