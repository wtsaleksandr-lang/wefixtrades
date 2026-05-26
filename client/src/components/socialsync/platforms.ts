/**
 * Wave 25 — SocialSync platform metadata.
 *
 * Single source of truth for platform identity (label, dot color, posting
 * format hints) consumed by:
 *   - PlatformPreview.tsx (live previews)
 *   - PlatformGauge.tsx (engagement gauges)
 *   - SocialSyncDashboard.tsx (channel picker, calendar entry colors, KPI tiles)
 *
 * The 4 platforms here are the surfaces SocialSync supports today — Facebook,
 * Instagram, LinkedIn, and WhatsApp Business. Per competitive research only
 * Hootsuite publishes to WhatsApp (gated to upper tiers), so it's promoted
 * to first-class status alongside FB/IG/LinkedIn in our UI.
 *
 * Color tokens are CSS rgb() forms — no raw hex per the design-system rule
 * surfaced by check:hardcoded-colors. The values match each platform's brand
 * dot but they live in a single file so a future redesign swaps once.
 *
 * Note: the server still accepts the legacy "google_business" platform key
 * for backward compatibility, but the new dashboard surfaces only the four
 * "social" platforms listed below. The legacy GBP surface lives in
 * PortalSocialSync.tsx and is not duplicated here.
 */

export type SocialPlatformId =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "whatsapp";

export interface SocialPlatformDef {
  id: SocialPlatformId;
  label: string;
  /** rgb() string used for the channel dot in calendar entries + gauges. */
  color: string;
  /** Engagement-rate target threshold (0..100) — see PlatformGauge. null = N/A. */
  engagementTargetPct: number | null;
  /** Gauge metric label — varies for WhatsApp (no impressions). */
  metricLabel: string;
  /** Long-form moat tooltip for the channel picker tile. */
  moatTooltip?: string;
}

export const PLATFORMS: readonly SocialPlatformDef[] = [
  {
    id: "facebook",
    label: "Facebook",
    color: "rgb(24, 119, 242)",
    engagementTargetPct: 3,
    metricLabel: "Engagement rate",
  },
  {
    id: "instagram",
    label: "Instagram",
    color: "rgb(225, 48, 108)",
    engagementTargetPct: 4,
    metricLabel: "Engagement rate",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    color: "rgb(10, 102, 194)",
    engagementTargetPct: 2,
    metricLabel: "Engagement rate",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    color: "rgb(37, 211, 102)",
    engagementTargetPct: null,
    metricLabel: "Direct reach",
    moatTooltip:
      "WhatsApp Business — direct customer messaging. Most local-trades competitors don't support this.",
  },
] as const;

export const PLATFORM_BY_ID: Record<SocialPlatformId, SocialPlatformDef> =
  PLATFORMS.reduce(
    (acc, p) => {
      acc[p.id] = p;
      return acc;
    },
    {} as Record<SocialPlatformId, SocialPlatformDef>,
  );

/**
 * Normalize an arbitrary platform key from the API into one of the four
 * supported ids. Returns null when the platform isn't one we surface in the
 * new dashboard (e.g. legacy "google_business"). Callers should fall back to
 * a neutral chip when null.
 */
export function normalizePlatform(raw: string | undefined | null): SocialPlatformId | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  if (key === "facebook" || key === "fb") return "facebook";
  if (key === "instagram" || key === "ig") return "instagram";
  if (key === "linkedin" || key === "ln") return "linkedin";
  if (key === "whatsapp" || key === "whatsapp_business" || key === "wa") return "whatsapp";
  return null;
}

export function platformLabel(raw: string | undefined | null): string {
  const id = normalizePlatform(raw);
  if (id) return PLATFORM_BY_ID[id].label;
  if (raw === "google_business") return "Google Business";
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Unknown";
}

export function platformColor(raw: string | undefined | null): string {
  const id = normalizePlatform(raw);
  return id ? PLATFORM_BY_ID[id].color : "rgb(148, 163, 184)"; // neutral slate
}
