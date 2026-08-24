/**
 * CostCompare — "The real cost of your tool stack" savings calculator.
 *
 * Adapted from a QuoteIQ cost-comparison teardown (structure + verified calc
 * model in claude-orchestrator/tools/design-teardown/out/myquoteiq/probe/).
 * Rebuilt for WeFixTrades: dark premium surface, brand-blue accent, our real
 * plan prices vs the trades-CRM competitors Alex named (Jobber, Housecall Pro,
 * ServiceTitan, QuoteIQ).
 *
 * ── Numbers policy (see the PR description for the full table) ──
 *  • WeFixTrades plan prices are REAL — pulled from shared/pricing.ts
 *    (Growth System $449/mo, Pro System $549/mo; the managed AI-office bundles).
 *  • Competitor BASE tiers are their public list pricing (verified ~May 2026 in
 *    the teardown; ServiceTitan/QuoteIQ mid-tiers are approximate — see flags).
 *  • Competitor ADD-ON prices are third-party benchmarks representing the point
 *    tools you'd bolt on to match WeFixTrades' managed suite. Several are
 *    PLACEHOLDER benchmarks — Alex must confirm the exact tools + prices to show.
 *
 * The calc is a fully parameterised config object (COMPETITORS + ADDONS +
 * WFT_PLANS) so every number is data, not branching logic. Recomputes live on
 * competitor toggle / team-size slider via React state.
 *
 * Brand/readability (hard rules): near-black surface, brand blue reserved for
 * fills / borders / the slider / accents. Totals, savings and line-item text
 * render in WHITE/near-white (brand blue on near-black fails WCAG). Selected =
 * outline + tint, never a bright fill.
 */

import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "wouter";

/* ─── Brand tokens (this section is a fixed dark surface, not OS-theme-aware,
 *     matching the WFT marketing home) ─────────────────────────────────────── */
const INK = "#0b1220";          // near-black section ground
const CARD = "#111a2b";         // raised calculator card
const BRAND = "#2f6bff";        // WFT brand blue (hsl(222 100% 59%)) — fills/borders only
const BRAND_DEEP_A = "#1d4ed8"; // savings gradient start (deep blue → white text passes AA)
const BRAND_DEEP_B = "#1e3a8a"; // savings gradient end
const TXT = "#ffffff";
const MUTED = "#9aa5b8";

/* ─── Calc config (data, not logic) ─────────────────────────────────────────
 *
 * pricing flags:  real = public list price · bench = 3rd-party benchmark ·
 *                 placeholder = needs Alex confirmation
 */
type BaseModel =
  | { kind: "tiered"; tiers: { maxUsers: number; price: number; label: string }[]; extraOver?: number; extraRate?: number }
  | { kind: "perUser"; rate: number; label: string };

interface Competitor {
  id: string;
  name: string;
  base: BaseModel;
  /** add-on ids the competitor must bolt on to match WeFixTrades' managed suite */
  addons: string[];
  /** one-off caveat rendered under the stack total (implementation fees etc.) */
  footNote?: string;
  /** why the add-on set is short (e.g. all-in-one already includes them) */
  scopeNote?: string;
}

interface Addon {
  label: string;
  sub: string;
  price: number;
  scale: "flat" | "perUser";
}

/* Add-ons = the point tools a competitor stacks to match WeFixTrades' AI office.
 * Each maps 1:1 to a WeFixTrades product it replaces. */
const ADDONS: Record<string, Addon> = {
  ai:      { label: "AI receptionist & 2-way SMS", sub: "Smith.ai / Numa-class · replaces TradeLine",       price: 99, scale: "flat" },
  reviews: { label: "Reviews & reputation tool",   sub: "NiceJob / Podium-class · replaces ReputationShield", price: 79, scale: "flat" },
  maps:    { label: "Managed Google Maps visibility", sub: "local-SEO service · replaces MapGuard",          price: 99, scale: "flat" },
  social:  { label: "Social posting & content",    sub: "managed social · replaces SocialSync",             price: 99, scale: "flat" },
  quote:   { label: "Instant online quote widget", sub: "Calculoid-class · replaces QuoteQuick",             price: 29, scale: "flat" },
};

const ADDON_STACK = ["ai", "reviews", "maps", "social", "quote"];

