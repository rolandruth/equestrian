import { getStripeSync, constructStripeEvent, getUncachableStripeClient } from './stripeClient';
import { logger } from './lib/logger';
import { db, entries, listingSubscriptions } from '@workspace/db';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    // Verify signature and apply business-critical side effects (e.g. flipping
    // entries.featured/premium) independently of stripe-replit-sync's data mirroring.
    // A transient failure in the sync below must not block this from running.
    const event = await constructStripeEvent(payload, signature);
    if (!event) {
      throw new Error('Unable to verify Stripe webhook signature (missing webhook secret).');
    }
    await WebhookHandlers.handleBusinessLogic(event);

    try {
      const sync = await getStripeSync();
      await sync.processWebhook(payload, signature);
    } catch (err) {
      logger.error({ err }, 'stripe-replit-sync data sync failed for webhook (business logic already applied)');
    }
  }

  private static async handleBusinessLogic(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await WebhookHandlers.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        return;
      case 'customer.subscription.updated':
        await WebhookHandlers.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        return;
      case 'customer.subscription.deleted':
        await WebhookHandlers.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        return;
      default:
        return;
    }
  }

  private static async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const metadata = session.metadata;
    if (!metadata || metadata.type !== 'listing_plan') return;

    const entryId = Number(metadata.entryId);
    const plan = metadata.plan;
    const ownerId = metadata.ownerId;
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (!entryId || (plan !== 'featured' && plan !== 'premium') || !ownerId || !subscriptionId) return;

    await db
      .update(entries)
      .set(plan === 'featured' ? { featured: true } : { premium: true })
      .where(eq(entries.id, entryId));

    let currentPeriodEnd: Date | null = null;
    try {
      const stripe = await getUncachableStripeClient();
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;
      if (periodEnd) currentPeriodEnd = new Date(periodEnd * 1000);
    } catch (err) {
      logger.error({ err }, 'Failed to retrieve subscription for listing_plan checkout');
    }

    await db
      .insert(listingSubscriptions)
      .values({
        entryId,
        ownerId,
        plan,
        stripeSubscriptionId: subscriptionId,
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodEnd,
      })
      .onConflictDoUpdate({
        target: listingSubscriptions.stripeSubscriptionId,
        set: {
          status: 'active',
          cancelAtPeriodEnd: false,
          currentPeriodEnd,
          updatedAt: new Date(),
        },
      });
  }

  private static async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;
    await db
      .update(listingSubscriptions)
      .set({
        cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
        status: subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : subscription.status,
        updatedAt: new Date(),
      })
      .where(eq(listingSubscriptions.stripeSubscriptionId, subscription.id));
  }

  // Stripe cancels the subscription at period end (or immediately) — this is the
  // point where the featured/premium badge must actually be revoked, not at the
  // moment the owner clicks "Cancel" (cancel_at_period_end just schedules this).
  private static async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const [record] = await db
      .select()
      .from(listingSubscriptions)
      .where(eq(listingSubscriptions.stripeSubscriptionId, subscription.id));
    if (!record) return;

    await db
      .update(listingSubscriptions)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(eq(listingSubscriptions.id, record.id));

    await db
      .update(entries)
      .set(record.plan === 'featured' ? { featured: false } : { premium: false })
      .where(eq(entries.id, record.entryId));
  }
}
