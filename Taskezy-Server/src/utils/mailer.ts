import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";

// Outgoing email through Google Workspace SMTP (SMTP_* in env.ts). Used for
// login OTP codes. Switched off — isEmailEnabled() false — until both
// SMTP_USER and SMTP_PASS are set.

let transport: Transporter | null = null;

export function isEmailEnabled(): boolean {
  return Boolean(env.SMTP_USER && env.SMTP_PASS);
}

function getTransport(): Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465, // 465 = TLS from the start; 587 upgrades via STARTTLS
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
    });
  }
  return transport;
}

export async function sendEmail(to: string, subject: string, text: string, html: string): Promise<void> {
  if (!isEmailEnabled()) throw new Error("Email sending is not configured (SMTP_USER / SMTP_PASS)");
  await getTransport().sendMail({ from: `"Taskezy" <${env.SMTP_USER}>`, to, subject, text, html });
}
