/**
 * BenefitsGrid — Effortel-style 2×3 benefit card grid.
 *
 * Each card is a dark translucent tile with a small rounded icon
 * square in the top-left, a bold title, and a short two-line
 * description. No mini-dashboards, no widgets — clean and readable
 * exactly like the Effortel reference.
 */

import {
  PhoneIncoming, UserPlus, RefreshCw,
  HandCoins, Zap, ShieldCheck,
} from "lucide-react";
import { mkt } from "@/theme/tokens";

interface Benefit {
  icon: React.ReactNode;
  title: string;
  desc: string;
}

const BENEFITS: Benefit[] = [
  {
    icon: <PhoneIncoming size={18} strokeWidth={1.8} />,
    title: "Capture Every Lead",
    desc: "AI answers calls and chats day and night so no opportunity slips past voicemail.",
  },
  {
    icon: <UserPlus size={18} strokeWidth={1.8} />,
    title: "Expand Reach",
    desc: "Show up first on Google Maps and local search across every neighbourhood you serve.",
  },
  {
    icon: <RefreshCw size={18} strokeWidth={1.8} />,
    title: "Retain Customers",
    desc: "Automated follow-ups and review replies keep past customers coming back instead of churning.",
  },
  {
    icon: <HandCoins size={18} strokeWidth={1.8} />,
    title: "Expand Profits",
    desc: "Instant quoting and upsell prompts unlock revenue you'd otherwise leave on the table.",
  },
  {
    icon: <Zap size={18} strokeWidth={1.8} />,
    title: "Maximize Efficiency",
    desc: "Replace phone tag and manual scheduling with self-serve booking that fills your calendar.",
  },
  {
    icon: <ShieldCheck size={18} strokeWidth={1.8} />,
    title: "Secure Reliability",
    desc: "Monitored uptime, backups, and security patches keep your site and data safe 24/7.",
  },
];

export default function BenefitsGrid() {
  return (
    <div className="bg-wrap">
      <style>{CSS}</style>
      <div className="bg-grid">
        {BENEFITS.map((b) => (
          <article key={b.title} className="bg-card">
            <span className="bg-icon">{b.icon}</span>
            <h3 className="bg-title">{b.title}</h3>
            <p className="bg-desc">{b.desc}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

const CSS = `
.bg-wrap {
  padding: 56px 24px;
  background: ${mkt.bg};
  display: flex; justify-content: center;
}
.bg-grid {
  width: 100%; max-width: 1080px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  font-family: 'DM Sans', system-ui, sans-serif;
}
.bg-card {
  background: rgba(20,24,27,0.55);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 18px;
  padding: 22px 22px 26px;
  min-height: 220px;
  display: flex; flex-direction: column;
  transition: transform 220ms cubic-bezier(0.22,1,0.36,1), border-color 220ms ease, background 220ms ease;
}
.bg-card:hover {
  transform: translateY(-2px);
  border-color: rgba(102,232,250,0.18);
  background: rgba(20,24,27,0.7);
}
.bg-icon {
  width: 40px; height: 40px;
  border-radius: 10px;
  background: rgba(102,232,250,0.10);
  border: 1px solid rgba(102,232,250,0.18);
  color: #66E8FA;
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 60px;
  flex-shrink: 0;
}
.bg-title {
  font-size: 17px; font-weight: 700; letter-spacing: -0.01em;
  color: #fff; margin: 0 0 8px;
}
.bg-desc {
  font-size: 13px; line-height: 1.55; color: rgba(255,255,255,0.55);
  margin: 0;
}

@media (max-width: 880px) { .bg-grid { grid-template-columns: 1fr 1fr; gap: 12px; } }
@media (max-width: 520px) {
  .bg-grid { grid-template-columns: 1fr; gap: 10px; }
  .bg-card { padding: 18px 18px 22px; min-height: 180px; }
  .bg-icon { margin-bottom: 36px; }
}
`;
