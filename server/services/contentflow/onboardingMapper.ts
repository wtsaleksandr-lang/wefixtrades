/**
 * ContentFlow onboarding → brand-profile mapper.
 *
 * Wave W-AZ-1. The post-checkout ContentFlow templates ask only the four
 * vital questions (website / industries / tone / ready-to-connect). This
 * file translates those raw responses into the BrandProfile shape stored
 * at clients.metadata.content_brand so the customer never has to repeat
 * themselves when they later land on the deeper /portal/content-preferences
 * wizard.
 *
 * Idempotent at the call-site: pass the existing profile in via
 * mergeContentFlowOnboarding and only non-empty new values overwrite —
 * existing values from the deeper wizard are preserved if the customer
 * happened to fill that out first.
 */
import type { BrandProfile, Tone } from "./brandProfile";

/* Shape of an onboarding_submissions.responses entry. The portal save
 * handler wraps each answer as { value, completed_at } per FIELD. */
type OnboardingResponseMap = Record<string, { value: unknown; completed_at?: string }> | Record<string, unknown>;

/* Helpers — duck-type the per-field wrapper since PortalOnboarding stores
 * the answers wrapped, but admin-side or migrated rows may store raw. */
function readField(responses: OnboardingResponseMap, key: string): unknown {
  const slot = (responses as Record<string, any>)[key];
  if (slot && typeof slot === "object" && "value" in slot) return slot.value;
  return slot;
}

function toCleanString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/* Split the multi-line / comma-separated industries answer into an array.
 * The four-question template uses free-text (one per line) because the
 * generic PortalOnboarding renderer doesn't have a chips control. */
function splitList(input: string): string[] {
  return input
    .split(/[\n,]+/g)
    .map((s) => s.replace(/^\s*(?:other\s*:\s*)?/i, "").trim())
    .filter((s) => s.length > 0)
    .slice(0, 20);
}

function normalizeTone(input: string): Tone | null {
  const lower = input.trim().toLowerCase();
  /* Map the questionnaire's four labels to the BrandProfile tone enum.
   * "Authoritative" doesn't exist in the enum — fold it into "premium"
   * (the closest of the four canonical tones). */
  if (lower.startsWith("professional")) return "professional";
  if (lower.startsWith("friendly")) return "friendly";
  if (lower.startsWith("authoritative")) return "premium";
  if (lower.startsWith("casual")) return "casual";
  /* Already-canonical values pass through. */
  if (lower === "premium") return "premium";
  return null;
}

/**
 * Translate the four ContentFlow quick-setup answers into the BrandProfile
 * subset they correspond to. Returns only the keys with non-empty new
 * values so a downstream merge can safely spread without clobbering.
 */
export function mapContentFlowOnboardingToBrandProfile(
  responses: OnboardingResponseMap | null | undefined,
): Partial<BrandProfile> {
  if (!responses || typeof responses !== "object") return {};

  const out: Partial<BrandProfile> = {};

  /* Q3 — tone → BrandProfile.tone */
  const tone = toCleanString(readField(responses, "voice_tone"));
  if (tone) {
    const t = normalizeTone(tone);
    if (t) out.tone = t;
  }

  /* Q2 — industries → BrandProfile.service_focus AND .preferred_topics.
   * service_focus is the "what the business does" tag list consumed by
   * image prompts; preferred_topics is the "what to write about" list
   * consumed by article generation. The four-Q form collapses both into
   * a single answer — we mirror it to both fields and the deeper wizard
   * can later disambiguate. */
  const industriesRaw = toCleanString(readField(responses, "content_industries"));
  if (industriesRaw) {
    const items = splitList(industriesRaw);
    if (items.length > 0) {
      out.service_focus = items;
      out.preferred_topics = items;
    }
  }

  /* Q1 — primary website URL. Not part of BrandProfile (handled at the
   * client.contact_url level / brand-profile wizard step 5+). We do NOT
   * map it here — it's persisted on the onboarding_submission itself for
   * downstream consumers (rankflow planner, social adapters). */

  /* Q4 — ready_to_connect_socials is a routing signal, not a brand-profile
   * field. The portal route reads it directly to decide whether to send
   * the customer to the deeper wizard or schedule the reminder. */

  return out;
}

/**
 * Merge non-empty new values into an existing BrandProfile. Existing
 * values win when the new patch value is empty/missing — that keeps the
 * mapper idempotent when the deeper wizard has already populated fields.
 */
export function mergeContentFlowOnboarding(
  existing: Partial<BrandProfile>,
  patch: Partial<BrandProfile>,
): Partial<BrandProfile> {
  const merged: Partial<BrandProfile> = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    /* Don't overwrite an existing non-empty value from the deeper wizard. */
    const cur = (existing as Record<string, unknown>)[key];
    const curIsEmpty =
      cur === undefined ||
      cur === null ||
      (Array.isArray(cur) && cur.length === 0) ||
      (typeof cur === "string" && cur.trim().length === 0);
    if (curIsEmpty) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

/**
 * Read the "ready to connect socials now?" answer. Returns true if the
 * customer wants to proceed straight to the deeper wizard, false if they
 * want a reminder later. Defaults to true (open-wizard) so the customer
 * always sees the next step rather than disappearing into the inbox.
 */
export function shouldRouteToDeeperWizard(
  responses: OnboardingResponseMap | null | undefined,
): boolean {
  if (!responses) return true;
  const ans = toCleanString(readField(responses, "ready_to_connect_socials"));
  if (!ans) return true;
  const lower = ans.toLowerCase();
  if (lower.startsWith("no")) return false;
  if (lower.includes("remind")) return false;
  if (lower.includes("later")) return false;
  return true;
}

/**
 * Extract the primary website URL so the caller can persist it onto the
 * client record (clients.contact_url is the canonical field). Returns
 * null if the answer is missing or doesn't pass a permissive URL sanity
 * check — strict scheme/host validation lives in the brand-profile
 * sanitizer, this just gates the write.
 */
export function extractPrimaryWebsiteUrl(
  responses: OnboardingResponseMap | null | undefined,
): string | null {
  if (!responses) return null;
  const raw = toCleanString(readField(responses, "primary_website_url"));
  if (!raw) return null;
  /* Be lenient — allow bare domains; the brand-profile sanitizer is
   * stricter for the metadata column. */
  const looksUrlish = /^(?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+/i.test(raw);
  return looksUrlish ? raw : null;
}
