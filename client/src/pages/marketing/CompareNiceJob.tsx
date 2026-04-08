import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, X, Star, Shield, Zap, DollarSign } from "lucide-react";
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
  return (
    <MarketingLayout>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "60px 20px 80px" }}>
        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#00D4C8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
            Comparison
          </p>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, color: "#1a1a2e", lineHeight: 1.1, marginBottom: 16 }}>
            ReputationShield vs NiceJob
          </h1>
          <p style={{ fontSize: 17, color: "#6B7280", maxWidth: 600, margin: "0 auto", lineHeight: 1.6 }}>
            Both help trades businesses get more reviews. Here's where ReputationShield goes further — at the same price point.
          </p>
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

        {/* Bottom line */}
        <div style={{ background: "#F9FAFB", borderRadius: 12, padding: 32, marginBottom: 48 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", marginBottom: 12 }}>The bottom line</h2>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7, marginBottom: 16 }}>
            NiceJob is a solid tool for automated review collection. If that's all you need, it works fine.
          </p>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7, marginBottom: 16 }}>
            ReputationShield does everything NiceJob does — plus AI response drafting, direct Google posting, QR code field collection, low-rating alerts, and source tracking. For $4/mo more.
          </p>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7 }}>
            Both products have no contracts and transparent pricing. The difference is what happens after the review request is sent.
          </p>
        </div>

        {/* Podium comparison teaser */}
        <Card className="p-6 mb-12" style={{ borderLeft: "4px solid #00D4C8" }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, color: "#1a1a2e", marginBottom: 8 }}>What about Podium or Birdeye?</h3>
          <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6 }}>
            Podium starts at <strong>$399/mo</strong> with annual contracts and a sales-led process. Birdeye starts at <strong>$299/mo</strong> with setup fees.
            ReputationShield offers the core review features trades businesses actually need — automated requests, monitoring, AI responses, and Google posting — at <strong>$79–$179/mo</strong> with no contracts and no sales calls.
            If you're a plumber, electrician, or HVAC tech with one location, you don't need enterprise software priced for franchise chains.
          </p>
        </Card>

        {/* CTA */}
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a2e", marginBottom: 12 }}>Ready to start getting more reviews?</h2>
          <p style={{ fontSize: 15, color: "#6B7280", marginBottom: 24 }}>No contracts. No sales calls. Start your free trial today.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/Wizard">
              <Button style={{ background: "#00D4C8", color: "#1a1a2e", fontWeight: 700, padding: "14px 28px", borderRadius: 10, fontSize: 15 }}>
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
