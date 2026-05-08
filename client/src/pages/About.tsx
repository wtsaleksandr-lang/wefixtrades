import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { Target, Users, Zap, Shield, Hammer, Clock } from "lucide-react";
import { V7Hero, V7Section, V7Container, V7PageShell, V7SectionHeading, V7FinalCta } from "@/components/marketing/v7";
import { Reveal, MONO } from "@/components/effortel-blocks";

const VALUES = [
  { title: "Built for the jobsite, not the boardroom", description: "Every feature is designed around one reality: trades owners are on site, in the van, or up a ladder. The software has to work in 30 seconds or it doesn't work at all.", icon: Hammer },
  { title: "Done-for-you, not DIY", description: "We install, configure, and operate the tools for you. Setup fees, monthly service, and a real human you can reach. If you wanted a DIY tool, you'd be on Wix.", icon: Users },
  { title: "Outcomes over features", description: "We don't ship features — we ship results. More booked jobs, faster quotes, five-star reviews, and recovered missed calls. If a tool isn't moving those numbers, we rebuild it or remove it.", icon: Target },
  { title: "Fixed pricing, no lock-in", description: "Flat monthly rates, no setup fees buried in contracts, no annual lock-ins. Cancel any month with no penalty. The trust comes from the work, not a legal clause.", icon: Shield },
];

const HOW_WE_WORK = [
  { step: "01", title: "You tell us about your business", body: "A 3-minute onboarding form captures what you do, who you serve, and how you price. We do the rest.", icon: Clock },
  { step: "02", title: "We configure and launch", body: "Our team sets up your calculators, AI phone agent, Google Business profile, review automation — whatever you signed up for. You approve before anything goes live.", icon: Zap },
  { step: "03", title: "You see the results", body: "Leads land in your inbox. Missed calls get answered. Reviews roll in. Monthly reports show what's working. You stay focused on the work that pays.", icon: Target },
];

export default function AboutPage() {
  useEffect(() => { document.title = "About — WeFixTrades"; }, []);

  return (
    <MarketingLayout>
      <V7PageShell>
        <V7Hero
          productName="About WeFixTrades"
          eyebrow="Most trades owners are losing work they'll never know about."
          headline={<>The growth team trades businesses<br/><span style={{ color: mkt.accent }}>can't afford to hire — and shouldn't need to.</span></>}
          sub="The operating system behind the marketing, quoting, and customer-handling work that most trades owners either skip or overpay an agency to do."
        />

        {/* Why we exist */}
        <V7Section padding="80px">
          <V7Container maxWidth={760}>
            <Reveal>
              <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: mkt.accent, marginBottom: 14 }}>
                Why we exist
              </p>
              <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, color: mkt.onDark, marginBottom: 24, letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                Most trades owners are losing work they'll never know about.
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <p style={{ fontSize: 16, color: mkt.onDarkMuted, lineHeight: 1.7, margin: 0 }}>
                  Customers call while you're mid-job and leave voicemail. They ask for a quote on a Sunday evening and go with whoever replies first on Monday morning. They leave a five-star review in their head and never actually post it.
                </p>
                <p style={{ fontSize: 16, color: mkt.onDarkMuted, lineHeight: 1.7, margin: 0 }}>
                  The big franchises solve this with a ten-person office team, a CRM built by a vendor nobody's heard of, and an agency on retainer. That's not realistic for a three-van outfit. Neither is expecting one owner to learn SEO, Google ads, and call automation between jobs.
                </p>
                <p style={{ fontSize: 16, color: mkt.onDarkMuted, lineHeight: 1.7, margin: 0 }}>
                  WeFixTrades is built around a simple trade: you pay a fixed monthly fee, and we replace the pieces of the back office that should be running without you. Instant quotes, AI answering missed calls, Google profile management, review automation, monthly SEO work — delivered as a service, not a toolkit.
                </p>
              </div>
            </Reveal>
          </V7Container>
        </V7Section>

        {/* Values */}
        <V7Section variant="subtle" padding="80px">
          <V7Container>
            <V7SectionHeading
              eyebrow="What we stand for"
              title="Four things we won't compromise on."
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              {VALUES.map((v, i) => {
                const Icon = v.icon;
                return (
                  <Reveal key={v.title} delay={i * 0.05}>
                    <div style={{ background: mkt.sectionLight, borderRadius: 18, padding: "26px 24px", border: `1px solid ${mkt.onDarkBorder}`, display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(102,232,250,0.10)", color: mkt.accent }}>
                        <Icon size={22} strokeWidth={1.6} />
                      </div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: mkt.onDark, margin: 0, lineHeight: 1.3, letterSpacing: "-0.01em" }}>{v.title}</h3>
                      <p style={{ fontSize: 13, color: mkt.onDarkMuted, margin: 0, lineHeight: 1.6 }}>{v.description}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </V7Container>
        </V7Section>

        {/* How we work */}
        <V7Section padding="80px">
          <V7Container maxWidth={1000}>
            <V7SectionHeading
              eyebrow="How we work"
              title="Three steps. No agency runaround."
              sub="We don't do discovery calls, strategy decks, or quarterly reviews. We do the work and show you what changed."
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              {HOW_WE_WORK.map((step, i) => {
                const Icon = step.icon;
                return (
                  <Reveal key={step.step} delay={i * 0.05}>
                    <div style={{ background: mkt.sectionLight, borderRadius: 18, padding: "28px 26px", border: `1px solid ${mkt.onDarkBorder}`, display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: mkt.accent, letterSpacing: "0.08em", fontFamily: MONO }}>{step.step}</span>
                        <Icon size={18} color={mkt.onDarkFaint} strokeWidth={1.6} />
                      </div>
                      <h3 style={{ fontSize: 17, fontWeight: 600, color: mkt.onDark, margin: 0, letterSpacing: "-0.01em" }}>{step.title}</h3>
                      <p style={{ fontSize: 14, color: mkt.onDarkMuted, margin: 0, lineHeight: 1.6 }}>{step.body}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </V7Container>
        </V7Section>

        <V7FinalCta
          title={<>See what we'd do<br/><span style={{ color: mkt.accent }}>for your business.</span></>}
          sub="Free audit, no signup. Takes 30 seconds."
          primaryCta={{ label: "Run a free audit", href: "/tools/free-audit" }}
        />
      </V7PageShell>
    </MarketingLayout>
  );
}
