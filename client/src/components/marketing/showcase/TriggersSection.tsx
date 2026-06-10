/**
 * TriggersSection — dark full-width section ported from
 * "Triggers Section.html" design. Serif headline, subdued lede,
 * and a 2×3 grid of six trigger-type cards (icon + name + example
 * value + description).
 *
 * Accent: green (#5fe3a8) → fix-blue (mkt.accent / #0d3cfc).
 * Cards adapted to real WeFixTrades automation triggers.
 *
 * Placement: /features/ai-employee (after benefits) + /design-showcase.
 */

import { mkt } from "@/theme/tokens";
import {
  PhoneOff,
  Star,
  Eye,
  CalendarCheck,
  Receipt,
  UserPlus,
} from "lucide-react";

interface TriggerCard {
  Icon: typeof PhoneOff;
  name: string;
  example: string;
  desc: string;
  delay: number;
}

const TRIGGERS: TriggerCard[] = [
  {
    Icon: PhoneOff,
    name: "Missed Call",
    example: "TradeLine answers + books the job",
    desc: "When a call goes unanswered, TradeLine picks up instantly, qualifies the lead, and locks in a booking before the customer dials your competitor.",
    delay: 0,
  },
  {
    Icon: Star,
    name: "New Google Review",
    example: "ReputationShield drafts the reply",
    desc: "Every new review — 1-star or 5-star — triggers a tailored draft reply within seconds, keeping your reputation active and Google ranking healthy.",
    delay: 1,
  },
  {
    Icon: Eye,
    name: "Quote Viewed",
    example: "QuoteQuick follow-up nudge",
    desc: "When a prospect opens your quote link, a timed SMS nudge fires automatically. Strike while the iron is hot — before they shop around.",
    delay: 2,
  },
  {
    Icon: CalendarCheck,
    name: "Booking Confirmed",
    example: "BookFlow reminder sequence",
    desc: "Confirmed jobs trigger a multi-step reminder sequence: 48-hour heads-up, day-before confirmation, and a post-job review request. Zero admin.",
    delay: 3,
  },
  {
    Icon: Receipt,
    name: "Invoice Overdue",
    example: "Payment nudge sent",
    desc: "Past-due invoices automatically send polite, escalating payment reminders via SMS. Collect what you're owed without awkward calls.",
    delay: 4,
  },
  {
    Icon: UserPlus,
    name: "New Lead Captured",
    example: "Instant callback triggered",
    desc: "The moment a web form is submitted, an instant callback sequence fires — call, SMS, and follow-up email — so no warm lead ever goes cold.",
    delay: 5,
  },
];

/* Reduced-motion keyframe guard is injected via CSS only when motion is
   allowed (prefers-reduced-motion: no-preference). */

