import nodemailer, { type Transporter } from "nodemailer";
import { db, directorySettings } from "@workspace/db";
import { logger } from "./logger";

// SMTP config is stored in directorySettings and configured from the admin
// Settings page (not env vars/secrets), so a self-hosted owner can wire up
// their own mail provider without shell/deploy access. If it isn't configured
// yet, sends are skipped with a warning instead of crashing the job or server.
type SmtpConfig = { host: string; port: number; user: string; pass: string; from: string };

let cachedTransport: { config: SmtpConfig; transport: Transporter } | null = null;

async function getTransport(): Promise<Transporter | null> {
  const [settings] = await db.select().from(directorySettings).limit(1);
  const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom } = settings ?? {};

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
    logger.warn(
      "SMTP not configured (Settings > Email) — email reminders will be skipped",
    );
    cachedTransport = null;
    return null;
  }

  const config: SmtpConfig = {
    host: smtpHost,
    port: smtpPort,
    user: smtpUser,
    pass: smtpPass,
    from: smtpFrom || smtpUser,
  };

  // Reuse the transport across sends unless the stored config changed
  // (e.g. an admin just updated it), avoiding a fresh connection per email.
  if (
    cachedTransport &&
    cachedTransport.config.host === config.host &&
    cachedTransport.config.port === config.port &&
    cachedTransport.config.user === config.user &&
    cachedTransport.config.pass === config.pass
  ) {
    return cachedTransport.transport;
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });
  cachedTransport = { config, transport };
  return transport;
}

export async function sendMail(options: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  const result = await sendMailWithResult(options);
  return result.success;
}

// Like sendMail, but surfaces the underlying error message instead of just a
// boolean, so callers (e.g. the SMTP test endpoint) can show admins why a
// send failed instead of a generic failure.
export async function sendMailWithResult(
  options: { to: string; subject: string; html: string; text: string },
): Promise<{ success: boolean; error?: string }> {
  const transport = await getTransport();
  if (!transport || !cachedTransport) {
    return { success: false, error: "SMTP is not configured (Settings > Email)" };
  }

  try {
    await transport.sendMail({
      from: cachedTransport.config.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    return { success: true };
  } catch (err) {
    logger.error({ err, to: options.to }, "Failed to send email");
    const error = err instanceof Error ? err.message : "Unknown error sending email";
    return { success: false, error };
  }
}
