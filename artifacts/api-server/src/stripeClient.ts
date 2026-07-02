import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';
import { pool, db, bizUsers } from '@workspace/db';
import { eq } from 'drizzle-orm';

type StripeCredentials = { secretKey: string; webhookSecret?: string };

// A single checkout can fan out into a dozen+ near-simultaneous webhook events
// (charge, invoice, customer, subscription, payment_intent, checkout.session, ...),
// each of which used to call the connector API independently and could trip its
// rate limit (429). Cache credentials in-process for a short TTL to absorb bursts.
let credentialsCache: { value: StripeCredentials; expiresAt: number } | null = null;
let inFlightFetch: Promise<StripeCredentials> | null = null;
const CREDENTIALS_TTL_MS = 5 * 60 * 1000;

async function fetchStripeCredentials(): Promise<StripeCredentials> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      'Missing Replit environment variables. ' +
      'Ensure the Stripe integration is connected via the Integrations tab.'
    );
  }

  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const resp = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
      {
        headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (resp.ok) {
      const data = await resp.json() as {
        items?: Array<{
          settings?: { secret?: string; webhook_secret?: string };
          webhook_config?: { secret?: string; signing_secret?: string } | null;
        }>
      };
      const item = data.items?.[0];
      const settings = item?.settings;

      if (!settings?.secret) {
        throw new Error(
          'Stripe integration not connected or missing secret key. ' +
          'Connect Stripe via the Integrations tab first.'
        );
      }

      return {
        secretKey: settings.secret,
        webhookSecret:
          settings.webhook_secret ??
          item?.webhook_config?.secret ??
          item?.webhook_config?.signing_secret ??
          process.env.STRIPE_WEBHOOK_SECRET,
      };
    }

    lastErr = new Error(`Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`);
    if (resp.status === 429 && attempt < maxAttempts) {
      const retryAfterHeader = resp.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
      const backoffMs = Number.isFinite(retryAfterMs) ? retryAfterMs : 500 * attempt;
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }
    break;
  }
  throw lastErr;
}

async function getStripeCredentials(): Promise<StripeCredentials> {
  const now = Date.now();
  if (credentialsCache && credentialsCache.expiresAt > now) {
    return credentialsCache.value;
  }
  if (inFlightFetch) {
    return inFlightFetch;
  }
  inFlightFetch = fetchStripeCredentials()
    .then((value) => {
      credentialsCache = { value, expiresAt: Date.now() + CREDENTIALS_TTL_MS };
      return value;
    })
    .finally(() => {
      inFlightFetch = null;
    });
  return inFlightFetch;
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

// Every owner should have exactly one Stripe Customer backing all of their
// checkouts, so their invoice history and payment method live in one place
// and the billing-portal session shows everything they've ever purchased.
export async function getOrCreateBizCustomerId(bizUserId: string): Promise<string> {
  const [bizUser] = await db.select().from(bizUsers).where(eq(bizUsers.id, bizUserId));
  if (!bizUser) {
    throw new Error('Business user not found');
  }
  if (bizUser.stripeCustomerId) {
    return bizUser.stripeCustomerId;
  }

  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create({
    email: bizUser.email ?? undefined,
    name: [bizUser.firstName, bizUser.lastName].filter(Boolean).join(' ') || undefined,
    metadata: { bizUserId },
  });

  await db
    .update(bizUsers)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(bizUsers.id, bizUserId));

  return customer.id;
}

async function getManagedWebhookSecret(): Promise<string | undefined> {
  try {
    const result = await pool.query(
      `SELECT secret FROM "stripe"."_managed_webhooks" ORDER BY created DESC LIMIT 1`
    );
    return result.rows[0]?.secret as string | undefined;
  } catch {
    return undefined;
  }
}

export async function constructStripeEvent(payload: Buffer, signature: string): Promise<Stripe.Event | null> {
  const { secretKey, webhookSecret } = await getStripeCredentials();
  const resolvedSecret = webhookSecret ?? (await getManagedWebhookSecret());
  if (!resolvedSecret) return null;
  const stripe = new Stripe(secretKey);
  return stripe.webhooks.constructEvent(payload, signature, resolvedSecret);
}

export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? '',
  });
}
