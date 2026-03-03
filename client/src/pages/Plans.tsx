import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { useToast } from "@/hooks/use-toast";

type Currency = "CAD" | "USD";
type Billing = "monthly" | "yearly";

const FX_CAD_TO_USD = 0.74;

function formatMoney(amount: number, currency: Currency) {
  const rounded = Math.round(amount);
  const symbol = currency === "CAD" ? "CA$" : "$";
  return `${symbol}${rounded.toLocaleString()}`;
}

function convertFromCAD(cad: number, currency: Currency) {
  return currency === "CAD" ? cad : cad * FX_CAD_TO_USD;
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY - 120;
  window.scrollTo({ top: y, behavior: "smooth" });
}

function TogglePill({
  left,
  right,
  value,
  onChange,
}: {
  left: { label: string; value: string };
  right: { label: string; value: string };
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      data-testid={`toggle-${left.value}-${right.value}`}
      style={{
        display: "inline-flex",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(255,255,255,0.70)",
        backdropFilter: "blur(12px)",
        padding: 4,
        boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
      }}
    >
      {[left, right].map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            data-testid={`toggle-option-${o.value}`}
            onClick={() => onChange(o.value)}
            style={{
              padding: "0 14px",
              height: 36,
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              transition: "all 0.18s ease",
              background: active ? "#102126" : "transparent",
              color: active ? "#FFFFFF" : "rgba(0,0,0,0.65)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionTabs({
  activeId,
  onPick,
}: {
  activeId: string;
  onPick: (id: string) => void;
}) {
  const tabs = [
    { id: "bundles", label: "Bundles" },
    { id: "standalone", label: "Standalone" },
    { id: "setup", label: "Setup Fees" },
    { id: "addons", label: "Add-ons" },
    { id: "faq", label: "FAQ" },
  ];

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {tabs.map((t) => {
        const active = activeId === t.id;
        return (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => onPick(t.id)}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 700,
              border: active ? "1px solid #0C67FF" : "1px solid rgba(0,0,0,0.10)",
              cursor: "pointer",
              transition: "all 0.18s ease",
              background: active ? "#0C67FF" : "rgba(255,255,255,0.60)",
              color: active ? "#FFFFFF" : "rgba(0,0,0,0.65)",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function BundleCard({
  title,
  subtitle,
  badge,
  priceLine,
  note,
  bullets,
  freeIncludes,
  cta,
  onCta,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  priceLine: React.ReactNode;
  note?: string;
  bullets: string[];
  freeIncludes?: string[];
  cta: string;
  onCta: () => void;
}) {
  return (
    <div
      data-testid={`card-${title.replace(/[™\s]+/g, "-").toLowerCase()}`}
      style={{
        position: "relative",
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(255,255,255,0.70)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 18px 60px rgba(15,23,42,0.08)",
        padding: "24px 28px",
      }}
    >
      {badge && (
        <div style={{ position: "absolute", top: -12, left: 24 }}>
          <span
            data-testid="badge-most-popular"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 28,
              padding: "0 14px",
              borderRadius: 999,
              background: "#0C67FF",
              color: "#FFFFFF",
              fontSize: 12,
              fontWeight: 800,
              boxShadow: "0 10px 26px rgba(12,103,255,0.35)",
            }}
          >
            {badge}
          </span>
        </div>
      )}

      <div style={{ fontSize: 20, fontWeight: 800, color: "rgba(0,0,0,0.90)" }}>{title}</div>
      {subtitle && <div style={{ marginTop: 4, fontSize: 14, color: "rgba(0,0,0,0.55)" }}>{subtitle}</div>}

      <div style={{ marginTop: 16 }}>{priceLine}</div>
      {note && <div style={{ marginTop: 4, fontSize: 12, color: "rgba(0,0,0,0.45)" }}>{note}</div>}

      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(0,0,0,0.70)" }}>Includes</div>
        <ul style={{ marginTop: 12, listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ display: "flex", gap: 8, fontSize: 14, color: "rgba(0,0,0,0.60)" }}>
              <span style={{ marginTop: 6, width: 8, height: 8, borderRadius: "50%", background: "rgba(12,103,255,0.55)", flexShrink: 0 }} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {freeIncludes && freeIncludes.length > 0 && (
        <div style={{ marginTop: 20, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.60)", padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(0,0,0,0.70)" }}>Free Included</div>
          <ul style={{ marginTop: 12, listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {freeIncludes.map((b, i) => (
              <li key={i} style={{ display: "flex", gap: 8, fontSize: 14, color: "rgba(0,0,0,0.60)" }}>
                <span style={{ marginTop: 6, width: 8, height: 8, borderRadius: "50%", background: "rgba(16,185,129,0.55)", flexShrink: 0 }} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onCta}
        data-testid={`cta-${title.replace(/[™\s]+/g, "-").toLowerCase()}`}
        style={{
          marginTop: 24,
          height: 44,
          width: "100%",
          borderRadius: 14,
          background: "#102126",
          color: "#FFFFFF",
          fontWeight: 700,
          fontSize: 14,
          border: "none",
          cursor: "pointer",
          transition: "filter 0.15s ease",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(1.12)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(1)"; }}
      >
        {cta}
      </button>
    </div>
  );
}

function SmallCard({
  title,
  price,
  cadence,
  bullets,
  cta,
  onCta,
  note,
}: {
  title: string;
  price: React.ReactNode;
  cadence?: string;
  bullets: string[];
  cta: string;
  onCta: () => void;
  note?: string;
}) {
  return (
    <div
      data-testid={`card-${title.replace(/[™\s]+/g, "-").toLowerCase()}`}
      style={{
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(255,255,255,0.70)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 14px 45px rgba(15,23,42,0.06)",
        padding: 24,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, color: "rgba(0,0,0,0.90)" }}>{title}</div>
      <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "rgba(0,0,0,0.90)" }}>{price}</div>
        {cadence && <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(0,0,0,0.45)" }}>{cadence}</div>}
      </div>
      {note && <div style={{ marginTop: 4, fontSize: 12, color: "rgba(0,0,0,0.45)" }}>{note}</div>}
      <ul style={{ marginTop: 16, listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {bullets.map((b, i) => (
          <li key={i} style={{ display: "flex", gap: 8, fontSize: 14, color: "rgba(0,0,0,0.60)" }}>
            <span style={{ marginTop: 6, width: 8, height: 8, borderRadius: "50%", background: "rgba(12,103,255,0.55)", flexShrink: 0 }} />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={onCta}
        style={{
          marginTop: 20,
          height: 40,
          width: "100%",
          borderRadius: 14,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(255,255,255,0.60)",
          color: "rgba(0,0,0,0.75)",
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
          transition: "background 0.15s ease",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.85)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.60)"; }}
      >
        {cta}
      </button>
    </div>
  );
}

function PlanAccordion({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.60)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid={`faq-${q.slice(0, 20).replace(/[^a-zA-Z]+/g, "-").toLowerCase()}`}
        style={{
          width: "100%",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(0,0,0,0.80)" }}>{q}</div>
        <div style={{ color: "rgba(0,0,0,0.45)", fontWeight: 800, fontSize: 18, flexShrink: 0 }}>{open ? "–" : "+"}</div>
      </button>
      {open && (
        <div style={{ padding: "0 20px 16px", fontSize: 14, color: "rgba(0,0,0,0.55)", lineHeight: 1.7 }}>
          {a}
        </div>
      )}
    </div>
  );
}

export default function Plans() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const params = new URLSearchParams(searchString);
  const initialCurrency = (params.get("currency") as Currency) || "CAD";
  const initialBilling = (params.get("billing") as Billing) || "monthly";

  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [billing, setBilling] = useState<Billing>(initialBilling);
  const [activeTab, setActiveTab] = useState("bundles");

  useEffect(() => {
    const p = new URLSearchParams();
    p.set("currency", currency);
    p.set("billing", billing);
    setLocation(`/plans?${p.toString()}`, { replace: true });
  }, [currency, billing]);

  useEffect(() => {
    const ids = ["bundles", "standalone", "setup", "addons", "faq"];
    const onScroll = () => {
      const y = window.scrollY + 140;
      let current = "bundles";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.offsetTop <= y) current = id;
      }
      setActiveTab(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const showToast = () => {
    toast({ title: "Checkout coming next", description: "We're building this feature right now." });
  };

  const bundleMonthlyCAD = { starter: 249, growth: 449, authority: 649 };
  const bundleYearlyTotalCAD = (monthlyCAD: number) => monthlyCAD * 12 * 0.85;

  const priceLineBundle = (monthlyCAD: number) => {
    const monthly = convertFromCAD(monthlyCAD, currency);
    const yearly = convertFromCAD(bundleYearlyTotalCAD(monthlyCAD), currency);

    if (billing === "yearly") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: "rgba(0,0,0,0.90)" }}>{formatMoney(yearly, currency)}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(0,0,0,0.45)" }}>/yr</div>
          </div>
          <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>
            Save 15% billed annually · {formatMoney(monthly, currency)}/mo equivalent
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: "rgba(0,0,0,0.90)" }}>{formatMoney(monthly, currency)}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(0,0,0,0.45)" }}>/mo</div>
      </div>
    );
  };

  const oneTime = (cad: number) => formatMoney(convertFromCAD(cad, currency), currency);

  return (
    <MarketingLayout>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 60px" }}>
        <div
          data-testid="plans-hero"
          style={{
            borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.08)",
            background: "rgba(255,255,255,0.70)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 18px 60px rgba(15,23,42,0.08)",
            padding: "28px 32px",
          }}
        >
          <h1 style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 800, letterSpacing: "-0.03em", color: "rgba(0,0,0,0.90)", margin: 0 }}>
            Plans that run in the background
          </h1>
          <p style={{ marginTop: 12, fontSize: 17, color: "rgba(0,0,0,0.55)", maxWidth: 560 }}>
            Clear pricing. Simple setup. Built for busy trade businesses that want more booked jobs.
          </p>
          <div style={{ marginTop: 12, fontSize: 12, color: "rgba(0,0,0,0.40)" }}>
            FX estimate used for USD toggle.
          </div>
        </div>

        <div
          data-testid="plans-sticky-bar"
          style={{
            position: "sticky",
            top: 12,
            zIndex: 80,
            marginTop: 24,
          }}
        >
          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "rgba(255,255,255,0.65)",
              backdropFilter: "blur(16px)",
              boxShadow: "0 18px 60px rgba(15,23,42,0.10)",
              padding: "12px 16px",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                <TogglePill
                  left={{ label: "CAD", value: "CAD" }}
                  right={{ label: "USD", value: "USD" }}
                  value={currency}
                  onChange={(v) => setCurrency(v as Currency)}
                />
                <TogglePill
                  left={{ label: "Monthly", value: "monthly" }}
                  right={{ label: "Yearly", value: "yearly" }}
                  value={billing}
                  onChange={(v) => setBilling(v as Billing)}
                />
              </div>
              <SectionTabs activeId={activeTab} onPick={(id) => { setActiveTab(id); scrollToId(id); }} />
            </div>
          </div>
        </div>

        <section id="bundles" style={{ marginTop: 40, scrollMarginTop: 128 }}>
          <h2 style={{ fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 800, color: "rgba(0,0,0,0.90)", margin: 0 }}>Bundles</h2>
          <p style={{ marginTop: 8, fontSize: 14, color: "rgba(0,0,0,0.50)" }}>Best value. Everything works together.</p>

          <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            <BundleCard
              title="TradeStarter™"
              subtitle="For small trades who just need more calls."
              priceLine={priceLineBundle(bundleMonthlyCAD.starter)}
              note={billing === "yearly" ? "Save 15% billed annually" : undefined}
              bullets={["AI ChatLine™ ($149)", "MapGuard™ Ongoing ($99)", "ReputationShield™ Basic ($79)"]}
              freeIncludes={["MapGuard™ Setup ($299 value)", "7-day TradeLine trial"]}
              cta="Choose Starter"
              onCta={showToast}
            />
            <BundleCard
              title="TradeGrowth™"
              badge="Most Popular"
              subtitle="Full lead + visibility system."
              priceLine={priceLineBundle(bundleMonthlyCAD.growth)}
              note={billing === "yearly" ? "Save 15% billed annually" : undefined}
              bullets={["TradeLine™ Complete ($299)", "MapGuard™ Ongoing ($99)", "ReputationShield™ Pro ($149)", "QuoteQuick Pro™ Template ($39)"]}
              freeIncludes={["MapGuard™ Setup ($299 value)", "QuoteQuick setup ($199 value)", "7-day TradeLine trial"]}
              cta="Choose Growth"
              onCta={showToast}
            />
            <BundleCard
              title="TradeAuthority™"
              subtitle="Complete online presence engine."
              priceLine={priceLineBundle(bundleMonthlyCAD.authority)}
              note={billing === "yearly" ? "Save 15% billed annually" : undefined}
              bullets={["TradeLine™ Complete", "MapGuard™ Ongoing", "ReputationShield™ Pro", "SocialSync™ Lite", "QuoteQuick Pro™ Template"]}
              freeIncludes={["MapGuard™ Setup", "QuoteQuick setup", "SocialSync onboarding", "WebBoost™ one-time optimization"]}
              cta="Choose Authority"
              onCta={showToast}
            />
            <BundleCard
              title="TradeLaunch™"
              subtitle="New business launch kit."
              priceLine={
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontSize: 30, fontWeight: 800, color: "rgba(0,0,0,0.90)" }}>{oneTime(1399)}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(0,0,0,0.45)" }}>one-time</div>
                </div>
              }
              bullets={["SiteLaunch™ Basic ($999)", "MapGuard™ Setup ($299)", "WebBoost™ Setup ($399)", "1 month TradeLine™ Core FREE"]}
              cta="Choose Launch"
              onCta={showToast}
            />
          </div>
        </section>

        <section id="standalone" style={{ marginTop: 56, scrollMarginTop: 128 }}>
          <h2 style={{ fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 800, color: "rgba(0,0,0,0.90)", margin: 0 }}>Standalone</h2>
          <p style={{ marginTop: 8, fontSize: 14, color: "rgba(0,0,0,0.50)" }}>Pick exactly what you need. Add more later.</p>

          <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            <SmallCard title="AI ChatLine™" price={formatMoney(convertFromCAD(149, currency), currency)} cadence="/mo" bullets={["Website chat", "SMS lead capture", "Basic qualification"]} cta="Add to Plan" onCta={showToast} />
            <SmallCard title="AI CallLine™" price={formatMoney(convertFromCAD(199, currency), currency)} cadence="/mo" bullets={["24/7 call answering", "Call summaries", "Lead capture + SMS/email alerts"]} cta="Add to Plan" onCta={showToast} />
            <SmallCard title="TradeLine™ Complete" price={formatMoney(convertFromCAD(299, currency), currency)} cadence="/mo" bullets={["Chat + Voice + FB/IG DMs", "Unified lead capture", "Notifications"]} cta="Add to Plan" onCta={showToast} />

            <SmallCard title="MapGuard™ Setup" price={oneTime(299)} cadence="one-time" bullets={["Profile cleanup", "Category optimization", "NAP basics"]} cta="Add to Plan" onCta={showToast} />
            <SmallCard title="MapGuard™ Ongoing" price={formatMoney(convertFromCAD(99, currency), currency)} cadence="/mo" bullets={["Monitoring", "Minor updates", "Monthly report"]} cta="Add to Plan" onCta={showToast} />

            <SmallCard title="ReputationShield™ Basic" price={formatMoney(convertFromCAD(79, currency), currency)} cadence="/mo" bullets={["Review monitoring", "Assisted responses", "Monthly summary"]} cta="Add to Plan" onCta={showToast} />
            <SmallCard title="ReputationShield™ Pro" price={formatMoney(convertFromCAD(149, currency), currency)} cadence="/mo" bullets={["Growth structure", "Priority response system", "Negative review handling guidance"]} cta="Add to Plan" onCta={showToast} />

            <SmallCard title="WebBoost™ Setup" price={oneTime(399)} cadence="one-time" bullets={["Speed cleanup", "Technical SEO cleanup", "Core fixes"]} cta="Add to Plan" onCta={showToast} />
            <SmallCard title="WebBoost™ Care" price={formatMoney(convertFromCAD(79, currency), currency)} cadence="/mo" bullets={["Monitoring", "Performance checks", "Minor SEO adjustments"]} cta="Add to Plan" onCta={showToast} />
            <SmallCard title="WebBoost™ Care Pro" price={formatMoney(convertFromCAD(149, currency), currency)} cadence="/mo" bullets={["Full technical upkeep", "Ongoing SEO tuning", "Priority fixes"]} cta="Add to Plan" onCta={showToast} />

            <SmallCard title="QuoteQuick Pro™ Template" price={formatMoney(convertFromCAD(39, currency), currency)} cadence="/mo" note={`+ ${oneTime(199)} setup`} bullets={["Prebuilt trade templates", "Embed on site", "Basic customization"]} cta="Add to Plan" onCta={showToast} />
            <SmallCard title="QuoteQuick Pro™ Custom" price={`${oneTime(999)}–${oneTime(1999)}`} cadence="one-time" bullets={["Fully customized wizard", "Your logic & pricing", "Hosted + embed"]} cta="Add to Plan" onCta={showToast} />

            <SmallCard title="SocialSync™ Lite" price={formatMoney(convertFromCAD(299, currency), currency)} cadence="/mo" bullets={["Automated posts", "1–2 platforms", "Scheduling"]} cta="Add to Plan" onCta={showToast} />
            <SmallCard title="SocialSync™ Pro" price={formatMoney(convertFromCAD(499, currency), currency)} cadence="/mo" bullets={["3 platforms", "Light engagement", "Monthly performance summary"]} cta="Add to Plan" onCta={showToast} />

            <SmallCard title="SiteLaunch™ Basic" price={oneTime(999)} cadence="one-time" bullets={["Clean 1–3 pages", "Mobile-first", "Lead capture"]} cta="Add to Plan" onCta={showToast} />
            <SmallCard title="SiteLaunch™ Standard" price={oneTime(1499)} cadence="one-time" bullets={["More pages", "Better structure", "Conversion sections"]} cta="Add to Plan" onCta={showToast} />
            <SmallCard title="SiteLaunch™ Pro" price={oneTime(2499)} cadence="one-time" bullets={["Full build", "Best layout", "Advanced sections"]} cta="Add to Plan" onCta={showToast} />

            <SmallCard title="Fix & Optimize™" price={oneTime(399)} cadence="one-time" bullets={["Website + Google profile quick fixes", "Priority cleanup", "Fast turnaround"]} cta="Add to Plan" onCta={showToast} />
          </div>
        </section>

        <section id="setup" style={{ marginTop: 56, scrollMarginTop: 128 }}>
          <h2 style={{ fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 800, color: "rgba(0,0,0,0.90)", margin: 0 }}>Setup Fees</h2>
          <p style={{ marginTop: 8, fontSize: 14, color: "rgba(0,0,0,0.50)" }}>Clear one-time costs for transparency.</p>

          <div
            style={{
              marginTop: 20,
              borderRadius: 14,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "rgba(255,255,255,0.70)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 18px 60px rgba(15,23,42,0.08)",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              {[
                ["MapGuard Setup", oneTime(299)],
                ["QuoteQuick Setup (Template)", oneTime(199)],
                ["WebBoost Setup", oneTime(399)],
                ["Fix & Optimize", oneTime(399)],
              ].map(([name, val], i) => (
                <div
                  key={name}
                  style={{
                    padding: "20px 24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: i < 2 ? "1px solid rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(0,0,0,0.75)" }}>{name}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "rgba(0,0,0,0.80)" }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="addons" style={{ marginTop: 56, scrollMarginTop: 128 }}>
          <h2 style={{ fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 800, color: "rgba(0,0,0,0.90)", margin: 0 }}>Add-ons</h2>
          <p style={{ marginTop: 8, fontSize: 14, color: "rgba(0,0,0,0.50)" }}>Optional extras (pricing coming soon).</p>

          <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {["Extra SMS pack", "Extra call minutes", "Additional location", "Additional social platform", "Extra template pack"].map((t) => (
              <div
                key={t}
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(0,0,0,0.08)",
                  background: "rgba(255,255,255,0.70)",
                  backdropFilter: "blur(12px)",
                  boxShadow: "0 14px 45px rgba(15,23,42,0.06)",
                  padding: 24,
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 800, color: "rgba(0,0,0,0.90)" }}>{t}</div>
                <div style={{ marginTop: 8, fontSize: 14, color: "rgba(0,0,0,0.50)" }}>TBD</div>
                <div
                  style={{
                    marginTop: 16,
                    display: "inline-flex",
                    alignItems: "center",
                    height: 28,
                    padding: "0 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(0,0,0,0.08)",
                    background: "rgba(255,255,255,0.60)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "rgba(0,0,0,0.55)",
                  }}
                >
                  Coming soon
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" style={{ marginTop: 56, scrollMarginTop: 128 }}>
          <h2 style={{ fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 800, color: "rgba(0,0,0,0.90)", margin: 0 }}>FAQ</h2>
          <p style={{ marginTop: 8, fontSize: 14, color: "rgba(0,0,0,0.50)" }}>Quick answers. No surprises.</p>

          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
            <PlanAccordion q="Is there a contract?" a="No contracts. You can cancel anytime. Policy details will be finalized." />
            <PlanAccordion q="Can I cancel anytime?" a="Yes. Plans can be paused or canceled anytime. Billing rules will be shown in checkout later." />
            <PlanAccordion q="Do you offer a trial?" a="Yes — bundles include a 7-day TradeLine trial where listed." />
            <PlanAccordion q="Do I need technical skills?" a="No. Setup is guided. If you can copy/paste, you're good." />
            <PlanAccordion q="Can I upgrade/downgrade anytime?" a="Yes. You can switch plans anytime. The exact proration rules will be handled in checkout later." />
            <PlanAccordion q="Do you support both Canada and USA?" a="Yes. We support service businesses in Canada and the USA." />
            <PlanAccordion q="How fast can I go live?" a="Many setups can go live within days, depending on what you choose." />
            <PlanAccordion q='What counts as "setup" vs "monthly"?' a="Setup = one-time configuration/optimization work. Monthly = ongoing system operation, monitoring, and maintenance." />
            <PlanAccordion q="What if I already have a website?" a="No problem. We can optimize or add modules without rebuilding from scratch." />
            <PlanAccordion q="Do you offer refunds?" a="Refund policy placeholder — will be finalized in Terms before launch." />
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
