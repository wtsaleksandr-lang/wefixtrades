/**
 * Twilio artefacts — the customer data that lives at Twilio, and how we erase it.
 *
 * ── Why this exists ──
 *
 * `voicemails.recording_url` does not hold a file we store. It holds
 * `https://api.twilio.com/2010-04-01/Accounts/AC…/Recordings/RE…` — a pointer at
 * audio sitting on Twilio's servers, which is the caller's and the customer's
 * *actual recorded voice*. Account deletion used to delete that row and stop
 * there, on the reasoning that a third-party API is out of scope. It is not out
 * of scope: we hold the account credentials, Twilio's REST API deletes
 * Recordings, and this codebase already calls it (`services/twilioNumberRelease`
 * relinquishes numbers the same way). Deleting the row while the voice recording
 * survives is the same defect `PR #2067` removed for buckets — a deletion that
 * erases the pointer and leaves the data, then reports success.
 *
 * ── Attribution: the property that makes this safe ──
 *
 * A Twilio artefact belongs to the *Twilio account*, which is WeFixTrades'. Some
 * of what lives there is another customer's, and some is our own infrastructure.
 * Deleting one of those would be far worse than the bug being fixed here. So
 * attribution is established in three independent layers, and an artefact is
 * only erased when all three agree:
 *
 *   1. **We never enumerate from Twilio's side.** There is no "list this
 *      account's recordings and delete them" path here, and there must never be
 *      one. The only SIDs that ever reach `deleteTwilioArtefact` are values read
 *      out of rows the deletion plan has already scoped to the account being
 *      erased (`user_id = <authenticated user>`, or `client_id IN <that user's
 *      clients>`). Attribution is therefore exactly the attribution the whole
 *      plan already rests on, and `check:account-deletion-scope` proves no
 *      statement in it is unscoped.
 *   2. **The account SID must be ours.** When the stored value is a full Twilio
 *      URL it names the account that owns the resource. `twilioArtefactKey`
 *      requires that account to equal `TWILIO_ACCOUNT_SID`; a URL naming any
 *      other account is not ours to touch, is not collected, and is not counted
 *      as a purge that failed.
 *   3. **The SID shape is exact.** `RE`/`TR`/`SM`/`MM` plus 32 hex digits, and
 *      nothing else — checked again at delete time, after the round-trip through
 *      the receipt. A customer-controlled string can therefore never steer the
 *      DELETE at another resource, another account, or another REST path.
 *
 * Account-level resources are deliberately unreachable from here: phone numbers,
 * Messaging Services, A2P brands and campaigns, TwiML apps, Push Credentials and
 * API keys are WeFixTrades' own infrastructure, shared by every customer.
 * `TwilioResource` cannot name them, so no declaration can ask for one.
 *
 * ── What a Twilio delete does and does not remove ──
 *
 * Nothing cascades except one case, so every artefact is addressed explicitly:
 *   • Deleting a Message DOES delete the media stored with it (Twilio documents
 *     this; the exception is media shared across several messages, and we never
 *     send MMS so we never create one).
 *   • Deleting a Call does NOT delete that call's Recordings, and deleting a
 *     Recording does NOT delete its Transcriptions. Each is named by its own
 *     declaration in `STORED_OBJECTS` rather than assumed to follow.
 *   • A deleted Recording's MEDIA is gone immediately, but Twilio keeps the
 *     recording's metadata (SID, duration, timestamps — not the audio) for a
 *     40-day soft-delete window. That is Twilio's floor, not something we can
 *     shorten, so the deletion copy says the recording is erased rather than
 *     claiming every trace of it vanishes the same second.
 *
 * ── Never during development ──
 *
 * Twilio deletes are irreversible and dev, staging and production all point at
 * the SAME Twilio account, so a deletion run outside production would erase a
 * live customer's recording. `deleteTwilioArtefact` therefore refuses whenever
 * `isTwilioDryRun()` is true — the same switch that already stops a non-production
 * boot from sending a real SMS — and reports the artefact as NOT erased rather
 * than pretending. Reporting an un-erased artefact is the honest outcome; that is
 * what `objects_failed` is for.
 */
