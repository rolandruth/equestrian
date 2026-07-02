import { getStripeSync, constructStripeEvent } from './stripeClient';
import { logger } from './lib/logger';
import { db, entries } from '@workspace/db';
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
    if (event.type !== 'checkout.session.completed') return;

    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata;
    if (!metadata || metadata.type !== 'listing_plan') return;

    const entryId = Number(metadata.entryId);
    const plan = metadata.plan;
    if (!entryId || (plan !== 'featured' && plan !== 'premium')) return;

    await db
      .update(entries)
      .set(plan === 'featured' ? { featured: true } : { premium: true })
      .where(eq(entries.id, entryId));
  }
}
