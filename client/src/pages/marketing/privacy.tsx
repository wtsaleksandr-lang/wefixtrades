import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, shadows, radius } from "@/theme/tokens";

/**
 * Privacy Policy — MR Holdings &amp; Trade LLC (operating as "WeFixTrades")
 *
 * AI-drafted baseline covering the main US/Canada requirements plus a
 * reasonable GDPR posture for the EU traffic we may incidentally receive.
 * Have an attorney review before expanding into regulated verticals
 * (healthcare, finance), enterprise deals, or EU market entry.
 *
 * Last full review: 2026-04-23.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: mkt.text, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid ${mkt.border}` }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}

const EFFECTIVE = "April 23, 2026";

export default function PrivacyPage() {
  useEffect(() => {
    document.title = "Privacy Policy — WeFixTrades";
  }, []);

  return (
    <MarketingLayout>
      <div data-testid="privacy-page" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* ── Header ── */}
        <section style={{ background: mkt.dark, padding: "72px 24px 56px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
            <h1 style={{ fontSize: 40, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.2, margin: "0 0 14px" }}>
              Privacy Policy
            </h1>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", margin: 0 }}>
              Effective {EFFECTIVE}
            </p>
          </div>
        </section>

        <section style={{ background: mkt.surface, padding: "56px 24px 80px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{
              background: mkt.bg,
              borderRadius: radius.md,
              padding: "44px",
              boxShadow: shadows.card,
              border: `1px solid ${mkt.border}`,
            }}>
              <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.75, marginBottom: 32 }}>
                This Privacy Policy explains how MR Holdings &amp; Trade LLC (operating as "WeFixTrades") ("<strong>WeFixTrades</strong>", "<strong>we</strong>", "<strong>us</strong>", "<strong>our</strong>") collects, uses, shares, and protects information when you visit our website, use our Service, or communicate with us. If you don't agree with this policy, don't use the Service.
              </p>

              <Section title="1. Who this policy applies to">
                <p>This policy applies to two groups:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li><strong>Customers</strong> — trades businesses that buy a subscription or service from us.</li>
                  <li><strong>Visitors</strong> — anyone browsing our public website, filling in a form, or calling our published phone line.</li>
                </ul>
                <p style={{ marginTop: 12 }}>
                  Our customers also operate systems on their own customers' behalf (for example, a plumber using TradeLine to answer calls from homeowners). In those flows, the plumber is the data controller of the homeowner's information and we act as the data processor. Our customers are responsible for their own privacy notices to their end users.
                </p>
              </Section>

              <Section title="2. Information we collect">
                <p><strong>Information you give us directly:</strong></p>
                <ul style={{ paddingLeft: 20, marginTop: 8, marginBottom: 12 }}>
                  <li>Name, email, phone number, business name, trade type, service area</li>
                  <li>Billing address and payment information (processed by Stripe — we don't store full card numbers)</li>
                  <li>Onboarding form responses (services you offer, pricing, working hours, tone preferences)</li>
                  <li>Content you upload (logos, photos, brand assets, review templates)</li>
                  <li>Messages you send us (email, contact form, support tickets, phone call transcripts)</li>
                </ul>

                <p><strong>Information we collect automatically:</strong></p>
                <ul style={{ paddingLeft: 20, marginTop: 8, marginBottom: 12 }}>
                  <li>Device and browser info (user agent, screen size, time zone)</li>
                  <li>IP address and approximate geolocation</li>
                  <li>Usage events (pages viewed, features used, clicks, form submissions)</li>
                  <li>Call metadata from Vapi (call time, duration, caller number, transcript)</li>
                  <li>Cookies and similar storage — see "Cookies" below</li>
                </ul>

                <p><strong>Information we receive from third parties:</strong></p>
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li>Google (Business Profile data, Search Console metrics) when you connect these</li>
                  <li>Meta (Facebook/Instagram Page info) when you connect these</li>
                  <li>Stripe (payment confirmations, subscription status)</li>
                  <li>Public sources (business directories, Google Maps) for our free audit tool</li>
                </ul>
              </Section>

              <Section title="3. How we use information">
                <p>We use the information above to:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li>Provide, maintain, and improve the Service</li>
                  <li>Process payments and manage subscriptions</li>
                  <li>Configure and run the services you've purchased (including training AI assistants with your business information)</li>
                  <li>Send transactional emails (receipts, onboarding, service updates, support)</li>
                  <li>Send marketing emails — only to people who've opted in; you can unsubscribe any time</li>
                  <li>Detect and prevent fraud, abuse, and security incidents</li>
                  <li>Comply with legal obligations</li>
                  <li>Produce anonymized aggregate analytics that never identify an individual</li>
                </ul>
              </Section>

              <Section title="4. Legal bases (for EU/UK visitors)">
                <p>If you're in the EU or UK, we process your personal information on the following legal bases (as applicable):</p>
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li><strong>Contract</strong> — to deliver the Service you've signed up for</li>
                  <li><strong>Legitimate interest</strong> — to run the business, keep the Service secure, measure performance</li>
                  <li><strong>Consent</strong> — for marketing emails and non-essential cookies</li>
                  <li><strong>Legal obligation</strong> — to comply with tax, accounting, and legal requests</li>
                </ul>
              </Section>

              <Section title="5. How we share information">
                <p>
                  We don't sell your personal information. We share it only with service providers who help us operate the Service, and only to the extent they need it. Those include:
                </p>
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li><strong>Stripe</strong> — payment processing</li>
                  <li><strong>Anthropic</strong> — the AI that powers our assistants and content generation</li>
                  <li><strong>Vapi</strong> — voice AI for phone calls</li>
                  <li><strong>Twilio</strong> — SMS (where applicable to a product you use)</li>
                  <li><strong>ElevenLabs</strong> — voice synthesis for TradeLine</li>
                  <li><strong>Deepgram</strong> — speech-to-text transcription</li>
                  <li><strong>SendGrid / SMTP providers</strong> — transactional email</li>
                  <li><strong>Google</strong> — Business Profile, Maps, analytics</li>
                  <li><strong>Meta</strong> — Facebook / Instagram posting APIs</li>
                  <li><strong>OpenAI</strong> — image generation for SocialSync</li>
                  <li><strong>White-label service partners</strong> — third-party agencies and freelancers who fulfill specific services. We share only the minimum business info they need.</li>
                  <li><strong>Hosting and infrastructure providers</strong> — cloud hosting, database, monitoring</li>
                </ul>
                <p style={{ marginTop: 12 }}>
                  We may also share information: (a) with your consent; (b) to comply with legal process or government requests; (c) to protect rights, property, or safety; (d) in connection with a merger, acquisition, or sale of assets — in which case we'll notify active customers before the transfer.
                </p>
              </Section>

              <Section title="6. How long we keep information">
                <p>We retain personal information for as long as your account is active or as needed to provide the Service, then:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li><strong>Active accounts</strong> — data retained while the subscription is active</li>
                  <li><strong>Canceled accounts</strong> — retained for 90 days in case of reactivation, then anonymized</li>
                  <li><strong>Billing records</strong> — retained for 7 years to meet tax and accounting requirements</li>
                  <li><strong>Call recordings and transcripts</strong> — retained by Vapi per their policy (typically 7 days; longer on paid retention)</li>
                  <li><strong>Support emails</strong> — retained while you're a customer, then archived for 2 years</li>
                </ul>
                <p style={{ marginTop: 12 }}>You can request earlier deletion — see "Your rights" below.</p>
              </Section>

              <Section title="7. Your rights">
                <p>Depending on where you live, you may have the right to:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li>Access the personal information we hold about you</li>
                  <li>Correct inaccurate information</li>
                  <li>Delete your data ("right to be forgotten")</li>
                  <li>Export your data in a portable format</li>
                  <li>Object to or restrict certain processing</li>
                  <li>Withdraw consent for marketing at any time</li>
                  <li>Opt out of the sale or sharing of personal information (we don't do either, but the right is here if required by law)</li>
                </ul>
                <p style={{ marginTop: 12 }}>
                  To exercise any of these rights, email <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent }}>support@wefixtrades.com</a>. We'll verify your identity and respond within 30 days (sooner where required by law).
                </p>
                <p style={{ marginTop: 12 }}>
                  <strong>California residents:</strong> we comply with the CCPA/CPRA. In the past 12 months we have <em>not</em> sold or shared personal information for cross-context behavioral advertising.
                </p>
                <p style={{ marginTop: 12 }}>
                  <strong>Canadian residents:</strong> we comply with PIPEDA and applicable provincial privacy laws.
                </p>
              </Section>

              <Section title="8. Cookies and similar technologies">
                <p>
                  We use strictly necessary cookies for login sessions and security. With your consent, we may also use analytics cookies to measure site performance. We don't use third-party advertising trackers (no Meta Pixel, no Google Ads retargeting) on the public marketing site.
                </p>
                <p>
                  Within the customer portal, we use essential cookies required to keep you signed in and to deliver the services you're paying for. These can't be disabled without breaking the portal.
                </p>
              </Section>

              <Section title="9. Security">
                <p>
                  We protect personal information with industry-standard technical and organizational measures: TLS for data in transit, encryption at rest for sensitive fields (OAuth tokens, session data), access controls and audit logging, and regular dependency patching. No system is perfect — if we experience a breach involving your personal information, we'll notify affected customers without undue delay as required by law.
                </p>
              </Section>

              <Section title="10. International transfers">
                <p>
                  We operate out of the United States. If you access the Service from outside the US, you understand your information may be transferred to, stored, and processed in the US and other jurisdictions where our service providers operate. For EU/UK transfers, we rely on Standard Contractual Clauses with our processors where applicable.
                </p>
              </Section>

              <Section title="11. Children">
                <p>
                  The Service is not directed to children under 16. We don't knowingly collect information from children. If you believe we've inadvertently collected information from a child, email <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent }}>support@wefixtrades.com</a> and we'll delete it.
                </p>
              </Section>

              <Section title="12. Changes to this Policy">
                <p>
                  We may update this Privacy Policy from time to time. If we make material changes, we'll notify active customers by email and post a notice on the Service at least 14 days before changes take effect. Continued use after the effective date means you accept the updated policy.
                </p>
              </Section>

              <Section title="13. Contact">
                <p>
                  Questions about this Privacy Policy or our data practices? Email <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent }}>support@wefixtrades.com</a>. Mailing address: MR Holdings &amp; Trade LLC, 30 N Gould St, Ste R, Sheridan, WY 82801, United States.
                </p>
                <p>
                  EU/UK customers: if you're not satisfied with our response, you have the right to complain to your local data protection authority.
                </p>
              </Section>

              <p style={{ fontSize: 12, color: mkt.textFaint, marginTop: 40, paddingTop: 20, borderTop: `1px solid ${mkt.border}`, lineHeight: 1.6 }}>
                Last updated {EFFECTIVE}. A Data Processing Addendum for GDPR-regulated customers is available on request.
              </p>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
