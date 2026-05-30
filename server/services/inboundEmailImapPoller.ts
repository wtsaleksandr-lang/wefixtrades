/**
 * IONOS IMAP inbound-email poller.
 *
 * Polls one or more IONOS mailboxes (e.g. support@, sales@) over IMAP, pulls
 * UNSEEN messages, and feeds each into the shared ingestion pipeline
 * (ingestInboundEmail → support ticket → AI concierge). Replies are sent by
 * the existing SMTP path; this module only READS.
 *
 * Non-disruptive by design: it reads a copy and marks the message \Seen — it
 * never deletes or moves your mail. Disabled unless INBOUND_IMAP_ENABLED=true,
 * so it's inert until credentials are provisioned and the flag is flipped.
 *
 * Configuration (Doppler):
 *   INBOUND_IMAP_ENABLED = "true"            — master switch (default off)
 *   INBOUND_IMAP_ACCOUNTS = "support,sales"  — comma list of account prefixes
 *   IONOS_IMAP_HOST = "imap.ionos.com"       — default host for all accounts
 *   IONOS_IMAP_PORT = "993"                  — default port (TLS)
 *   For each prefix P (upper-cased):
 *     IMAP_<P>_USER, IMAP_<P>_PASS           — mailbox login (required)
 *     IMAP_<P>_HOST, IMAP_<P>_PORT           — optional per-account overrides
 *
 * Example: support@ → IMAP_SUPPORT_USER="support@wefixtrades.com",
 *          IMAP_SUPPORT_PASS="…". sales@ → IMAP_SALES_USER / IMAP_SALES_PASS.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createLogger } from "../lib/logger";
import { ingestInboundEmail } from "./inboundEmailIngest";

const log = createLogger("InboundImapPoller");

const DEFAULT_HOST = "imap.ionos.com";
const DEFAULT_PORT = 993;
const MAX_SUBJECT = 300;
const MAX_CONTENT = 12000;
/** Don't fetch an unbounded backlog in one tick. */
const MAX_PER_ACCOUNT_PER_TICK = 25;

interface ImapAccount {
  label: string;
  host: string;
  port: number;
  user: string;
  pass: string;
}

export function imapPollingEnabled(): boolean {
  return process.env.INBOUND_IMAP_ENABLED === "true";
}

/** Resolve the configured accounts from env. Skips any with missing creds. */
function resolveAccounts(): ImapAccount[] {
  const prefixes = (process.env.INBOUND_IMAP_ACCOUNTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const host = process.env.IONOS_IMAP_HOST?.trim() || DEFAULT_HOST;
  const port = Number(process.env.IONOS_IMAP_PORT) || DEFAULT_PORT;

  const accounts: ImapAccount[] = [];
  for (const prefix of prefixes) {
    const P = prefix.toUpperCase();
    const user = process.env[`IMAP_${P}_USER`]?.trim();
    const pass = process.env[`IMAP_${P}_PASS`];
    if (!user || !pass) {
      log.warn("imap account skipped — missing credentials", { account: prefix });
      continue;
    }
    accounts.push({
      label: prefix,
      host: process.env[`IMAP_${P}_HOST`]?.trim() || host,
      port: Number(process.env[`IMAP_${P}_PORT`]) || port,
      user,
      pass,
    });
  }
  return accounts;
}

/** Poll a single mailbox. Returns the count of messages ingested. */
async function pollAccount(acct: ImapAccount): Promise<number> {
  const client = new ImapFlow({
    host: acct.host,
    port: acct.port,
    secure: true,
    auth: { user: acct.user, pass: acct.pass },
    logger: false,
  });

  let ingested = 0;
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    let processed = 0;
    for await (const msg of client.fetch({ seen: false }, { source: true, uid: true })) {
      if (processed >= MAX_PER_ACCOUNT_PER_TICK) break;
      processed++;
      try {
        const parsed = await simpleParser(msg.source as Buffer);
        const senderEmail =
          parsed.from?.value?.[0]?.address?.toLowerCase()?.trim() || null;
        const subject = (parsed.subject || "(no subject)").slice(0, MAX_SUBJECT).trim() || "(no subject)";
        const bodyText =
          (parsed.text && parsed.text.trim())
            ? parsed.text
            : (typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, " ") : "");
        const content = bodyText.replace(/\s+\n/g, "\n").trim().slice(0, MAX_CONTENT)
          || "(no readable text in this email)";
        const messageId = parsed.messageId?.trim() || null;

        const result = await ingestInboundEmail({ senderEmail, subject, content, messageId });
        if (!result.duplicate) ingested++;

        // Mark \Seen only after a successful ingest so a crash mid-batch leaves
        // the message to be retried next tick (dedup guards against doubles).
        await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
      } catch (perMsgErr: any) {
        // One malformed email must not abort the batch. Leave it UNSEEN so a
        // transient parse/DB error gets retried; a permanently bad message will
        // re-surface in logs each tick (visible, not silently dropped).
        log.error("imap message ingest failed", {
          account: acct.label,
          uid: msg.uid,
          error: perMsgErr?.message?.slice(0, 300),
        });
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => { /* best-effort close */ });
  }
  return ingested;
}

/**
 * Poll every configured mailbox once. Safe to call on a cron tick. Accounts are
 * polled sequentially (small N, keeps connection count low). Per-account errors
 * are logged and isolated so one dead mailbox can't block the others.
 */
export async function pollInboundImap(): Promise<{ accounts: number; ingested: number }> {
  if (!imapPollingEnabled()) return { accounts: 0, ingested: 0 };
  const accounts = resolveAccounts();
  if (accounts.length === 0) {
    log.warn("imap polling enabled but no accounts configured");
    return { accounts: 0, ingested: 0 };
  }
  let ingested = 0;
  for (const acct of accounts) {
    try {
      ingested += await pollAccount(acct);
    } catch (err: any) {
      log.error("imap account poll failed", { account: acct.label, error: err?.message?.slice(0, 300) });
    }
  }
  if (ingested > 0) log.info("imap poll complete", { accounts: accounts.length, ingested });
  return { accounts: accounts.length, ingested };
}
