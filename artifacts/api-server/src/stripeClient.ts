import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';
import { pool } from '@workspace/db';

async function getStripeCredentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
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

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`);
  }

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

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
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
