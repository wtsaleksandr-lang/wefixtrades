/**
 * MultiTieredSupport — wide rounded card split 40/60. Left holds eyebrow
 * heading + paragraph + faint mono section number. Right holds a chat-app
 * mockup composition: agent presence card, user list panel, active chat
 * thread with bubbles + input bar.
 *
 * Avatars are colored circular initials (no images) — clean, brand-safe,
 * and renders fast.
 */

import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";
import { Search, Smile, Paperclip, Send, MoreVertical } from "lucide-react";

const AVATARS = [
  { initials: "TR", name: "Theo Renshaw",   bg: "#0d3cfc", role: "Senior Trades Specialist", online: true  },
  { initials: "JV", name: "Jaxon Voss",     bg: "#C5B4FF", role: "On-call Engineer",          online: true  },
  { initials: "RM", name: "Rowan Mercer",   bg: "#F472B6", role: "TradeLine Ops",             online: false, preview: "Hey, can I tweak my after-hours…" },
  { initials: "SV", name: "Sienna Vail",    bg: "#86EFAC", role: "Onboarding",                online: false, preview: "Service area updated, ready to…" },
  { initials: "ZH", name: "Zayn Holloway",  bg: "#FFD66E", role: "Billing",                   online: false, preview: "Got the proration sorted —" },
];