const COMPETITORS: Competitor[] = [
  {
    id: "jobber",
    name: "Jobber",
    base: {
      kind: "tiered",
      tiers: [
        { maxUsers: 1,  price: 39,  label: "Jobber Core" },
        { maxUsers: 5,  price: 169, label: "Jobber Connect" },
        { maxUsers: 10, price: 349, label: "Jobber Grow" },
        { maxUsers: 15, price: 599, label: "Jobber Plus" },
      ],
      extraOver: 15,
      extraRate: 29,
    },
    addons: ADDON_STACK,
  },
  {
    id: "hcp",
    name: "Housecall Pro",
    base: {
      kind: "tiered",
      tiers: [
        { maxUsers: 1, price: 79,  label: "Housecall Pro Basic" },
        { maxUsers: 5, price: 189, label: "Housecall Pro Essentials" },
        { maxUsers: 8, price: 329, label: "Housecall Pro MAX" },
      ],
      extraOver: 8,
      extraRate: 35,
    },
    addons: ADDON_STACK,
  },
  {
    id: "servicetitan",
    name: "ServiceTitan",
    base: { kind: "perUser", rate: 300, label: "ServiceTitan Essentials ($300/tech)" },
    addons: ADDON_STACK,
    footNote: "+ $5,000–$50,000 one-time implementation fee · 12-month minimum contract (not included above)",
  },
  {
    id: "quoteiq",
    name: "QuoteIQ",
    base: {
      kind: "tiered",
      tiers: [
        { maxUsers: 3,   price: 29.99, label: "QuoteIQ Essentials" },
        { maxUsers: 10,  price: 299,   label: "QuoteIQ Elite" },
        { maxUsers: 999, price: 699,   label: "QuoteIQ Max" },
      ],
    },
    // QuoteIQ is all-in-one — reviews / maps / social / quotes are built in.
    // The one thing it doesn't do is true AI voice call-answering.
    addons: ["ai"],
    scopeNote: "QuoteIQ bundles reviews, quotes & marketing already — the gap vs WeFixTrades is live AI voice.",
  },
];

/* WeFixTrades' own price — REAL, from shared/pricing.ts managed bundles. */
const WFT_PLANS = [
  { maxUsers: 10,  name: "WeFixTrades Growth System", price: 449, sub: "AI voice + reviews + maps + social + instant quotes — all managed for you." },
  { maxUsers: 999, name: "WeFixTrades Pro System",    price: 549, sub: "Full automation for larger crews — every channel handled, one bill." },
];

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

interface Line { key: string; label: string; sub?: string; amount: number; strong?: boolean }
interface CalcResult {
  competitor: Competitor;
  lines: Line[];
  current: number;
  wftName: string;
  wftSub: string;
  wftPrice: number;
  monthSavings: number;
  yearSavings: number;
}

function calc(competitor: Competitor, users: number): CalcResult {
  const lines: Line[] = [];
  let base = 0;
  let baseLabel = "";
  let extra = 0;
  let extraLabel = "";

  if (competitor.base.kind === "tiered") {
    const tier = competitor.base.tiers.find((t) => users <= t.maxUsers) ?? competitor.base.tiers[competitor.base.tiers.length - 1];
    base = tier.price;
    baseLabel = `${tier.label} (subscription)`;
    if (competitor.base.extraOver != null && competitor.base.extraRate != null && users > competitor.base.extraOver) {
      extra = (users - competitor.base.extraOver) * competitor.base.extraRate;
      extraLabel = `Extra users ($${competitor.base.extraRate}/ea over ${competitor.base.extraOver})`;
    }
  } else {
    base = competitor.base.rate * users;
    baseLabel = competitor.base.label;
  }

  lines.push({ key: "base", label: baseLabel, amount: base, strong: true });

  for (const id of competitor.addons) {
    const a = ADDONS[id];
    const amount = a.scale === "perUser" ? a.price * users : a.price;
    lines.push({ key: id, label: a.label, sub: a.sub, amount });
  }

  if (extra > 0) lines.push({ key: "extra", label: extraLabel, amount: extra });

  const current = lines.reduce((s, l) => s + l.amount, 0);
  const plan = WFT_PLANS.find((p) => users <= p.maxUsers) ?? WFT_PLANS[WFT_PLANS.length - 1];
  const monthSavings = current - plan.price;
  const yearSavings = monthSavings * 12;

  return {
    competitor,
    lines,
    current,
    wftName: plan.name,
    wftSub: plan.sub,
    wftPrice: plan.price,
    monthSavings,
    yearSavings,
  };
}

