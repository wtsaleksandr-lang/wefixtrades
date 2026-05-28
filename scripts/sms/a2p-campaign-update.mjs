#!/usr/bin/env node
/**
 * Wave 89 — Twilio A2P 10DLC campaign update (one-shot, Doppler-run).
 *
 * Updates the WeFixTrades A2P 10DLC campaign with the canonical field values
 * required to clear TCR review. The Message Flow / Call-to-Action field is
 * the primary rejection driver from prior submissions, so this script ships
 * the verified-good copy alongside the supporting description, sample
 * messages, opt-in/opt-out/help keywords, and auto-reply text.
 *
 * The script is conservative by default: with no flag it lists campaigns
 * under the brand. Writes require an explicit --apply.
 *
 * Required env (read from process.env, populated by Doppler):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_BRAND_REGISTRATION_SID    — must already be APPROVED
 *   TWILIO_LINKED_MESSAGING_SERVICE  — the Messaging Service SID
 *
 * Optional env:
 *   TWILIO_CAMPAIGN_SID              — if set + still valid, script PATCHes it.
 *                                       Otherwise discovers / creates.
 *
 * Flags:
 *   --list                  List all A2P 10DLC campaigns under the brand
 *                           (default action if no other flag given).
 *   --dry-run               Show field values that WOULD be sent. No writes.
 *   --apply                 Actually apply changes. Requires that --dry-run
 *                           was shown first OR --force is passed.
 *   --force                 Skip the "you must dry-run first" guard.
 *   --resubmit              For an existing campaign, calling update()
 *                           with new fields is what triggers TCR re-review.
 *                           When combined with --apply this is implicit;
 *                           the flag exists to make intent explicit in logs
 *                           and to force the update path even if no field
 *                           values differ from current.
 *   --update-doppler        Print the `doppler secrets set` command for the
 *                           new SID after a create.
 *
 * Usage:
 *   # 1. List current campaigns
 *   doppler run --project wefixtrades --config prd -- \
 *     node scripts/sms/a2p-campaign-update.mjs --list
 *
 *   # 2. Dry-run to see what will happen
 *   doppler run --project wefixtrades --config prd -- \
 *     node scripts/sms/a2p-campaign-update.mjs --dry-run
 *
 *   # 3. Apply + resubmit
 *   doppler run --project wefixtrades --config prd -- \
 *     node scripts/sms/a2p-campaign-update.mjs --apply --resubmit
 *
 *   # 4. If a new SID was created, update Doppler
 *   doppler secrets set --project wefixtrades --config prd \
 *     TWILIO_CAMPAIGN_SID=CMXXXXXXXXXXXXXX
 *
 * Exit codes:
 *   0 — success (incl. dry-run / list)
 *   1 — validation failure (missing env, bad flags, refused safety guard)
 *   2 — Twilio API failure
 *
 * Twilio SDK limitations discovered (SDK 5.x):
 *   - update() does NOT accept usAppToPersonUsecase, optIn*, optOut*, help*,
 *     or subscriberOptIn. Only: description, messageFlow, messageSamples,
 *     hasEmbeddedLinks, hasEmbeddedPhone, ageGated, directLending.
 *   - There is no dedicated "resubmit" REST endpoint for A2P 10DLC (unlike
 *     tollfreeVerification). For existing campaigns, calling update() with
 *     new field values is what triggers TCR re-review. For campaigns that
 *     are fully REJECTED and can't be patched, this script falls back to
 *     remove() + create() — which DOES allow setting all fields.
 */

import twilio from "twilio";

// ---------- field values (the "source of truth" for this campaign) ----------

const CAMPAIGN_DESCRIPTION =
  "WeFixTrades, operated by MR HOLDINGS & TRADE LLC, is a SaaS platform " +
  "that provides quote calculators, AI receptionist services, and customer " +
  "notification infrastructure for trade businesses (plumbers, electricians, " +
  "HVAC, roofers, cleaners). SMS messages are sent to homeowners and " +
  "businesses on behalf of trade companies, including: appointment " +
  "confirmations and reminders, quote-ready notifications, deposit " +
  "receipts, post-service feedback requests, missed-call acknowledgments, " +
  "and account-related transactional alerts. Promotional SMS messages " +
  "require a separate, explicit opt-in collected through a distinct " +
  "checkbox during account onboarding.";