export default function MultiTieredSupport() {
  const me = AVATARS[0];
  const customer = AVATARS[2];

  return (
    <div data-theme="dark" className="mts-wrap">
      <style>{CSS}</style>
      <div className="mts-card">
        {/* LEFT — copy */}
        <div className="mts-left">
          <h3 className="mts-head">Multi-Tiered Support</h3>
          <p className="mts-copy">
            Get help when you need it, on every tier. Reach our team through the support portal or a dedicated Slack channel for paid plans, with strict SLAs and named owners on every issue — no ticket-graveyards.
          </p>
          <span className="mts-num">06</span>
        </div>

        {/* RIGHT — chat composition */}
        <div className="mts-right">
          {/* Agent presence card */}
          <div className="mts-agent">
            <Avatar a={me} size={36} />
            <div className="mts-agent-meta">
              <span className="mts-agent-name">{me.name}</span>
              <span className="mts-agent-role">{me.role}</span>
            </div>
          </div>

          {/* User list panel */}
          <div className="mts-list">
            <div className="mts-search">
              <Search size={12} />
              <span>SEARCH USERS</span>
            </div>
            {AVATARS.slice(1).map((a) => (
              <div key={a.name} className={`mts-list-row ${a.name === customer.name ? "active" : ""}`}>
                <Avatar a={a} size={28} />
                <div className="mts-list-meta">
                  <span className="mts-list-name">{a.name}</span>
                  <span className="mts-list-prev">{a.preview ?? "—"}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Active chat thread */}
          <div className="mts-thread">
            <div className="mts-thread-head">
              <Avatar a={customer} size={26} />
              <span className="mts-thread-name">{customer.name}</span>
              <MoreVertical size={14} />
            </div>
            <div className="mts-thread-body">
              <div className="mts-msg mts-msg-them">
                <Avatar a={customer} size={20} />
                <div>
                  <div className="mts-bubble">Hey — can I tweak the after-hours greeting on TradeLine for my plumbing line?</div>
                  <div className="mts-time">2 min ago</div>
                </div>
              </div>
              <div className="mts-msg mts-msg-us">
                <div>
                  <div className="mts-bubble mts-bubble-cyan">Yep — admin → TradeLine → Voice → After-hours. Want me to push a draft you can approve?</div>
                  <div className="mts-time">1 min ago</div>
                </div>
                <Avatar a={me} size={20} />
              </div>
              <div className="mts-typing">
                <span /><span /><span />
              </div>
            </div>
            <div className="mts-thread-input">
              <Smile size={14} />
              <Paperclip size={14} />
              <span className="mts-thread-placeholder">Type a message…</span>
              <Send size={14} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Avatar({ a, size }: { a: typeof AVATARS[number]; size: number }) {
  return (
    <span
      className="mts-avatar"
      style={{
        width: size, height: size,
        background: a.bg,
        fontSize: size < 24 ? 9 : size < 30 ? 10 : 13,
      }}
      aria-label={a.name}
    >
      {a.initials}
      {a.online && <span className="mts-avatar-dot" />}
    </span>
  );
}

const CSS = `
.mts-wrap {
  padding: 48px 24px;
  background: ${mkt.bg};
  display: flex; justify-content: center;
}
.mts-card {
  width: 100%; max-width: 980px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
  background: rgba(20,24,27,0.65);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 22px;
  background-image: radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 18px 18px;
  overflow: hidden;
  font-family: 'DM Sans', system-ui, sans-serif;
}
.mts-left {
  padding: 36px 32px;
  background: rgba(0,0,0,0.18);
  border-right: 1px solid rgba(255,255,255,0.05);
  position: relative;
}
.mts-head { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; color: #fff; margin: 0 0 14px; line-height: 1.2; }
.mts-copy { font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.65); margin: 0; }
.mts-num {
  position: absolute; left: 28px; bottom: 24px;
  font-family: ${MONO}; font-size: 14px; font-weight: 700;
  letter-spacing: 0.10em; color: rgba(255,255,255,0.18);
}

.mts-right { position: relative; min-height: 420px; padding: 28px; }

/* Avatar */
.mts-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; flex-shrink: 0; position: relative;
  font-family: ${MONO}; font-weight: 800; color: #0a1018;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.06);
}
.mts-avatar-dot {
  position: absolute; right: 0; bottom: 0;
  width: 8px; height: 8px; border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 0 2px rgba(20,24,27,0.95);
}

/* Agent presence card */
.mts-agent {
  position: absolute;
  left: 24px; top: 28px;
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 12px;
  backdrop-filter: blur(8px);
  width: 220px;
  z-index: 2;
}
.mts-agent-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.mts-agent-name { font-size: 12px; font-weight: 700; color: #fff; letter-spacing: -0.01em; }
.mts-agent-role { font-family: ${MONO}; font-size: 8px; letter-spacing: 0.10em; text-transform: uppercase; color: rgba(255,255,255,0.55); }

/* User list panel */
.mts-list {
  position: absolute;
  left: 24px; top: 96px;
  width: 220px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 12px;
  padding: 8px;
  display: flex; flex-direction: column; gap: 4px;
  backdrop-filter: blur(8px);
  z-index: 1;
}
.mts-search {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px;
  background: rgba(255,255,255,0.03);
  border-radius: 8px;
  font-family: ${MONO}; font-size: 9px; letter-spacing: 0.10em;
  color: rgba(255,255,255,0.40);
  margin-bottom: 4px;
}
.mts-list-row {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 8px; border-radius: 8px;
  cursor: pointer;
}
.mts-list-row.active { background: rgba(13,60,252,0.08); border: 1px solid rgba(13,60,252,0.18); }
.mts-list-meta { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.mts-list-name { font-size: 11px; font-weight: 700; color: #fff; }
.mts-list-prev { font-size: 10px; color: rgba(255,255,255,0.45); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Active chat thread */
.mts-thread {
  position: absolute;
  right: 24px; top: 28px; bottom: 28px;
  width: 270px;
  background: rgba(20,24,27,0.95);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 14px;
  display: flex; flex-direction: column;
  box-shadow: 0 18px 40px rgba(0,0,0,0.45);
  z-index: 3;
}
.mts-thread-head {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.mts-thread-name { flex: 1; font-size: 12px; font-weight: 700; color: #fff; }
.mts-thread-body {
  flex: 1;
  padding: 12px 14px;
  display: flex; flex-direction: column; gap: 10px;
  overflow: hidden;
}
.mts-msg { display: flex; gap: 6px; align-items: flex-end; max-width: 85%; }
.mts-msg-them { align-self: flex-start; }
.mts-msg-us   { align-self: flex-end; flex-direction: row-reverse; }
.mts-bubble {
  padding: 8px 11px;
  border-radius: 12px;
  font-size: 11px; line-height: 1.4;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  color: #fff;
}
.mts-bubble-cyan {
  background: ${mkt.accent};
  color: #00131a;
  border-color: ${mkt.accent};
  font-weight: 600;
}
.mts-time {
  margin-top: 3px;
  font-family: ${MONO};
  font-size: 8px; letter-spacing: 0.06em;
  color: rgba(255,255,255,0.32);
}
.mts-msg-us .mts-time { text-align: right; }
.mts-typing {
  display: inline-flex; gap: 3px; align-self: flex-start;
  padding: 7px 10px; border-radius: 999px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.10);
}
.mts-typing span {
  width: 4px; height: 4px; border-radius: 50%;
  background: rgba(255,255,255,0.65);
  animation: mtsBounce 1.2s ease-in-out infinite;
}
.mts-typing span:nth-child(2) { animation-delay: 0.15s; }
.mts-typing span:nth-child(3) { animation-delay: 0.30s; }
@keyframes mtsBounce {
  0%, 60%, 100% { opacity: 0.4; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-2px); }
}

.mts-thread-input {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  border-top: 1px solid rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.45);
}
.mts-thread-placeholder {
  flex: 1; font-size: 11px; color: rgba(255,255,255,0.40);
}

@media (max-width: 880px) {
  .mts-card { grid-template-columns: 1fr; }
  .mts-right { min-height: 480px; }
  .mts-thread { width: 240px; }
}
@media (max-width: 540px) {
  .mts-agent { width: 180px; }
  .mts-list  { width: 180px; }
  .mts-thread { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  @keyframes mtsBounce { 0%, 100% { opacity: 0.65; transform: none; } }
  .mts-typing span { animation: none; }
}
`;
