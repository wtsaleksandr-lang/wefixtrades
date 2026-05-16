/**
 * Parses the assistant's service-recommendation block out of a chat
 * message. The assistant appends, at the very end of its reply:
 *
 *   <<<RECOMMEND>>>
 *   {"services":["tradeline","rankflow"]}
 *   <<<END_RECOMMEND>>>
 *
 * The chat UI strips the block from the visible text and renders a
 * product card per service id instead.
 */

const BLOCK_RE = /<<<RECOMMEND>>>([\s\S]*?)<<<END_RECOMMEND>>>/;
const OPEN_TAG = "<<<RECOMMEND>>>";

export interface ParsedRecommendations {
  /** Message text with the recommendation block removed. */
  cleanText: string;
  /** Service ids the assistant recommended (empty if none / still streaming). */
  serviceIds: string[];
}

export function parseRecommendations(text: string): ParsedRecommendations {
  const match = text.match(BLOCK_RE);
  if (match) {
    let serviceIds: string[] = [];
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed?.services)) {
        serviceIds = parsed.services.filter((s: unknown): s is string => typeof s === "string");
      }
    } catch {
      /* malformed block — show no cards rather than crash */
    }
    return { cleanText: text.replace(BLOCK_RE, "").trim(), serviceIds };
  }
  // A partial block still streaming in — hide everything from the opener
  // onward so half-written JSON never flashes on screen.
  const openIdx = text.indexOf(OPEN_TAG);
  if (openIdx !== -1) {
    return { cleanText: text.slice(0, openIdx).trim(), serviceIds: [] };
  }
  return { cleanText: text, serviceIds: [] };
}

/**
 * Service ids don't always equal their product-page slug. Map the
 * exceptions; everything else uses the id as-is.
 */
const SLUG_OVERRIDES: Record<string, string> = {
  "mapguard-setup": "mapguard",
  "mapguard-ongoing": "mapguard",
  quotequick: "quickquotepro",
};

export function productSlugForService(serviceId: string): string {
  return SLUG_OVERRIDES[serviceId] ?? serviceId;
}