export default function TriggersSection() {
  return (
    <div data-theme="dark" className="ts-root">
      <style>{CSS}</style>
      <div className="ts-wrap">
        {/* ── Header ── */}
        <div className="ts-head">
          <span className="ts-pill">Automation Triggers</span>
          <h2 className="ts-headline">
            Trigger from anything.<br />
            A customer never waits.
          </h2>
          <p className="ts-lede">
            Missed calls, new reviews, quote views, confirmed bookings, overdue
            invoices, and fresh leads — every event in your trades business
            becomes an automatic action.
          </p>
        </div>

        {/* ── Card grid ── */}
        <div className="ts-grid">
          {TRIGGERS.map(({ Icon, name, example, desc }, i) => (
            <div
              key={name}
              className={`ts-card ts-c${i + 1}`}
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <span className="ts-ic" aria-hidden>
                <Icon size={16} strokeWidth={1.4} />
              </span>
              <h3 className="ts-name">{name}</h3>
              <p className="ts-example">{example}</p>
              <p className="ts-desc">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const ACCENT      = mkt.accent;          // #0d3cfc
const ACCENT_GLOW = mkt.accentGlow;      // rgba(13,60,252,0.20)
const ACCENT_TINT = mkt.accentTint;      // rgba(13,60,252,0.10)
const BG          = mkt.bgElevated;      // #1C1C1C
const HAIRLINE    = mkt.hairline;        // rgba(133,128,123,0.18)
const FG          = mkt.fg;              // #F9F9F9
const FG2         = mkt.fgSecondary;     // #A39E99
const FG3         = mkt.fgTertiary;      // #78736E
const PILL_BG     = "rgba(255,255,255,0.04)";
const PILL_BD     = "rgba(255,255,255,0.14)";
const CARD_BG     = "rgba(8,11,10,0.55)";
const CARD_BD     = "rgba(255,255,255,0.07)";

const CSS = `
/* ── root ─────────────────────────────────────────────────── */
.ts-root {
  position: relative;
  padding: 96px 24px 112px;
  background: ${BG};
  overflow: hidden;
}

/* Subtle radial vignette matching the source design */
.ts-root::after {
  content: "";
  position: absolute; inset: 0;
  pointer-events: none;
  background: radial-gradient(75% 65% at 50% 50%, transparent 55%, rgba(0,0,0,0.28) 100%);
}

/* ── wrap ─────────────────────────────────────────────────── */
.ts-wrap {
  position: relative; z-index: 1;
  max-width: 1080px; margin: 0 auto;
}

/* ── header ───────────────────────────────────────────────── */
.ts-head {
  text-align: center;
  margin-bottom: 56px;
}
.ts-pill {
  display: inline-block;
  padding: 5px 14px 6px;
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: ${FG};
  background: ${PILL_BG};
  border: 1px solid ${PILL_BD};
  border-radius: 999px;
  margin-bottom: 26px;
}
.ts-headline {
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 400;
  font-size: clamp(30px, 4vw, 46px);
  line-height: 1.13;
  letter-spacing: -0.012em;
  color: ${FG};
  margin: 0 0 18px;
}
.ts-lede {
  max-width: 600px;
  margin: 0 auto;
  font-size: 15px; line-height: 1.6;
  color: ${FG2};
}

/* ── grid ─────────────────────────────────────────────────── */
.ts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid ${CARD_BD};
  border-radius: 10px;
  overflow: hidden;
}

/* ── card ─────────────────────────────────────────────────── */
.ts-card {
  position: relative;
  padding: 22px 22px 24px;
  background: ${CARD_BG};
  border-right: 1px solid ${CARD_BD};
  border-bottom: 1px solid ${CARD_BD};
  display: flex; flex-direction: column; gap: 8px;
  overflow: hidden;
  transition: background 240ms ease;
}
/* Remove right border from every 3rd card */
.ts-card:nth-child(3n)   { border-right: none; }
/* Remove bottom border from the last row (cards 4-6) */
.ts-card:nth-child(n+4)  { border-bottom: none; }

/* Hover: subtle blue tint on the background */
.ts-card:hover {
  background: rgba(13,60,252,0.06);
}

/* ── card content ─────────────────────────────────────────── */
.ts-ic {
  width: 30px; height: 30px;
  display: inline-flex; align-items: center; justify-content: center;
  background: ${ACCENT_TINT};
  border: 1px solid rgba(13,60,252,0.20);
  border-radius: 8px;
  color: ${ACCENT};
  flex-shrink: 0;
}
.ts-name {
  margin: 0;
  font-size: 14px; font-weight: 600; letter-spacing: -0.005em;
  color: ${FG};
}
.ts-example {
  margin: 0;
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: 11.5px; line-height: 1.4;
  color: ${ACCENT};
  opacity: 0.9;
}
.ts-desc {
  margin: 0;
  font-size: 12.5px; line-height: 1.55;
  color: ${FG3};
}

/* ── Traveling sheen on each card ────────────────────────── */
.ts-card::before {
  content: "";
  position: absolute; inset: 0;
  pointer-events: none;
  background: linear-gradient(
    100deg,
    transparent 0%, transparent 38%,
    rgba(13,60,252,0.14) 48%,
    rgba(13,60,252,0.28) 50%,
    rgba(13,60,252,0.14) 52%,
    transparent 62%, transparent 100%
  );
  background-size: 280% 100%;
  background-position: 180% 0;
  background-repeat: no-repeat;
  mix-blend-mode: screen;
}

/* Animate sheen only when motion is OK */
@media (prefers-reduced-motion: no-preference) {
  @keyframes ts-sweep {
    0%, 100% { background-position: 180% 0; }
    40%      { background-position: 100% 0; }
    50%      { background-position: 50%  0; }
    60%      { background-position:   0% 0; }
  }
  .ts-c1::before { animation: ts-sweep 22s cubic-bezier(.4,0,.2,1) infinite; animation-delay: calc(22s * 0.10); }
  .ts-c2::before { animation: ts-sweep 22s cubic-bezier(.4,0,.2,1) infinite; animation-delay: calc(22s * 0.18); }
  .ts-c3::before { animation: ts-sweep 22s cubic-bezier(.4,0,.2,1) infinite; animation-delay: calc(22s * 0.26); }
  .ts-c4::before { animation: ts-sweep 22s cubic-bezier(.4,0,.2,1) infinite; animation-delay: calc(22s * 0.34); }
  .ts-c5::before { animation: ts-sweep 22s cubic-bezier(.4,0,.2,1) infinite; animation-delay: calc(22s * 0.42); }
  .ts-c6::before { animation: ts-sweep 22s cubic-bezier(.4,0,.2,1) infinite; animation-delay: calc(22s * 0.50); }
}

/* ── responsive ───────────────────────────────────────────── */
@media (max-width: 760px) {
  .ts-grid {
    grid-template-columns: repeat(2, 1fr);
    border-radius: 8px;
  }
  /* Repair nth-child borders for 2-col layout */
  .ts-card:nth-child(3n)   { border-right: 1px solid ${CARD_BD}; }
  .ts-card:nth-child(n+4)  { border-bottom: 1px solid ${CARD_BD}; }
  .ts-card:nth-child(2n)   { border-right: none; }
  .ts-card:nth-child(n+5)  { border-bottom: none; }
}

@media (max-width: 440px) {
  .ts-root { padding: 72px 16px 88px; }
  .ts-grid {
    grid-template-columns: 1fr;
  }
  /* Single-column: restore all right borders, remove all bottom borders
     except those that still separate cards */
  .ts-card {
    border-right: none !important;
    border-bottom: 1px solid ${CARD_BD} !important;
  }
  .ts-card:last-child { border-bottom: none !important; }
}
`;