/* ─── Tabs ───────────────────────────────────────────────────────────────── */
const TABS = [
  { id: "cost", label: "The real cost" },
  { id: "switch", label: "Switching is painless" },
  { id: "why", label: "Why WeFixTrades" },
  { id: "replace", label: "What you'll replace" },
];

const SWITCH_ITEMS = [
  { stat: "48 hrs", title: "Live in about two days", body: "We set up your AI office, import your services, and go live in roughly 48 hours — you keep working while we build." },
  { stat: "Free", title: "We migrate your data for you", body: "Contacts, service list and pricing come across at no cost. No spreadsheets, no re-typing, no downtime." },
  { stat: "Keep it", title: "Keep your existing number", body: "Number porting is free on every plan — customers keep calling the same line, the AI just answers it now." },
  { stat: "$0 lock-in", title: "Month-to-month, cancel anytime", body: "No annual contract, no implementation fee, no 12-month minimum. Stay because it works, not because you're trapped." },
];

const WHY_CARDS = [
  { title: "Real AI voice, built in", body: "TradeLine answers calls and texts back in under 30 seconds — not a bolt-on receptionist you pay extra for." },
  { title: "One login, one bill", body: "Voice, reviews, Google Maps, social and instant quotes run from a single dashboard — not five tools you reconcile." },
  { title: "Managed for you", body: "We monitor, post, respond and optimise. It's done-for-you, not another app you have to learn and babysit." },
  { title: "Built for trades", body: "Every default — the scripts, the categories, the follow-ups — is tuned for home-services and trades, out of the box." },
];

const REPLACE_MAP = [
  { tool: "Separate AI receptionist", by: "TradeLine — AI call answering + SMS" },
  { tool: "Review-request tool", by: "ReputationShield — automated 5-star reviews" },
  { tool: "Local-SEO / GBP service", by: "MapGuard — managed Google Maps visibility" },
  { tool: "Social scheduler + content", by: "SocialSync — done-for-you posting" },
  { tool: "Quote / estimate widget", by: "QuoteQuick — instant on-site quotes" },
];

