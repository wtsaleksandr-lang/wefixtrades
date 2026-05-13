/**
 * IntegrationsTrustStrip — replaces the prior TrustMarquee (which used
 * fabricated customer logos). Shows real, recognizable integrations
 * that signal "this product is built on industry-standard rails."
 *
 * Picked deliberately to cover the buyer's main "does this actually
 * work?" questions:
 *   - Stripe  → payments + subscriptions are first-class
 *   - Twilio  → real phone numbers + SMS, not gimmicks
 *   - Google  → Maps / Search / Business Profile wired in
 *   - Anthropic Claude → AI brain, named (not a generic "AI" claim)
 *   - Vapi    → real-time voice AI for the 24/7 phone line
 *
 * Wordmarks are simplified inline SVG so we don't pull external assets.
 * Brand colors muted to neutral-on-dark so the strip reads as a quiet
 * trust signal rather than competing logos.
 */

import { mkt } from "@/theme/tokens";

const LABEL_COLOR = "rgba(255,255,255,0.55)";
const HOVER_COLOR = "rgba(255,255,255,0.85)";

interface IntegrationLogo {
  name: string;
  svg: React.ReactNode;
}

const INTEGRATIONS: IntegrationLogo[] = [
  {
    name: "Stripe",
    svg: (
      <svg width="56" height="20" viewBox="0 0 56 20" fill="currentColor" aria-label="Stripe">
        <path d="M3.61 7.4c0-.55.46-.77 1.21-.77 1.08 0 2.45.33 3.53.91V4.18A9.34 9.34 0 0 0 4.82 3.5C2.04 3.5 0 5 0 7.51c0 3.93 5.4 3.3 5.4 5 0 .64-.56.85-1.36.85-1.18 0-2.7-.49-3.9-1.14v3.39c1.33.57 2.68.82 3.9.82 2.85 0 5.02-1.41 5.02-3.96-.02-4.25-5.45-3.49-5.45-5.07Zm9.06-5.05L9.05 3.12v11.94c0 2.21 1.66 3.84 3.87 3.84 1.22 0 2.12-.22 2.61-.49v-2.95c-.48.2-2.83.88-2.83-1.33V7.04h2.83V3.85h-2.83V2.35Zm7.6 2.84-.24-1.34h-3.07v11.27h3.55V8.5c.84-1.1 2.27-.89 2.71-.74V4.7c-.46-.17-2.14-.49-2.95.49Zm3.39-1.34h3.57v11.27h-3.57V3.85ZM27.23 2.55l3.57-.76V0L27.23.76v1.79Zm6.92 1.31c-1.39 0-2.28.65-2.78 1.1l-.18-.87h-3.13v15.05L31.61 19l.02-3.65c.51.37 1.27.9 2.51.9 2.52 0 4.82-2.03 4.82-6.13-.01-3.75-2.34-5.9-4.83-5.9Zm-.86 9.06c-.83 0-1.32-.3-1.66-.66l-.02-5.26c.37-.4.87-.69 1.68-.69 1.28 0 2.17 1.43 2.17 3.3 0 1.91-.87 3.3-2.17 3.3Zm15.13-3.27c0-3.3-1.6-5.9-4.65-5.9-3.07 0-4.93 2.6-4.93 5.87 0 3.87 2.19 5.83 5.33 5.83 1.53 0 2.69-.35 3.57-.83v-2.85c-.88.44-1.89.71-3.16.71-1.25 0-2.36-.44-2.5-1.96h6.31c.01-.17.03-.85.03-1.16v.29Zm-6.38-1.22c0-1.46.89-2.07 1.71-2.07.79 0 1.63.61 1.63 2.07h-3.34Z"/>
      </svg>
    ),
  },
  {
    name: "Twilio",
    svg: (
      <svg width="62" height="20" viewBox="0 0 62 20" fill="currentColor" aria-label="Twilio">
        <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="2"/>
        <circle cx="6.5" cy="6.5" r="1.7" fill="#F22F46"/>
        <circle cx="13.5" cy="6.5" r="1.7" fill="#F22F46"/>
        <circle cx="6.5" cy="13.5" r="1.7" fill="#F22F46"/>
        <circle cx="13.5" cy="13.5" r="1.7" fill="#F22F46"/>
        <text x="24" y="14" fontFamily="-apple-system, system-ui, sans-serif" fontSize="11.5" fontWeight="700" letterSpacing="0">twilio</text>
      </svg>
    ),
  },
  {
    name: "Google Business",
    svg: (
      <svg width="78" height="20" viewBox="0 0 78 20" fill="currentColor" aria-label="Google Business">
        <text x="0" y="14" fontFamily="-apple-system, system-ui, sans-serif" fontSize="11.5" fontWeight="700" letterSpacing="-0.2">
          <tspan fill="#4285F4">G</tspan>
          <tspan fill="#EA4335">o</tspan>
          <tspan fill="#FBBC04">o</tspan>
          <tspan fill="#4285F4">g</tspan>
          <tspan fill="#34A853">l</tspan>
          <tspan fill="#EA4335">e</tspan>
        </text>
        <text x="42" y="14" fontFamily="-apple-system, system-ui, sans-serif" fontSize="11.5" fontWeight="500" letterSpacing="-0.2">Business</text>
      </svg>
    ),
  },
  {
    name: "Anthropic Claude",
    svg: (
      <svg width="74" height="20" viewBox="0 0 74 20" fill="currentColor" aria-label="Anthropic Claude">
        <path d="M10.6 4 6.1 16h2.5l.85-2.4h4.55l.85 2.4h2.5L12.85 4h-2.25Zm.2 7.6 1.55-4.4 1.55 4.4h-3.1Z" fill="#D97706"/>
        <text x="20" y="14" fontFamily="-apple-system, system-ui, sans-serif" fontSize="11.5" fontWeight="600" letterSpacing="-0.15">Claude</text>
      </svg>
    ),
  },
  {
    name: "Vapi",
    svg: (
      <svg width="54" height="20" viewBox="0 0 54 20" fill="currentColor" aria-label="Vapi">
        <path d="M4 6 7.5 14 11 6h2.2l-4.6 10h-2.2L1.8 6H4Z" fill="currentColor"/>
        <text x="16" y="14" fontFamily="-apple-system, system-ui, sans-serif" fontSize="11.5" fontWeight="700" letterSpacing="-0.2">Vapi</text>
      </svg>
    ),
  },
];

export default function IntegrationsTrustStrip() {
  return (
    <div
      data-testid="integrations-trust-strip"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        padding: "20px 24px",
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.4)",
          margin: 0,
          fontFamily: "'DM Mono', monospace",
        }}
      >
        Powered by the rails you already trust
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
          flexWrap: "wrap",
          color: LABEL_COLOR,
        }}
      >
        {INTEGRATIONS.map((logo) => (
          <span
            key={logo.name}
            title={logo.name}
            style={{
              display: "inline-flex",
              alignItems: "center",
              transition: "color 0.2s, transform 0.2s",
              cursor: "default",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = HOVER_COLOR; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = ""; }}
          >
            {logo.svg}
          </span>
        ))}
      </div>
    </div>
  );
}
