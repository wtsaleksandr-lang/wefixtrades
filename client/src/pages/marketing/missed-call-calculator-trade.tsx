import { useEffect, useMemo } from 'react';
import { useParams, Redirect } from 'wouter';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import MissedCallCalculatorShell from '@/components/marketing/missed-call-calculator/MissedCallCalculatorShell';
import FAQSection from '@/components/marketing/missed-call-calculator/FAQSection';
import { Link } from 'wouter';
import { mkt, colors } from '@/theme/tokens';
import { getPresetById, TRADE_PRESETS } from '@/data/missedCallTradePresets';
import { Search, Calculator, ArrowRight } from 'lucide-react';

/* ─── Trade-specific content ─── */

const TRADE_CONTENT: Record<string, {
  intro: string[];
  h1Suffix: string;
}> = {
  plumbing: {
    h1Suffix: "Plumbing",
    intro: [
      "When a homeowner has a burst pipe or a backed-up drain, they call the first plumber they find. If you don't answer, they call the next one. In plumbing, missed calls don't leave voicemails — they leave with your competitor.",
      "The average plumbing job is worth $300–$900, and most plumbing businesses miss 8–15 calls per week. That adds up fast, especially during evenings and weekends when emergencies peak.",
    ],
  },
  hvac: {
    h1Suffix: "HVAC",
    intro: [
      "A broken furnace in January or a dead AC unit in July isn't something homeowners will wait around for. HVAC calls are time-sensitive — if you don't pick up, customers move on immediately.",
      "With average job values between $300 and $3,000 and seasonal demand spikes, even a handful of missed calls per week can mean thousands in lost revenue for your HVAC business.",
    ],
  },
  electrical: {
    h1Suffix: "Electrical",
    intro: [
      "Electrical problems worry homeowners — flickering lights, tripped breakers, and outlet issues feel urgent. When they call an electrician, they want someone available now, not a voicemail.",
      "Electricians typically close 25–35% of inbound calls into booked work. Every unanswered call is a job that goes to someone who picked up the phone.",
    ],
  },
  roofing: {
    h1Suffix: "Roofing",
    intro: [
      "Roofing leads are high-value — a single job can range from $5,000 to $25,000. When a homeowner finds a leak or storm damage, they're calling multiple roofers and going with whoever responds first.",
      "Roofing businesses that miss even a few calls per week can lose tens of thousands in revenue. The math is simple: fewer answered calls means fewer booked jobs.",
    ],
  },
  cleaning: {
    h1Suffix: "Cleaning",
    intro: [
      "Cleaning clients are often booking recurring services — a single missed call doesn't just lose one job, it loses a long-term customer. Move-out cleans, deep cleans, and regular maintenance all start with a phone call.",
      "House cleaning businesses typically see 12–18 inbound calls per week. With a 40% close rate and average jobs of $150–$400, missed calls quietly drain thousands from your annual revenue.",
    ],
  },
  landscaping: {
    h1Suffix: "Landscaping",
    intro: [
      "Landscaping is seasonal — when spring hits, everyone calls at once. If your phone goes unanswered during peak season, those leads don't call back. They find someone else who's available.",
      "With average jobs worth $200–$1,500 and a typical close rate of 30–40%, landscaping businesses that miss 10+ calls per week are leaving significant revenue on the table.",
    ],
  },
};

/* ─── Valid trade slugs for URL ─── */

const VALID_TRADE_SLUGS = new Set(
  TRADE_PRESETS.filter(p => p.id !== 'other').map(p => p.id)
);

/* ─── Slug normalization (URL-friendly → preset ID) ─── */

function normalizeTradeSlug(slug: string): string {
  // Handle URL-friendly versions: "house-cleaning" → "house_cleaning"
  return slug.replace(/-/g, '_');
}

/* ─── Page Component ─── */

export default function MissedCallCalculatorTrade() {
  const params = useParams<{ trade: string }>();
  const rawSlug = params.trade || '';
  const tradeId = normalizeTradeSlug(rawSlug);
  const preset = getPresetById(tradeId);
  const isValid = preset.id === tradeId && VALID_TRADE_SLUGS.has(tradeId);

  // If invalid trade, redirect to generic calculator
  if (!isValid) {
    return <Redirect to="/tools/missed-call-calculator" />;
  }

  const content = TRADE_CONTENT[tradeId];
  const label = preset.label;

  // SEO meta
  useEffect(() => {
    document.title = `${label} Missed Call Revenue Calculator | WeFixTrades`;
    const setMeta = (name: string, val: string) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) { el = document.createElement("meta"); (el as HTMLMetaElement).name = name; document.head.appendChild(el); }
      el.setAttribute("content", val);
    };
    setMeta("description", `See how much missed calls are costing your ${label.toLowerCase()} business. Free calculator with instant results.`);
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = `${window.location.origin}/tools/missed-call-calculator/${rawSlug}`;
  }, [label, rawSlug]);

  return (
    <MarketingLayout>
      <section style={{
        background: mkt.bg,
        minHeight: '100vh',
        padding: 'clamp(100px, 12vw, 140px) clamp(16px, 5vw, 40px) clamp(48px, 8vw, 80px)',
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          {/* SEO H1 */}
          <h1 style={{
            fontSize: 'clamp(24px, 4.5vw, 36px)',
            fontWeight: 700,
            color: colors.effortel.n300,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            margin: '0 0 20px',
            textAlign: 'center',
          }}>
            How Much Are Missed Calls Costing Your {label} Business?
          </h1>

          {/* Trade-specific intro content */}
          {content && (
            <div style={{ marginBottom: 32 }}>
              {content.intro.map((para, i) => (
                <p key={i} style={{
                  fontSize: 15,
                  color: mkt.textMuted,
                  lineHeight: 1.7,
                  margin: i === 0 ? '0 0 14px' : '0 0 14px',
                  textAlign: 'center',
                  maxWidth: 560,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}>
                  {para}
                </p>
              ))}
            </div>
          )}

          {/* Calculator — auto-selects this trade */}
          <MissedCallCalculatorShell initialTradeId={tradeId} />

          {/* Internal links */}
          <div style={{
            marginTop: 'clamp(32px, 6vw, 48px)',
            paddingTop: 24,
            borderTop: `1px solid ${mkt.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: mkt.textMuted, marginBottom: 4 }}>
              More free tools
            </div>
            {[
              {
                href: "/tools/free-audit",
                icon: Search,
                title: "Free Google Maps & Website Audit",
                desc: `See how your ${label.toLowerCase()} business ranks online`,
              },
              {
                href: "/tools/quote-demo",
                icon: Calculator,
                title: "Instant Quote Demo",
                desc: "Let customers get prices on your website",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 12,
                    border: `1px solid ${mkt.border}`, background: mkt.bg,
                    cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = mkt.border; e.currentTarget.style.background = mkt.bg; }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: mkt.accentTint,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Icon size={16} color={mkt.accent} strokeWidth={1.8} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 650, color: mkt.text }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: mkt.textFaint }}>{item.desc}</div>
                    </div>
                    <ArrowRight size={14} color={mkt.textFaint} style={{ flexShrink: 0 }} />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* FAQ */}
          <div style={{
            marginTop: 'clamp(32px, 6vw, 48px)',
            borderTop: `1px solid ${mkt.border}`,
            paddingTop: 'clamp(24px, 4vw, 40px)',
          }}>
            <FAQSection />
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
