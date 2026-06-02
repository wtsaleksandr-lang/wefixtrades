/**
 * AppStoreBadges — official-style "Download on the App Store" + "Get it on
 * Google Play" badges for the footer.
 *
 * The mobile app (wefixtrades-softphone) isn't published yet, so by default
 * the badges render in a "Coming soon" state (not clickable). Once the store
 * listings are live, pass the real URLs via APP_STORE_URL / PLAY_STORE_URL
 * and they become links.
 *
 * NOTE: these are faithful SVG recreations of the standard store badges. For
 * strict brand-guideline compliance, Apple's and Google's official downloadable
 * badge assets can be dropped in to replace these.
 */

/** Set these when the store listings go live to make the badges clickable. */
const APP_STORE_URL = "";
const PLAY_STORE_URL = "";

const BADGE_H = 40;

function AppStoreMark() {
  return (
    <svg width={135} height={BADGE_H} viewBox="0 0 135 40" role="img" aria-label="Download on the App Store">
      <rect x="0.5" y="0.5" width="134" height="39" rx="7" fill="#000" stroke="rgba(255,255,255,0.25)" />
      {/* Apple glyph */}
      <g transform="translate(13, 8)" fill="#fff">
        <path d="M17.05 12.04c-.03-2.5 2.04-3.7 2.13-3.76-1.16-1.7-2.97-1.93-3.6-1.96-1.53-.16-3 .9-3.77.9-.78 0-1.97-.88-3.25-.86-1.67.03-3.22.97-4.08 2.47-1.74 3.02-.44 7.5 1.25 9.96.83 1.2 1.81 2.55 3.1 2.5 1.25-.05 1.72-.8 3.23-.8 1.5 0 1.93.8 3.25.78 1.34-.03 2.2-1.22 3.02-2.43.95-1.4 1.34-2.75 1.36-2.82-.03-.01-2.6-1-2.63-3.96zM14.6 5.13c.68-.83 1.14-1.98 1.01-3.13-.98.04-2.17.65-2.87 1.48-.63.73-1.18 1.9-1.03 3.02 1.09.08 2.21-.55 2.89-1.37z" />
      </g>
      <text x="44" y="16" fill="#fff" fontFamily="Helvetica, Arial, sans-serif" fontSize="8">Download on the</text>
      <text x="44" y="30" fill="#fff" fontFamily="Helvetica, Arial, sans-serif" fontSize="16" fontWeight="600">App Store</text>
    </svg>
  );
}

function GooglePlayMark() {
  return (
    <svg width={135} height={BADGE_H} viewBox="0 0 135 40" role="img" aria-label="Get it on Google Play">
      <rect x="0.5" y="0.5" width="134" height="39" rx="7" fill="#000" stroke="rgba(255,255,255,0.25)" />
      {/* Play triangle — 4-colour mark */}
      <g transform="translate(12, 9)">
        <polygon points="3,3 3,11 11,11" fill="#00C3FF" />
        <polygon points="3,11 3,19 11,11" fill="#00E676" />
        <polygon points="3,3 11,11 19,11" fill="#FFCD00" />
        <polygon points="3,19 11,11 19,11" fill="#FF3B30" />
      </g>
      <text x="42" y="16" fill="#fff" fontFamily="Helvetica, Arial, sans-serif" fontSize="7.5" letterSpacing="0.5">GET IT ON</text>
      <text x="42" y="30" fill="#fff" fontFamily="Helvetica, Arial, sans-serif" fontSize="15" fontWeight="600">Google Play</text>
    </svg>
  );
}

function Badge({ url, label, children }: { url: string; label: string; children: import("react").ReactNode }) {
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        style={{ display: "inline-flex", lineHeight: 0, borderRadius: 8, transition: "opacity 0.15s" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
      >
        {children}
      </a>
    );
  }
  // Not live yet — render non-clickable with a "Coming soon" overlay.
  return (
    <span aria-label={`${label} — coming soon`} style={{ display: "inline-flex", position: "relative", lineHeight: 0, opacity: 0.85 }}>
      {children}
      <span
        style={{
          position: "absolute", top: -7, right: -6,
          background: "#0d3cfc", color: "rgba(255,255,255,1)", fontSize: 8, fontWeight: 800,
          letterSpacing: "0.04em", textTransform: "uppercase",
          padding: "2px 6px", borderRadius: 999, lineHeight: 1.2, whiteSpace: "nowrap",
        }}
      >
        Coming soon
      </span>
    </span>
  );
}

export default function AppStoreBadges({ inline = false }: { inline?: boolean }) {
  const label = (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
      color: "rgba(255,255,255,0.5)", marginBottom: inline ? 0 : 10,
      whiteSpace: "nowrap",
    }}>
      Get the app
    </div>
  );
  const badges = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      <Badge url={APP_STORE_URL} label="Download on the App Store"><AppStoreMark /></Badge>
      <Badge url={PLAY_STORE_URL} label="Get it on Google Play"><GooglePlayMark /></Badge>
    </div>
  );
  if (inline) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {label}
        {badges}
      </div>
    );
  }
  return (
    <div>
      {label}
      {badges}
    </div>
  );
}
