import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, X, Star, Shield, Zap, DollarSign, ChevronDown } from "lucide-react";
import { Link } from "wouter";

function Check() {
  return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
}
function No() {
  return <X className="w-4 h-4 text-gray-300 shrink-0" />;
}

const COMPARISON_ROWS: { feature: string; us: boolean | string; them: boolean | string }[] = [
  { feature: "Automated review requests (SMS + email)", us: true, them: true },
  { feature: "SMS as default channel (3-5x higher response rate)", us: true, them: true },
  { feature: "Follow-up reminders", us: true, them: true },
  { feature: "Private feedback shield (catches complaints before Google)", us: true, them: true },
  { feature: "Google + Facebook review routing", us: true, them: "Google + Facebook" },
  { feature: "Review monitoring + instant alerts", us: true, them: true },
  { feature: "Low-rating alert emails", us: true, them: false },
  { feature: "AI-drafted review responses", us: true, them: false },
  { feature: "Post responses directly to Google", us: true, them: false },
  { feature: "Review widget (badge + carousel)", us: true, them: true },
  { feature: "QR code for field collection", us: true, them: false },
  { feature: "Portal manual review requests", us: true, them: false },
  { feature: "Monthly reputation reports", us: true, them: true },
  { feature: "Source tracking (post-job, manual, QR)", us: true, them: false },
  { feature: "Competitor review tracking", us: "Scale plan", them: false },
  { feature: "Transparent pricing (no sales call)", us: true, them: true },
  { feature: "No long-term contracts", us: true, them: true },
  { feature: "Built specifically for trades businesses", us: true, them: "Home services focus" },
];