const MESSAGE_FLOW =
  "End users opt-in to receive SMS messages from WeFixTrades through " +
  "multiple touchpoints:\n\n" +
  "(1) Submitting a quote request through a WeFixTrades-powered calculator " +
  "widget embedded on a trade business's website. The opt-in checkbox is " +
  "adjacent to the phone number field and includes the text: \"I agree to " +
  "receive SMS appointment confirmations, reminders, and quote updates " +
  "from [Business Name]. Msg & data rates may apply. Msg frequency varies. " +
  "Reply STOP to unsubscribe, HELP for help.\"\n\n" +
  "(2) Subscribing to recurring service notifications when booking an " +
  "appointment through the WeFixTrades booking widget. The opt-in is " +
  "captured via a clearly-labeled checkbox preceding the booking " +
  "confirmation step.\n\n" +
  "(3) Texting the keyword START to a WeFixTrades-managed business number " +
  "after a prior STOP request.\n\n" +
  "The complete SMS consent disclosure — including identification of the " +
  "sender, description of messages users will receive, message frequency, " +
  "opt-out instructions (STOP), help instructions (HELP), and standard " +
  "\"Msg & data rates may apply\" language — is publicly available at:\n\n" +
  "https://wefixtrades.com/sms-consent-disclosure\n\n" +
  "WeFixTrades provides SMS infrastructure on behalf of small trade " +
  "businesses. End users are customers of these trade businesses and " +
  "have explicitly requested service from them. All messages identify " +
  "the originating trade business by name.";

const MESSAGE_SAMPLES = [
  "Hi John, thanks for contacting WeFixTrades. Your quote request has been received. We will contact you shortly. Reply STOP to opt out.",
  "Your website audit is ready: https://wefixtrades.com/report",
  "Reminder: Your consultation with WeFixTrades is tomorrow at 2 PM. Reply C to confirm, R to reschedule.",
  "Thanks for contacting WeFixTrades support. We will reply shortly.",
  "Your TradeLine appointment is confirmed for Tuesday at 10:00 AM. Reply C to confirm, R to reschedule, or STOP to unsubscribe.",
];

const USE_CASE_PRIMARY = "CUSTOMER_CARE";
const USE_CASE_FALLBACK = "MIXED";

const HAS_EMBEDDED_LINKS = true;
const HAS_EMBEDDED_PHONE = false;

const OPT_IN_KEYWORDS = ["START", "SUBSCRIBE", "JOIN"];
const OPT_OUT_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"];
const HELP_KEYWORDS = ["HELP", "INFO"];

const OPT_IN_MESSAGE =
  "WeFixTrades: You are subscribed to receive updates, quotes, reminders, " +
  "and offers. Msg frequency varies. Msg & data rates may apply. Reply " +
  "HELP for help, STOP to opt out.";

const OPT_OUT_MESSAGE =
  "You have successfully been unsubscribed. You will not receive any more " +
  "messages from this number. Reply START to resubscribe.";

const HELP_MESSAGE =
  "WeFixTrades SMS support: Reply STOP to unsubscribe. Msg & data rates " +
  "may apply. Help: support@wefixtrades.com";

// ---------- helpers ----------

const COLOURLESS = process.env.NO_COLOR === "1" || !process.stdout.isTTY;
const c = {
  dim: (s) => (COLOURLESS ? s : `\x1b[2m${s}\x1b[0m`),
  red: (s) => (COLOURLESS ? s : `\x1b[31m${s}\x1b[0m`),
  green: (s) => (COLOURLESS ? s : `\x1b[32m${s}\x1b[0m`),
  yellow: (s) => (COLOURLESS ? s : `\x1b[33m${s}\x1b[0m`),
  cyan: (s) => (COLOURLESS ? s : `\x1b[36m${s}\x1b[0m`),
  bold: (s) => (COLOURLESS ? s : `\x1b[1m${s}\x1b[0m`),
};

function log(line) {
  console.log(`[a2p-campaign-update] ${line}`);
}

function err(line) {
  console.error(`[a2p-campaign-update] ${c.red(line)}`);
}

function parseFlags(argv) {
  const flags = {
    list: false,
    dryRun: false,
    apply: false,
    force: false,
    resubmit: false,
    updateDoppler: false,
    help: false,
  };
  for (const a of argv) {
    switch (a) {
      case "--list":
        flags.list = true;
        break;
      case "--dry-run":
        flags.dryRun = true;
        break;
      case "--apply":
        flags.apply = true;
        break;
      case "--force":
        flags.force = true;
        break;
      case "--resubmit":
        flags.resubmit = true;
        break;
      case "--update-doppler":
        flags.updateDoppler = true;
        break;
      case "-h":
      case "--help":
        flags.help = true;
        break;
      default:
        if (a.startsWith("--")) {
          err(`Unknown flag: ${a}`);
          process.exit(1);
        }
    }
  }
  // Default action: list.
  if (!flags.list && !flags.dryRun && !flags.apply && !flags.help) {
    flags.list = true;
  }
  return flags;
}

