import app from "./app";
import { logger } from "./lib/logger";
import { getSetupToken } from "./lib/setupToken.js";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient.js";
import { runExpiryReminderJob } from "./jobs/expiryReminderJob.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set — skipping Stripe init");
    return;
  }
  try {
    await runMigrations({ databaseUrl, schema: "stripe" });
    const stripeSync = await getStripeSync();
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    stripeSync.syncBackfill().catch((err) => logger.error({ err }, "Stripe backfill error"));
    logger.info("Stripe initialized");
  } catch (err) {
    logger.warn({ err }, "Stripe init failed — payments unavailable");
  }
}

// There is no external cron/scheduled-task infrastructure in this project, so
// the expiry reminder job runs as an in-process interval: once shortly after
// boot, then on a fixed cadence. This is sufficient for a single-instance
// deployment; a multi-instance deployment would need a real job scheduler
// (or a leader-election guard) to avoid duplicate sends.
const EXPIRY_REMINDER_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

function scheduleExpiryReminderJob() {
  runExpiryReminderJob().catch((err) => logger.error({ err }, "Expiry reminder job failed"));
  setInterval(() => {
    runExpiryReminderJob().catch((err) => logger.error({ err }, "Expiry reminder job failed"));
  }, EXPIRY_REMINDER_INTERVAL_MS);
}

await initStripe();
scheduleExpiryReminderJob();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const setupToken = getSetupToken();
  if (setupToken) {
    logger.warn(
      { setupToken },
      "=== SETUP TOKEN (required to complete first-run setup — keep this secret) ===",
    );
  }
});
