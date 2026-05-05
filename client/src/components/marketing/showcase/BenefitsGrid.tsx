/**
 * BenefitsGrid — 3×2 dark rounded-card grid. Each card shows a small
 * square icon tile (top-left), a heading, and a 1–2 sentence description.
 * Six original WeFixTrades benefit statements written for trades-business
 * owners.
 */

import { mkt } from "@/theme/tokens";
import {
  PhoneCall, Zap, ShieldCheck, MapPinned, Star, MoonStar,
} from "lucide-react";

interface Benefit {
  Icon: typeof PhoneCall;
  title: string;
  desc: string;
}

const BENEFITS: Benefit[] = [
  {
    Icon: PhoneCall,
    title: "Capture Every Lead",
    desc: "AI picks up the calls and chats you'd otherwise miss. No voicemail roulette, no lost revenue at 2 AM.",
  },
  {
    Icon: Zap,
    title: "Instant Quotes",
    desc: "Customers get a real price the moment they ask — pulled from your live pricing, not a guess.",
  },
  {
    Icon: ShieldCheck,
    title: "Reputation On Autopilot",
    desc: "Every review gets a thoughtful reply within minutes. 5-stars amplified, 1-stars routed straight to your phone.",
  },
  {
    Icon: MapPinned,
    title: "Win the Local Map",
    desc: "Weekly Google Business Profile audits and fixes so you show up first when neighbours search.",
  },
  {
    Icon: Star,
    title: "Bookings Without Phone Tag",
    desc: "Customers pick a slot from your real calendar. You arrive, you work, you get paid — no back-and-forth.",
  },
  {
    Icon: MoonStar,
    title: "24/7 Coverage",
    desc: "Nights, weekends, holidays. Your AI dispatcher never sleeps, so the next emergency call is yours.",
  },
];

export default function BenefitsGrid() {
  return (
    <div className="bg-wrap">
      <style>{CSS}</style>
      <div className="bg-grid">
        {BENEFITS.map((b, i) => {
          const Icon = b.Icon;
          return (
            <article key={i} className="bg-card">
              <span className="bg-icon" aria-hidden>
                <Icon size={18} strokeWidth={1.6} />
              </span>
              <h3 className="bg-title">{b.title}</h3>
              <p className="bg-desc">{b.desc}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

const CSS = `
.bg-wrap {
  padding: 48px 24px;
  background: ${mkt.bg};
  display: flex; justify-content: center;
}
.bg-grid {
  width: 100%; max-width: 980px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  font-family: 'DM Sans', system-ui, sans-serif;
}
.bg-card {
  background: rgba(20,24,27,0.55);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 22px;
  padding: 28px 26px;
  min-height: 220px;
  display: flex; flex-direction: column;
  transition: transform 220ms cubic-bezier(0.22,1,0.36,1), border-color 220ms ease;
}
.bg-card:hover {
  transform: translateY(-2px);
  border-color: rgba(102,232,250,0.18);
}
.bg-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px;
  border-radius: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  color: ${mkt.accent};
  margin-bottom: 56px;
}
.bg-title {
  font-size: 17px; font-weight: 700; letter-spacing: -0.01em;
  color: #fff; margin: 0 0 10px;
}
.bg-desc {
  font-size: 13.5px; line-height: 1.55; color: rgba(255,255,255,0.55);
  margin: 0;
}

@media (max-width: 760px) { .bg-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 480px) { .bg-grid { grid-template-columns: 1fr; } }
`;