import { getTwilioClient, isTwilioDryRun } from "../twilioClient";
import { createLogger } from "./logger";

const log = createLogger("TwilioArtefacts");

/**
 * The Twilio resource types this product creates on a customer's behalf and can
 * therefore be asked to erase.
 *
 * Deliberately NOT a general REST path. Each member is one collection directly
 * under `/2010-04-01/Accounts/{AccountSid}/`, so a key can never address an
 * account-level resource (a phone number, a Messaging Service, an A2P brand, a
 * Push Credential) that belongs to WeFixTrades or is shared with other
 * customers.
 */
export type TwilioResource = "Recordings" | "Transcriptions" | "Messages" | "Calls";

/**
 * Twilio SIDs are a two-letter type prefix plus 32 hex digits. Anchored, so
 * nothing with a path separator, a query string or a traversal segment can pass
 * — the SID is interpolated into a REST path, and this is what makes that safe.
 */
const SID_SHAPE: Record<TwilioResource, RegExp> = {
  Recordings: /^RE[0-9a-f]{32}$/i,
  Transcriptions: /^TR[0-9a-f]{32}$/i,
  // SM is a plain SMS, MM a message with media. Both are Message resources,
  // and deleting the Message deletes the media stored with it.
  Messages: /^(?:SM|MM)[0-9a-f]{32}$/i,
  Calls: /^CA[0-9a-f]{32}$/i,
};

/** Which resource a bare SID belongs to, or null when it is not one of ours. */
function resourceForSid(sid: string): TwilioResource | null {
  for (const resource of Object.keys(SID_SHAPE) as TwilioResource[]) {
    if (SID_SHAPE[resource].test(sid)) return resource;
  }
  return null;
}

/** The canonical form the deletion plan carries around: `Recordings/RE…`. */
export function twilioKey(resource: TwilioResource, sid: string): string {
  return `${resource}/${sid}`;
}

/** The account SID this deployment is configured against, or null. */
function ourAccountSid(): string | null {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  return sid && /^AC[0-9a-f]{32}$/i.test(sid) ? sid : null;
}

/**
 * `https://api.twilio.com/2010-04-01/Accounts/{AC…}/{Collection}/{SID}[.ext]`
 *
 * The `.mp3` / `.json` / `.wav` suffix is Twilio's media-format selector on the
 * same resource, so it is stripped: two rows naming the same recording in
 * different formats must dedupe to one delete, not two.
 */
const TWILIO_URL_PATH =
  /^\/2010-04-01\/Accounts\/(AC[0-9a-f]{32})\/(Recordings|Transcriptions|Messages|Calls)\/([A-Z]{2}[0-9a-f]{32})(?:\.[a-z0-9]{1,8})?$/i;

/**
 * Read one stored value and return the artefact key it addresses, or null when
 * it addresses nothing of ours.
 *
 * Accepts the two forms this codebase actually persists:
 *   • a full `api.twilio.com` REST URL — what Twilio's `RecordingUrl` webhook
 *     parameter delivers and what `voicemails.recording_url` stores verbatim;
 *   • a bare SID — what `sms_messages.twilio_sid` stores.
 *
 * Returns null (never throws, never guesses) for a value that is empty, is not
 * a Twilio identifier at all, is a synthetic `DRYRUN-…` SID minted by the
 * dry-run send path, points at a host other than Twilio, or names a DIFFERENT
 * Twilio account. Null means "not ours" — the caller must read it as "nothing to
 * do", never as "delete failed", so a foreign value can never be reported as an
 * outstanding erasure.
 */
export function twilioArtefactKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  // Bare SID. Attribution comes entirely from the row it was read out of —
  // layer 1 in the header comment — because the value itself names no account.
  const bare = resourceForSid(trimmed);
  if (bare) return twilioKey(bare, trimmed);

  if (!/^https?:\/\//i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  // Twilio's REST host only. A recording proxied through anybody else's domain
  // is not a resource we can address, and must not be treated as one.
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "api.twilio.com") return null;

  const match = TWILIO_URL_PATH.exec(url.pathname);
  if (!match) return null;
  const [, accountSid, collection, sid] = match;

  // Layer 2: the resource must live in OUR account. A URL naming another
  // account is another Twilio customer's data.
  const ours = ourAccountSid();
  if (!ours || accountSid.toLowerCase() !== ours.toLowerCase()) return null;

  // The collection in the path and the SID prefix must agree, so a URL cannot
  // ask us to DELETE a message SID through the Recordings collection.
  const resource = (collection[0].toUpperCase() + collection.slice(1).toLowerCase()) as TwilioResource;
  if (!SID_SHAPE[resource]?.test(sid)) return null;
  return twilioKey(resource, sid);
}

