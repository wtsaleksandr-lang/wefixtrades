/**
 * ContentFlow Sprint 19 — SMTP / email smoke test.
 *
 * Sends ONE plain text email to a test inbox via the configured SMTP.
 * Does not touch the email-channel queue logic — purely validates that
 * SMTP credentials produce a real send.
 *
 * Triple-gated:
 *   CONTENTFLOW_REAL_API_SMOKE=1   master
 *   ALLOW_REAL_POSTS=1             required for actual send
 *   DRY_RUN=1                      stops after transporter.verify()
 *
 * Operator-supplied:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (already prod env)
 *   SMOKE_EMAIL_TO    a test inbox you control
 *
 * Usage:
 *   CONTENTFLOW_REAL_API_SMOKE=1 DRY_RUN=1 npx tsx scripts/contentflow-smoke-email.ts
 *   CONTENTFLOW_REAL_API_SMOKE=1 ALLOW_REAL_POSTS=1 npx tsx scripts/contentflow-smoke-email.ts
 */

import { log, err, runSmoke, preflight, isDryRun } from "./lib/smokeReport";

const SCRIPT = "email";

async function main(): Promise<void> {
  const skip = preflight(SCRIPT, { requirePublicPost: true });
  if (skip) {
    const { recordResult } = await import("./lib/smokeReport");
    recordResult(SCRIPT, skip);
    log(SCRIPT, "skipped:", skip.message);
    return;
  }

  await runSmoke(SCRIPT, SCRIPT, async () => {
    if (process.env.EMAIL_TEST_SIMULATE_SUCCESS === "1") {
      return {
        status: "blocked",
        message: "EMAIL_TEST_SIMULATE_SUCCESS=1 is set — this is the dev stub; unset before real-API smoke",
        manual_steps: ["Unset EMAIL_TEST_SIMULATE_SUCCESS in this env."],
      };
    }
    const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) {
      return {
        status: "blocked",
        message: `missing SMTP env: ${missing.join(", ")}`,
        manual_steps: missing.map((m) => `Set ${m}=...`),
      };
    }
    const to = process.env.SMOKE_EMAIL_TO;
    if (!to || !/.+@.+\..+/.test(to)) {
      return {
        status: "blocked",
        message: "missing or invalid SMOKE_EMAIL_TO",
        manual_steps: ["Set SMOKE_EMAIL_TO=<a test inbox you control>."],
      };
    }

    /* Use the project's transporter so we exercise the same code path
     * the email adapter uses. */
    let getEmailTransporter: any;
    try {
      ({ getEmailTransporter } = await import("../server/lib/emailTransport"));
    } catch (e: any) {
      return { status: "failed", message: `failed to load email transporter: ${e?.message || e}` };
    }
    let transporter: any;
    try {
      transporter = await getEmailTransporter();
    } catch (e: any) {
      return { status: "failed", message: `transporter init failed: ${e?.message || e}` };
    }
    if (!transporter) {
      return { status: "failed", message: "transporter is null — SMTP not configured" };
    }

    /* Verify SMTP handshake without sending. */
    log(SCRIPT, `transporter.verify()`);
    try {
      if (typeof transporter.verify === "function") {
        await transporter.verify();
      }
    } catch (e: any) {
      return {
        status: "failed",
        message: `SMTP verify failed: ${e?.message || e}`,
        manual_steps: ["Check SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS values."],
      };
    }

    if (isDryRun()) {
      return {
        status: "ok",
        message: "DRY_RUN: SMTP transporter verified; no email sent",
        details: { smtp_host: process.env.SMTP_HOST, smtp_port: process.env.SMTP_PORT },
      };
    }

    /* Send one plain text email to the test inbox. */
    const subject = `[CF SMOKE] Sprint 19 SMTP smoke ${new Date().toISOString()}`;
    const text = `This is a ContentFlow Sprint 19 smoke test email. Safe to delete.\n\nSent from: ${process.env.SMTP_FROM}\nTimestamp: ${new Date().toISOString()}\n`;
    log(SCRIPT, `sendMail to=${to.replace(/(.{1}).+(@.*)/, "$1***$2")}`);
    let info: any;
    try {
      info = await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject,
        text,
      });
    } catch (e: any) {
      return { status: "failed", message: `sendMail failed: ${e?.message || e}` };
    }
    log(SCRIPT, `sent message_id=${info?.messageId ?? "?"}`);

    return {
      status: "ok",
      message: `email sent to test inbox; message_id=${info?.messageId ?? "?"}`,
      details: {
        message_id: info?.messageId ?? null,
        smtp_host: process.env.SMTP_HOST ?? null,
        smtp_from: process.env.SMTP_FROM ?? null,
      },
      manual_steps: [`Confirm receipt in the test inbox; then delete the email.`],
    };
  });
}

main().catch((e) => {
  err(SCRIPT, "fatal:", e?.message || e);
  process.exit(0);
});