function printHelp() {
  console.log(`Usage: node scripts/sms/a2p-campaign-update.mjs [flags]

  --list             List all A2P 10DLC campaigns under the brand (default).
  --dry-run          Show what would be sent. No writes.
  --apply            Apply changes. Requires --dry-run shown first, or --force.
  --force            Skip the dry-run-first guard.
  --resubmit         Force update() to fire even if no fields differ
                     (Twilio re-runs TCR review on any update).
  --update-doppler   After a create, print the doppler-set command.
  -h, --help         Show this help.
`);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    err(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v.trim();
}

function tagSid(sid) {
  if (!sid) return "(none)";
  return `${sid.slice(0, 4)}...${sid.slice(-4)}`;
}

function shortField(v, max = 80) {
  if (v == null) return "(null)";
  if (Array.isArray(v)) return `[${v.length} item(s)] ${v.join(", ").slice(0, max)}`;
  const s = String(v).replace(/\s+/g, " ");
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}

function diffFields(current, desired) {
  const changes = [];
  for (const k of Object.keys(desired)) {
    const cur = current?.[k];
    const des = desired[k];
    const same = JSON.stringify(cur) === JSON.stringify(des);
    if (!same) changes.push({ field: k, from: cur, to: des });
  }
  return changes;
}

function twilioErrorDetail(e) {
  if (!e) return "(no error)";
  const code = e.code ?? e.status ?? "?";
  const more = e.moreInfo ? ` ${e.moreInfo}` : "";
  const details = e.details ? ` details=${JSON.stringify(e.details)}` : "";
  return `Twilio error code=${code} ${e.message ?? ""}${more}${details}`;
}

// ---------- main ----------

async function main() {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.help) {
    printHelp();
    return 0;
  }

  // Env validation up front (even for --list, since we need to talk to Twilio).
  const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");
  const brandSid = requireEnv("TWILIO_BRAND_REGISTRATION_SID");
  const messagingServiceSid = requireEnv("TWILIO_LINKED_MESSAGING_SERVICE");
  const configuredCampaignSid = process.env.TWILIO_CAMPAIGN_SID?.trim() || "";

  if (flags.apply && !flags.dryRun && !flags.force) {
    err("Refusing to --apply without --dry-run shown first. Re-run with --dry-run, review, then --apply. To override, pass --force.");
    return 1;
  }

  log(`account     = ${tagSid(accountSid)}`);
  log(`brand       = ${tagSid(brandSid)}`);
  log(`msg service = ${tagSid(messagingServiceSid)}`);
  log(`campaign    = ${configuredCampaignSid ? tagSid(configuredCampaignSid) : "(not set in env)"}`);
  log("");

  const client = twilio(accountSid, authToken);

  // List campaigns under the messaging service (these are scoped per service).
  let campaigns;
  try {
    campaigns = await client.messaging.v1
      .services(messagingServiceSid)
      .usAppToPerson.list({ limit: 100 });
  } catch (e) {
    err(`Failed to list campaigns: ${twilioErrorDetail(e)}`);
    return 2;
  }

  log(c.bold(`Found ${campaigns.length} campaign(s) under messaging service ${tagSid(messagingServiceSid)}.`));
  for (const camp of campaigns) {
    const brandTag = camp.brandRegistrationSid === brandSid ? "" : c.yellow(" (DIFFERENT BRAND!)");
    log(
      `  - sid=${camp.sid} status=${c.cyan(camp.campaignStatus ?? "?")} usecase=${camp.usAppToPersonUsecase} ` +
      `brand=${tagSid(camp.brandRegistrationSid)}${brandTag} mock=${camp.mock} ` +
      `created=${camp.dateCreated?.toISOString?.() ?? camp.dateCreated}`,
    );
    if (Array.isArray(camp.errors) && camp.errors.length) {
      for (const e of camp.errors) {
        log(`      ${c.red("error:")} ${typeof e === "string" ? e : JSON.stringify(e)}`);
      }
    }
  }
  log("");

  if (flags.list && !flags.dryRun && !flags.apply) {
    log("List-only mode. Pass --dry-run to preview an update, or --apply to write.");
    return 0;
  }

  // Decide target campaign.
  // Priority:
  //   1. Configured TWILIO_CAMPAIGN_SID, if found in list and status != REJECTED/DELETED
  //   2. Any campaign in DRAFT / FAILED state under the brand (will PATCH)
  //   3. Otherwise: CREATE NEW
  const findBySid = (sid) => campaigns.find((c) => c.sid === sid);
  const isPatchable = (status) => {
    const s = (status ?? "").toUpperCase();
    return s !== "DELETED" && s !== "FAILED" && s !== "REJECTED";
  };

  let target = null;
  let mode = "CREATE";

  if (configuredCampaignSid) {
    const found = findBySid(configuredCampaignSid);
    if (found && isPatchable(found.campaignStatus)) {
      target = found;
      mode = "PATCH";
    } else if (found) {
      log(c.yellow(`Configured TWILIO_CAMPAIGN_SID=${configuredCampaignSid} found but status=${found.campaignStatus} — not patchable. Will recreate.`));
      mode = "RECREATE";
      target = found;
    } else {
      log(c.yellow(`Configured TWILIO_CAMPAIGN_SID=${configuredCampaignSid} not found under this messaging service. Will look for alternates.`));
    }
  }

  if (!target) {
    const draft = campaigns.find((c) => /^DRAFT|FAILED$/i.test(c.campaignStatus ?? ""));
    if (draft && isPatchable(draft.campaignStatus)) {
      target = draft;
      mode = "PATCH";
    } else if (draft) {
      target = draft;
      mode = "RECREATE";
    }
  }

  // The Twilio SDK update() endpoint accepts only a SUBSET of fields.
  // Fields ONLY available on create:
  //   usAppToPersonUsecase, optIn*, optOut*, help*, subscriberOptIn
  const updateFields = {
    description: CAMPAIGN_DESCRIPTION,
    messageFlow: MESSAGE_FLOW,
    messageSamples: MESSAGE_SAMPLES,
    hasEmbeddedLinks: HAS_EMBEDDED_LINKS,
    hasEmbeddedPhone: HAS_EMBEDDED_PHONE,
    ageGated: false,
    directLending: false,
  };

  const createFields = {
    brandRegistrationSid: brandSid,
    description: CAMPAIGN_DESCRIPTION,
    messageFlow: MESSAGE_FLOW,
    messageSamples: MESSAGE_SAMPLES,
    usAppToPersonUsecase: USE_CASE_PRIMARY,
    hasEmbeddedLinks: HAS_EMBEDDED_LINKS,
    hasEmbeddedPhone: HAS_EMBEDDED_PHONE,
    optInMessage: OPT_IN_MESSAGE,
    optOutMessage: OPT_OUT_MESSAGE,
    helpMessage: HELP_MESSAGE,
    optInKeywords: OPT_IN_KEYWORDS,
    optOutKeywords: OPT_OUT_KEYWORDS,
    helpKeywords: HELP_KEYWORDS,
    subscriberOptIn: true,
    ageGated: false,
    directLending: false,
  };

  log(c.bold(`Mode: ${mode}`));
  if (target) {
    log(`Target SID: ${target.sid} (status=${target.campaignStatus}, usecase=${target.usAppToPersonUsecase})`);
  } else {
    log("Target SID: WILL CREATE NEW");
  }
  log("");

  // Print field plan.
  log(c.bold("Field plan:"));
  if (mode === "PATCH" && target) {
    const diff = diffFields(target, updateFields);
    if (diff.length === 0) {
      log(c.dim("  (no field differences detected vs current campaign)"));
      if (!flags.resubmit) {
        log("");
        log(c.yellow("Nothing to update. Pass --resubmit to force an update() call (Twilio re-runs review on any update)."));
      }
    } else {
      for (const { field, from, to } of diff) {
        log(`  ${c.yellow(field)}:`);
        log(`    ${c.dim("from:")} ${shortField(from)}`);
        log(`    ${c.dim("to:  ")} ${shortField(to)}`);
      }
    }
    log("");
    log(c.dim("Note: SDK update() does not accept use case, opt-in/opt-out/help keywords or messages. Those are CREATE-only."));
    log(c.dim(`Current: usecase=${target.usAppToPersonUsecase}, opt-in kws=${JSON.stringify(target.optInKeywords)}`));
    if (target.usAppToPersonUsecase !== USE_CASE_PRIMARY && target.usAppToPersonUsecase !== USE_CASE_FALLBACK) {
      log(c.yellow(`  WARNING: current use case ${target.usAppToPersonUsecase} != desired ${USE_CASE_PRIMARY}. Use case can only be changed by recreating.`));
    }
  } else {
    for (const [k, v] of Object.entries(createFields)) {
      log(`  ${c.yellow(k)}: ${shortField(v)}`);
    }
  }
  log("");

  if (flags.dryRun && !flags.apply) {
    log(c.green("Dry run complete. No API writes performed."));
    log("Re-run with --apply to write.");
    return 0;
  }

  if (!flags.apply) {
    log("No --apply flag — exiting without writes.");
    return 0;
  }

  // ---------- WRITE PATH ----------

  if (mode === "PATCH" && target) {
    const diff = diffFields(target, updateFields);
    if (diff.length === 0 && !flags.resubmit) {
      log(c.yellow("No field changes and --resubmit not set. Skipping update() — nothing to do."));
      return 0;
    }
    log(c.bold(`Patching campaign ${target.sid} ...`));
    try {
      const updated = await client.messaging.v1
        .services(messagingServiceSid)
        .usAppToPerson(target.sid)
        .update(updateFields);
      log(c.green(`Updated. SID=${updated.sid} status=${updated.campaignStatus}`));
      if (Array.isArray(updated.errors) && updated.errors.length) {
        log(c.yellow("Campaign-level errors (from Twilio):"));
        for (const e of updated.errors) {
          log(`  - ${typeof e === "string" ? e : JSON.stringify(e)}`);
        }
      }
      log("");
      log("Twilio re-runs TCR review automatically on any update. Watch console.twilio.com for status changes.");
      return 0;
    } catch (e) {
      err(`PATCH failed: ${twilioErrorDetail(e)}`);
      return 2;
    }
  }

  if (mode === "RECREATE" && target) {
    log(c.bold(`Recreating: removing FAILED/REJECTED campaign ${target.sid} first ...`));
    try {
      await client.messaging.v1
        .services(messagingServiceSid)
        .usAppToPerson(target.sid)
        .remove();
      log(c.green(`Removed ${target.sid}.`));
    } catch (e) {
      err(`REMOVE failed: ${twilioErrorDetail(e)}`);
      err("Cannot recreate while old campaign exists. Aborting.");
      return 2;
    }
    // Fall through to create.
  }

  // CREATE path (mode === "CREATE" or post-RECREATE).
  log(c.bold("Creating new A2P 10DLC campaign ..."));
  let created;
  try {
    created = await client.messaging.v1
      .services(messagingServiceSid)
      .usAppToPerson.create(createFields);
  } catch (e) {
    // If CUSTOMER_CARE is rejected, retry with MIXED.
    const msg = twilioErrorDetail(e);
    if (msg.includes(USE_CASE_PRIMARY) || /usecase/i.test(msg)) {
      log(c.yellow(`Create with usecase=${USE_CASE_PRIMARY} failed (${msg}). Retrying with ${USE_CASE_FALLBACK}.`));
      try {
        created = await client.messaging.v1
          .services(messagingServiceSid)
          .usAppToPerson.create({ ...createFields, usAppToPersonUsecase: USE_CASE_FALLBACK });
      } catch (e2) {
        err(`CREATE retry failed: ${twilioErrorDetail(e2)}`);
        return 2;
      }
    } else {
      err(`CREATE failed: ${msg}`);
      return 2;
    }
  }

  log(c.green(`Created. SID=${created.sid} status=${created.campaignStatus} usecase=${created.usAppToPersonUsecase}`));
  if (Array.isArray(created.errors) && created.errors.length) {
    log(c.yellow("Campaign-level errors (from Twilio):"));
    for (const e of created.errors) {
      log(`  - ${typeof e === "string" ? e : JSON.stringify(e)}`);
    }
  }
  log("");
  log(c.bold("NEXT STEPS:"));
  log(`  1. Update Doppler with the new campaign SID:`);
  log(`       doppler secrets set --project wefixtrades --config prd TWILIO_CAMPAIGN_SID=${created.sid}`);
  log(`  2. Watch console.twilio.com for the TCR review outcome.`);
  log(`  3. Once VERIFIED, outbound SMS will route through this campaign.`);

  if (flags.updateDoppler) {
    log("");
    log(c.cyan(`doppler secrets set --project wefixtrades --config prd TWILIO_CAMPAIGN_SID=${created.sid}`));
  }

  return 0;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((e) => {
    err(`FATAL: ${e?.stack ?? String(e)}`);
    process.exit(2);
  });