/** Split a canonical key back into its parts, or null when it is malformed. */
export function parseTwilioKey(key: string): { resource: TwilioResource; sid: string } | null {
  const slash = key.indexOf("/");
  if (slash < 0) return null;
  const resource = key.slice(0, slash) as TwilioResource;
  const sid = key.slice(slash + 1);
  if (!SID_SHAPE[resource]) return null;
  if (!SID_SHAPE[resource].test(sid)) return null;
  return { resource, sid };
}

/**
 * Erase one Twilio artefact. Returns true ONLY when the artefact is gone from
 * Twilio — deleted by this call, or already absent.
 *
 * Never throws: a caller mid-way through an account erasure must be able to
 * record the failure and carry on, not abort with rows already deleted. Every
 * false is logged with the SID, and the caller writes it to `audit_log` so the
 * erasure can be finished by hand — without the SID the artefact is
 * unrecoverable, because the row that named it is gone and we deliberately
 * never list Twilio to find it again.
 */
export async function deleteTwilioArtefact(key: string): Promise<boolean> {
  // Layer 3, re-checked here rather than trusted from the caller: the SID is
  // about to be interpolated into a REST path.
  const parsed = parseTwilioKey(key);
  if (!parsed) {
    log.error("refusing to delete a malformed Twilio artefact key", { key });
    return false;
  }
  const { resource, sid } = parsed;

  /* Dev, staging and production share one Twilio account, and a Twilio delete
   * is irreversible — so anywhere we would not send a live message, we do not
   * send a live DELETE either. Reported as not-erased, never as done. */
  if (isTwilioDryRun()) {
    log.error(
      "Twilio artefact NOT erased — dry-run posture. Recorded for manual erasure; " +
        "a delete from a non-production boot would hit the live shared account.",
      { resource, sid },
    );
    return false;
  }

  try {
    const client = getTwilioClient();
    switch (resource) {
      case "Recordings":
        await client.recordings(sid).remove();
        break;
      case "Transcriptions":
        await client.transcriptions(sid).remove();
        break;
      case "Messages":
        // Twilio deletes the media stored with a message when the message
        // goes, so an MMS attachment needs no separate key. Media that Twilio
        // shares across several messages is the documented exception, and we
        // never send MMS, so we never create one.
        await client.messages(sid).remove();
        break;
      case "Calls":
        await client.calls(sid).remove();
        break;
    }
    log.info("erased Twilio artefact", { resource, sid });
    return true;
  } catch (err) {
    const status = (err as { status?: number; statusCode?: number }).status ??
      (err as { statusCode?: number }).statusCode;
    const code = (err as { code?: number }).code;
    /* Already gone. The desired end state is true, so this is a successful,
     * idempotent erasure — same rule as releaseTwilioNumber(). */
    if (status === 404 || code === 20404) {
      log.info("Twilio artefact already absent — treating as erased", { resource, sid, code });
      return true;
    }
    /* 20009 — "cannot delete this resource before it is complete". A call or
     * message Twilio has not finished processing cannot be deleted yet, and
     * finalisation can take up to 14 days. There is nothing to retry inside
     * this request, so it is reported as an outstanding erasure like any other
     * failure: the SID reaches `audit_log` and support finishes it. Recorded
     * distinctly so that queue is separable from a genuine error. */
    if (code === 20009) {
      log.error(
        "Twilio artefact not yet deletable (still finalising) — recorded for retry",
        { resource, sid, code },
      );
      return false;
    }
    log.error(
      "could not erase Twilio artefact — the customer's data is still on Twilio's servers",
      { resource, sid, status, code, err: (err as Error).message },
    );
    return false;
  }
}
