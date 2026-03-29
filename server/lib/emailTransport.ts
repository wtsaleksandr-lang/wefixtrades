import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let cached: Transporter | null = null;

/**
 * Returns a shared nodemailer SMTP transporter.
 * Returns null if SMTP env vars are not configured.
 */
export function getEmailTransporter(): Transporter | null {
  if (cached) return cached;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return cached;
}

/** Default "from" address for outbound emails. */
export function getFromAddress(): string {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@wefixtrades.co.uk";
}