export default function CostCompare() {
  const [tab, setTab] = useState("cost");
  const [toolId, setToolId] = useState("jobber");
  const [users, setUsers] = useState(5);

  const competitor = COMPETITORS.find((c) => c.id === toolId) ?? COMPETITORS[0];
  const result = useMemo(() => calc(competitor, users), [competitor, users]);
  const saves = result.monthSavings > 0;

  return (
    <section
      data-testid="cost-compare"
      style={{
        background: INK,
        color: TXT,
        padding: "clamp(56px, 7vw, 90px) clamp(16px, 5vw, 48px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{scoped}</style>

      {/* ambient brand glow — decorative, low-alpha so it never sits behind copy */}
      <div aria-hidden className="wft-cc-glow wft-cc-glow-a" />
      <div aria-hidden className="wft-cc-glow wft-cc-glow-b" />

      <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", zIndex: 1 }}>
        {/* HEADER */}
        <div style={{ textAlign: "center", maxWidth: 780, margin: "0 auto 40px" }}>
          <div className="wft-cc-eyebrow">The math on your tool stack</div>
          <h2 className="wft-cc-h2">
            Stop paying five vendors.<br />
            <em>Run it all for one price.</em>
          </h2>
          <p className="wft-cc-sub">
            Most trades businesses pay for a CRM <em>plus</em> a receptionist, a review tool, a
            Google-Maps service and a social scheduler. See what that stack really costs — and what
            you'd keep by switching to WeFixTrades.
          </p>
        </div>

        {/* TAB BAR */}
        <div className="wft-cc-tabs" role="tablist" aria-label="Cost comparison sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              data-testid={`cc-tab-${t.id}`}
              className={`wft-cc-tab${tab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── PANEL: THE REAL COST (calculator) ── */}
        {tab === "cost" && (
          <div className="wft-cc-calc" data-testid="cc-calc">
            {/* LEFT — controls */}
            <div>
              <h3 className="wft-cc-ctl-h">Currently using</h3>
              <div className="wft-cc-toolgrid">
                {COMPETITORS.map((c) => (
                  <button
                    key={c.id}
                    data-testid={`cc-tool-${c.id}`}
                    aria-pressed={toolId === c.id}
                    className={`wft-cc-toolbtn${toolId === c.id ? " active" : ""}`}
                    onClick={() => setToolId(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 30 }}>
                <h3 className="wft-cc-ctl-h" style={{ marginBottom: 12 }}>Team size</h3>
                <div className="wft-cc-userrow">
                  <span className="wft-cc-users" data-testid="cc-users">{users}</span>
                  <span className="wft-cc-users-sfx">{users === 1 ? "user / tech" : "users / techs"}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={users}
                  data-testid="cc-slider"
                  aria-label="Team size"
                  className="wft-cc-slider"
                  style={{ "--fill": `${((users - 1) / 19) * 100}%` } as CSSProperties}
                  onChange={(e) => setUsers(parseInt(e.target.value, 10))}
                />
                <div className="wft-cc-range"><span>1</span><span>20</span></div>
              </div>

              {competitor.scopeNote && (
                <p className="wft-cc-scopenote">{competitor.scopeNote}</p>
              )}
            </div>

            {/* RIGHT — live breakdown */}
            <div className="wft-cc-output">
              <div className="wft-cc-breakdown" data-testid="cc-breakdown">
                <div className="wft-cc-bd-title">Your {competitor.name} stack to match WeFixTrades</div>
                {result.lines.map((l) => (
                  <div key={l.key} className={`wft-cc-bd-line${l.strong ? " strong" : ""}`}>
                    <span className="wft-cc-bd-lbl">
                      {l.label}
                      {l.sub && <small className="wft-cc-bd-sub">{l.sub}</small>}
                    </span>
                    <span className="wft-cc-bd-amt">${fmt(l.amount)}</span>
                  </div>
                ))}
                <div className="wft-cc-bd-total">
                  <span>Total, every month</span>
                  <span data-testid="cc-current">${fmt(result.current)}</span>
                </div>
                {competitor.footNote && <div className="wft-cc-bd-foot">{competitor.footNote}</div>}
              </div>

              <div className="wft-cc-plan" data-testid="cc-plan">
                <div>
                  <div className="wft-cc-plan-name">{result.wftName}</div>
                  <div className="wft-cc-plan-sub">{result.wftSub}</div>
                </div>
                <div className="wft-cc-plan-price">${fmt(result.wftPrice)}<small>/mo</small></div>
              </div>

              {saves ? (
                <div className="wft-cc-savings" data-testid="cc-savings">
                  <div className="wft-cc-savings-lbl">Your annual savings</div>
                  <div className="wft-cc-savings-num">${fmt(result.yearSavings)}</div>
                  <div className="wft-cc-savings-sub">
                    That's ${fmt(result.monthSavings)}/month staying in your business.
                  </div>
                </div>
              ) : (
                <div className="wft-cc-even" data-testid="cc-savings">
                  <div className="wft-cc-savings-lbl">About the same price</div>
                  <div className="wft-cc-even-num">One office, not five tools</div>
                  <div className="wft-cc-even-sub">
                    Roughly matched on cost — but WeFixTrades runs voice, reviews, maps, social and
                    quotes as one managed AI office, with real AI voice {competitor.name} doesn't include.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PANEL: SWITCHING ── */}
        {tab === "switch" && (
          <div className="wft-cc-switch" data-testid="cc-panel-switch">
            {SWITCH_ITEMS.map((s) => (
              <div key={s.title} className="wft-cc-switch-card">
                <div className="wft-cc-switch-stat">{s.stat}</div>
                <div className="wft-cc-switch-title">{s.title}</div>
                <p className="wft-cc-switch-body">{s.body}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── PANEL: WHY ── */}
        {tab === "why" && (
          <div className="wft-cc-why" data-testid="cc-panel-why">
            {WHY_CARDS.map((c) => (
              <div key={c.title} className="wft-cc-why-card">
                <div className="wft-cc-why-title">{c.title}</div>
                <p className="wft-cc-why-body">{c.body}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── PANEL: WHAT YOU'LL REPLACE ── */}
        {tab === "replace" && (
          <div className="wft-cc-replace" data-testid="cc-panel-replace">
            {REPLACE_MAP.map((r) => (
              <div key={r.tool} className="wft-cc-replace-row">
                <span className="wft-cc-replace-tool">{r.tool}</span>
                <span className="wft-cc-replace-arrow" aria-hidden>→</span>
                <span className="wft-cc-replace-by">{r.by}</span>
              </div>
            ))}
          </div>
        )}

        {/* FOOTER CTA */}
        <div className="wft-cc-cta">
          <p className="wft-cc-cta-text">
            One AI office. One login. One bill. <span>See it on your own numbers.</span>
          </p>
          <div className="wft-cc-cta-btns">
            <Link href="/demo" className="wft-cc-btn wft-cc-btn-primary">Book a demo</Link>
            <Link href="/pricing" className="wft-cc-btn wft-cc-btn-secondary">See pricing</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Scoped styles (unique wft-cc- prefix; no globals) ─────────────────────
 * Readability rule enforced here: totals / savings / line-item text are white
 * or near-white; brand blue appears only in fills, borders, the slider and the
 * savings gradient — never as body/number text on the dark ground. */
const scoped = `
.wft-cc-glow { position:absolute; border-radius:50%; pointer-events:none; filter:blur(20px); z-index:0; }
.wft-cc-glow-a { top:-220px; right:-160px; width:680px; height:680px;
  background:radial-gradient(circle, rgba(47,107,255,0.14) 0%, transparent 62%); }
.wft-cc-glow-b { bottom:-220px; left:-160px; width:560px; height:560px;
  background:radial-gradient(circle, rgba(47,107,255,0.08) 0%, transparent 62%); }
@media (prefers-reduced-motion: reduce) { .wft-cc-glow { display:none; } }

.wft-cc-eyebrow { display:inline-block; font-size:11px; font-weight:700; letter-spacing:0.16em;
  text-transform:uppercase; color:#bcd0ff; margin-bottom:16px;
  padding:6px 14px; border:1px solid rgba(47,107,255,0.4); border-radius:999px;
  background:rgba(47,107,255,0.10); }
.wft-cc-h2 { font-size:clamp(1.9rem, 4.2vw, 2.6rem); font-weight:800; color:${TXT};
  line-height:1.15; letter-spacing:-0.028em; margin:0 0 16px; }
.wft-cc-h2 em { font-style:normal; color:#7fa6ff; }
.wft-cc-sub { font-size:1.05rem; color:${MUTED}; line-height:1.65; margin:0; }
.wft-cc-sub em { font-style:normal; color:#cdd6e6; font-weight:600; }

/* tab bar — active = outline + tint + WHITE text (never a bright-blue fill) */
.wft-cc-tabs { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin:0 auto 32px;
  padding:6px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
  border-radius:14px; max-width:760px; }
.wft-cc-tab { flex:1; min-width:150px; padding:13px 16px; background:transparent; border:1px solid transparent;
  cursor:pointer; font:inherit; font-size:13.5px; font-weight:700; color:${MUTED};
  border-radius:9px; transition:all .18s ease; }
.wft-cc-tab:hover { color:${TXT}; background:rgba(255,255,255,0.05); }
.wft-cc-tab.active { color:${TXT}; background:rgba(47,107,255,0.16); border-color:${BRAND}; }
@media (max-width:600px){ .wft-cc-tab { flex:1 1 calc(50% - 4px); min-width:0; font-size:12.5px; padding:11px 10px; } }

/* calculator grid */
.wft-cc-calc { background:${CARD}; border:1px solid rgba(255,255,255,0.08); border-radius:18px;
  padding:clamp(20px,3vw,36px); display:grid; grid-template-columns:1fr 1fr; gap:clamp(22px,3vw,40px); }
@media (max-width:900px){ .wft-cc-calc { grid-template-columns:1fr; } }

.wft-cc-ctl-h { font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase;
  color:${MUTED}; margin:0 0 12px; }

.wft-cc-toolgrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.wft-cc-toolbtn { padding:14px 12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.12);
  color:#d7deea; font:inherit; font-size:13.5px; font-weight:700; border-radius:11px; cursor:pointer;
  transition:all .18s ease; }
.wft-cc-toolbtn:hover { border-color:rgba(47,107,255,0.5); color:${TXT}; }
.wft-cc-toolbtn.active { background:rgba(47,107,255,0.14); border-color:${BRAND}; color:${TXT}; }

.wft-cc-userrow { display:flex; align-items:baseline; gap:10px; margin-bottom:16px; }
.wft-cc-users { font-size:2.7rem; font-weight:800; color:${TXT}; line-height:1; letter-spacing:-0.04em;
  font-variant-numeric:tabular-nums; }
.wft-cc-users-sfx { font-size:13px; color:${MUTED}; }

.wft-cc-slider { width:100%; -webkit-appearance:none; appearance:none; height:6px;
  background:linear-gradient(90deg, ${BRAND} 0%, ${BRAND} var(--fill,25%), #1f2a3d var(--fill,25%), #1f2a3d 100%);
  border-radius:5px; outline:none; }
.wft-cc-slider::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:22px; height:22px;
  background:${BRAND}; border:2px solid #fff; border-radius:50%; cursor:pointer;
  box-shadow:0 2px 10px rgba(47,107,255,0.5); }
.wft-cc-slider::-moz-range-thumb { width:22px; height:22px; background:${BRAND}; border:2px solid #fff;
  border-radius:50%; cursor:pointer; }
.wft-cc-slider:focus-visible { box-shadow:0 0 0 3px rgba(47,107,255,0.4); }
.wft-cc-range { display:flex; justify-content:space-between; font-size:11px; color:#6b7688; margin-top:8px; }

.wft-cc-scopenote { margin-top:22px; font-size:12.5px; line-height:1.55; color:${MUTED};
  padding:12px 14px; background:rgba(47,107,255,0.06); border-left:2px solid ${BRAND}; border-radius:6px; }

/* right column */
.wft-cc-output { display:flex; flex-direction:column; gap:14px; }
.wft-cc-breakdown { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07);
  border-radius:14px; padding:18px 20px; }
.wft-cc-bd-title { font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase;
  color:${MUTED}; margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.07); }
.wft-cc-bd-line { display:flex; justify-content:space-between; align-items:flex-start; gap:12px;
  font-size:13.5px; color:#cbd3e1; padding:7px 0; }
.wft-cc-bd-line.strong .wft-cc-bd-lbl { color:${TXT}; font-weight:600; }
.wft-cc-bd-lbl { display:flex; flex-direction:column; gap:2px; }
.wft-cc-bd-sub { font-size:11px; color:#7a8598; font-weight:400; }
.wft-cc-bd-amt { color:${TXT}; font-weight:600; white-space:nowrap; font-variant-numeric:tabular-nums; }
.wft-cc-bd-total { display:flex; justify-content:space-between; align-items:center; margin-top:10px;
  padding-top:12px; border-top:1px solid rgba(255,255,255,0.12); font-size:15px; font-weight:800; color:${TXT}; }
.wft-cc-bd-total span:last-child { font-size:1.15rem; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; }
.wft-cc-bd-foot { margin-top:12px; font-size:11.5px; line-height:1.5; color:#8b94a6; font-style:italic; }

.wft-cc-plan { display:flex; justify-content:space-between; align-items:center; gap:16px;
  background:rgba(47,107,255,0.08); border:1px solid rgba(47,107,255,0.35); border-radius:14px; padding:16px 20px; }
.wft-cc-plan-name { font-size:15px; font-weight:800; color:${TXT}; letter-spacing:-0.01em; }
.wft-cc-plan-sub { font-size:12px; color:#aeb9cc; margin-top:3px; line-height:1.4; }
.wft-cc-plan-price { font-size:1.5rem; font-weight:800; color:${TXT}; white-space:nowrap;
  font-variant-numeric:tabular-nums; }
.wft-cc-plan-price small { font-size:0.8rem; color:${MUTED}; font-weight:600; }

.wft-cc-savings { background:linear-gradient(135deg, ${BRAND_DEEP_A} 0%, ${BRAND_DEEP_B} 100%);
  border-radius:16px; padding:24px; text-align:center; box-shadow:0 12px 34px rgba(29,78,216,0.3); }
.wft-cc-savings-lbl { font-size:11px; font-weight:700; color:#dbe6ff; text-transform:uppercase;
  letter-spacing:0.14em; }
.wft-cc-savings-num { font-size:2.5rem; font-weight:900; color:${TXT}; line-height:1; margin-top:6px;
  letter-spacing:-0.03em; font-variant-numeric:tabular-nums; }
.wft-cc-savings-sub { font-size:13px; color:#e4ecff; margin-top:8px; font-weight:600; }

.wft-cc-even { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.10);
  border-radius:16px; padding:24px; text-align:center; }
.wft-cc-even-num { font-size:1.5rem; font-weight:800; color:${TXT}; margin-top:6px; letter-spacing:-0.02em; }
.wft-cc-even-sub { font-size:13px; color:${MUTED}; margin-top:10px; line-height:1.55; }

/* switching panel */
.wft-cc-switch { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px,1fr)); gap:16px; }
.wft-cc-switch-card { background:${CARD}; border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:26px; }
.wft-cc-switch-stat { font-size:1.7rem; font-weight:800; color:#7fa6ff; letter-spacing:-0.02em; }
.wft-cc-switch-title { font-size:1.05rem; font-weight:700; color:${TXT}; margin:12px 0 8px; }
.wft-cc-switch-body { font-size:14px; color:#c2cbda; line-height:1.6; margin:0; }

/* why panel */
.wft-cc-why { display:grid; grid-template-columns:repeat(auto-fit, minmax(240px,1fr)); gap:16px; }
.wft-cc-why-card { background:${CARD}; border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:26px; }
.wft-cc-why-title { font-size:1.05rem; font-weight:800; color:${TXT}; letter-spacing:-0.01em; }
.wft-cc-why-body { font-size:14px; color:#c2cbda; line-height:1.6; margin:10px 0 0; }

/* replace panel */
.wft-cc-replace { display:flex; flex-direction:column; gap:10px; max-width:820px; margin:0 auto; }
.wft-cc-replace-row { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:16px;
  background:${CARD}; border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:16px 20px; }
.wft-cc-replace-tool { font-size:14px; color:${MUTED}; text-align:right; }
.wft-cc-replace-arrow { color:#7fa6ff; font-weight:700; }
.wft-cc-replace-by { font-size:14px; color:${TXT}; font-weight:600; }
@media (max-width:600px){
  .wft-cc-replace-row { grid-template-columns:1fr; gap:6px; text-align:center; }
  .wft-cc-replace-tool { text-align:center; }
  .wft-cc-replace-arrow { transform:rotate(90deg); }
}

/* footer CTA */
.wft-cc-cta { margin-top:32px; padding:24px 28px; background:rgba(255,255,255,0.03);
  border:1px solid rgba(255,255,255,0.08); border-radius:16px; display:flex; align-items:center;
  justify-content:space-between; gap:20px; flex-wrap:wrap; }
.wft-cc-cta-text { font-size:1.05rem; font-weight:700; color:${TXT}; margin:0; line-height:1.4;
  flex:1; min-width:240px; }
.wft-cc-cta-text span { color:#7fa6ff; }
.wft-cc-cta-btns { display:flex; gap:12px; flex-wrap:wrap; }
.wft-cc-btn { display:inline-flex; align-items:center; justify-content:center; font-size:14px; font-weight:700;
  padding:13px 26px; border-radius:10px; text-decoration:none; white-space:nowrap; transition:all .18s ease;
  cursor:pointer; }
.wft-cc-btn-primary { background:${BRAND}; color:#fff; box-shadow:0 6px 20px rgba(47,107,255,0.32); }
.wft-cc-btn-primary:hover { background:#1f5cf5; transform:translateY(-2px); }
.wft-cc-btn-secondary { background:rgba(255,255,255,0.06); color:${TXT}; border:1px solid rgba(255,255,255,0.18); }
.wft-cc-btn-secondary:hover { background:rgba(255,255,255,0.12); transform:translateY(-2px); }
`;