export default function CompareNiceJob() {
  useEffect(() => {
    document.title = "ReputationShield vs NiceJob — Review Management for Trades | WeFixTrades";
    const metaDesc = document.querySelector('meta[name="description"]');
    const content = "Compare ReputationShield vs NiceJob for trades businesses. AI response drafting, Google posting, private feedback shield, and transparent pricing from $79/mo. No contracts.";
    if (metaDesc) { metaDesc.setAttribute("content", content); }
    else { const m = document.createElement("meta"); m.name = "description"; m.content = content; document.head.appendChild(m); }
  }, []);

  return (
    <MarketingLayout>
      <div data-theme="light" style={{ maxWidth: 880, margin: "0 auto", padding: "60px 20px 80px" }}>
        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#0d3cfc", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
            Comparison
          </p>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, color: "#1a1a2e", lineHeight: 1.1, marginBottom: 16 }}>
            ReputationShield vs NiceJob
          </h1>
          <p style={{ fontSize: 17, color: "#6B7280", maxWidth: 600, margin: "0 auto", lineHeight: 1.6 }}>
            Both help trades businesses get more reviews. Here's where ReputationShield goes further — at the same price point.
          </p>
          {/* Compact stats */}
          <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 24, flexWrap: "wrap" }}>
            {[
              { value: "340+", label: "businesses" },
              { value: "4.2x", label: "review growth" },
              { value: "93%", label: "complaints caught privately" },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#0d3cfc" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Key differentiators */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 48 }}>
          <Card className="p-5">
            <Zap className="w-5 h-5 text-amber-500 mb-2" />
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", marginBottom: 4 }}>AI Response Drafts</h3>
            <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>NiceJob has no AI. We draft professional responses in seconds — with tone control for positive, negative, or neutral reviews.</p>
          </Card>
          <Card className="p-5">
            <Shield className="w-5 h-5 text-violet-500 mb-2" />
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", marginBottom: 4 }}>Post to Google</h3>
            <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>On our Scale plan, post AI-drafted responses directly to Google. No copy-paste. NiceJob doesn't offer this.</p>
          </Card>
          <Card className="p-5">
            <Star className="w-5 h-5 text-blue-500 mb-2" />
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", marginBottom: 4 }}>QR Field Collection</h3>
            <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>Generate a QR code your techs can show after every job. Customer scans, leaves a review. No app needed. NiceJob doesn't have this.</p>
          </Card>
          <Card className="p-5">
            <DollarSign className="w-5 h-5 text-emerald-500 mb-2" />
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", marginBottom: 4 }}>Same Price, More Features</h3>
            <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>NiceJob starts at $75/mo. ReputationShield starts at $79/mo — with AI responses, QR codes, low-rating alerts, and Google posting included at higher tiers.</p>
          </Card>
        </div>

        {/* Comparison table */}
        <Card className="overflow-hidden mb-12">
          <p className="text-[11px] text-gray-400 px-4 pt-2 sm:hidden">Scroll right to see all columns →</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                  <th style={{ textAlign: "left", padding: "14px 16px", color: "#6B7280", fontWeight: 500 }}>Feature</th>
                  <th style={{ textAlign: "center", padding: "14px 16px", color: "#1a1a2e", fontWeight: 700, background: "#F0FFF4", minWidth: 140 }}>ReputationShield</th>
                  <th style={{ textAlign: "center", padding: "14px 16px", color: "#6B7280", fontWeight: 600, minWidth: 120 }}>NiceJob</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "12px 16px", color: "#374151" }}>{row.feature}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center", background: "#FAFFFE" }}>
                      {row.us === true ? <Check /> : typeof row.us === "string" ? <span style={{ fontSize: 12, color: "#6B7280" }}>{row.us}</span> : <No />}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      {row.them === true ? <Check /> : typeof row.them === "string" ? <span style={{ fontSize: 12, color: "#6B7280" }}>{row.them}</span> : <No />}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid #E5E7EB", fontWeight: 600 }}>
                  <td style={{ padding: "14px 16px", color: "#374151" }}>Starting price</td>
                  <td style={{ padding: "14px 16px", textAlign: "center", background: "#FAFFFE", color: "#1a1a2e" }}>$79/mo</td>
                  <td style={{ padding: "14px 16px", textAlign: "center", color: "#6B7280" }}>$75/mo</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* The Shield explained */}
        <div style={{ background: "#F0FFF4", borderRadius: 12, padding: 32, marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <Shield className="w-8 h-8 text-emerald-600 shrink-0 mt-1" />
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e", marginBottom: 8 }}>The "Shield" — our biggest differentiator</h3>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, marginBottom: 12 }}>
                When a customer is unhappy, they see a private feedback form — not the Google review page.
                You get their complaint directly. Google doesn't. You have a chance to make it right before it becomes a 1-star review.
              </p>
              <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
                NiceJob has a similar "review funnel." But ReputationShield adds AI response drafting and direct Google posting on top — so when a review does go public, you can respond professionally in seconds.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom line */}
        <div style={{ background: "#F9FAFB", borderRadius: 12, padding: 32, marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", marginBottom: 12 }}>The bottom line</h2>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7, marginBottom: 12 }}>
            NiceJob is a solid tool for automated review collection. If all you need is "send review requests after jobs," it works.
          </p>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7, marginBottom: 12 }}>
            ReputationShield does that too — plus AI response drafting, direct Google posting, QR code field collection, low-rating alerts, monthly reports, and source tracking. For $4/mo more.
          </p>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7, fontWeight: 600 }}>
            The difference: what happens after the review request is sent.
          </p>
        </div>

        {/* Podium / Birdeye comparison */}
        <Card className="p-6 mb-12" style={{ borderLeft: "4px solid #0d3cfc" }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, color: "#1a1a2e", marginBottom: 8 }}>What about Podium ($399/mo) or Birdeye ($299/mo)?</h3>
          <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, marginBottom: 12 }}>
            Both are built for multi-location chains and require annual contracts + sales calls to even see pricing.
            They offer webchat, payments, social media management — features most trades businesses don't need.
          </p>
          <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
            ReputationShield focuses on what actually grows your reputation: <strong>review requests, monitoring, AI responses, Google posting, and private feedback protection</strong> — at <strong>$79–$179/mo</strong>, no contracts, no sales calls, sign up and start today.
          </p>
        </Card>

        {/* FAQ */}
        <style>{`
          .compare-faq-chevron { transition: transform 0.2s ease; }
          details[open] .compare-faq-chevron { transform: rotate(180deg); }
        `}</style>
        <div style={{ marginBottom: 48 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e", marginBottom: 16 }}>Common questions</h3>
          {[
            { q: "Is ReputationShield only for trades businesses?", a: "It's built for trades — plumbers, electricians, HVAC, roofers, contractors — but works for any local service business. The automation, templates, and AI are tuned for how trades businesses operate." },
            { q: "Do I have to ask customers for reviews manually?", a: "No. Review requests are sent automatically by SMS or email after every completed job. You can also send them manually from the portal or use QR codes for in-person collection — but the system works without you doing anything." },
            { q: "What happens if a customer is unhappy?", a: "They see a private feedback form instead of the Google review page. You get their complaint directly and can resolve it before it becomes a public 1-star review. This is the 'shield' in ReputationShield." },
            { q: "Why choose ReputationShield over NiceJob?", a: "Both handle automated review collection well. ReputationShield adds AI response drafting, direct Google posting, QR codes, low-rating alerts, and source tracking — for $4/mo more. The difference is what happens after the review request is sent." },
          ].map((item) => (
            <details key={item.q} style={{ borderBottom: "1px solid #E5E7EB", paddingBottom: 12, marginBottom: 12 }}>
              <summary style={{ fontSize: 14, fontWeight: 600, color: "#374151", cursor: "pointer", padding: "4px 0", listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {item.q}
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 compare-faq-chevron" />
              </summary>
              <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6, marginTop: 8, paddingLeft: 0 }}>{item.a}</p>
            </details>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a2e", marginBottom: 12 }}>Your next 5-star review is one completed job away.</h2>
          <p style={{ fontSize: 15, color: "#6B7280", marginBottom: 24 }}>No contracts. No sales calls. No setup fees. Start your free trial today.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/Wizard">
              <Button style={{ background: "#0d3cfc", color: "#FFFFFF", fontWeight: 700, padding: "14px 28px", borderRadius: 10, fontSize: 15 }}>
                Start Getting Reviews — Free Trial
              </Button>
            </Link>
            <Link href="/products/reputationshield">
              <Button variant="outline" style={{ padding: "14px 28px", borderRadius: 10, fontSize: 15 }}>
                See Full Product Details
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
