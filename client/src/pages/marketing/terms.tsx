import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, shadows, radius } from "@/theme/tokens";

/**
 * Terms of Service — MR Holdings &amp; Trade LLC
 *
 * AI-drafted baseline intended to be defensible for an early-stage SaaS.
 * Have an attorney review before Series A fundraising, enterprise contracts,
 * international expansion, or any litigation threat. This document is
 * written for the US market with general coverage for Canadian customers.
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

export default function TermsPage() {
  useEffect(() => {
    document.title = "Terms of Service — WeFixTrades";
  }, []);

  return (
    <MarketingLayout>
      <div data-testid="terms-page" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* ── Header ── */}
        <section style={{ background: mkt.dark, padding: "72px 24px 56px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
            <h1 style={{ fontSize: 40, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.2, margin: "0 0 14px" }}>
              Terms of Service
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
                These Terms of Service ("<strong>Terms</strong>") govern your access to and
                use of the WeFixTrades platform, products, and services (together, the
                "<strong>Service</strong>"), operated under the brand name "WeFixTrades" by
                <strong> MR Holdings &amp; Trade LLC</strong>, a Wyoming limited liability company with
                registered office at 30 N Gould St, Ste R, Sheridan, WY 82801, United States
                (EIN&nbsp;98-1915788) ("<strong>WeFixTrades</strong>", "<strong>we</strong>",
                "<strong>us</strong>", or "<strong>our</strong>"). By creating an account, signing up
                for any product, or otherwise using the Service, you agree to be bound by these
                Terms. If you do not agree, do not use the Service.
              </p>

              <Section title="1. Who we are and who can use the Service">
                <p>
                  MR Holdings &amp; Trade LLC operates software and done-for-you services marketed
                  primarily to small and medium trades businesses (plumbers, electricians,
                  HVAC contractors, cleaners, roofers, landscapers, and similar
                  service providers). You must be at least 18 years old and authorized to
                  enter into this agreement on behalf of your business to use the Service.
                </p>
                <p>
                  You represent and warrant that the information you provide at signup
                  (business name, contact details, trade type, service area) is accurate
                  and that you have the authority to bind your business to these Terms.
                </p>
              </Section>

              <Section title="2. Your account">
                <p>
                  We create a portal account for you when you purchase a paid service.
                  You're responsible for keeping your credentials secure, for all activity
                  under your account, and for notifying us immediately if you suspect
                  unauthorized access. We're not liable for losses caused by unauthorized
                  account access that was not reported to us promptly.
                </p>
              </Section>

              <Section title="3. Services we offer">
                <p>
                  WeFixTrades provides a combination of software products and managed
                  services, including but not limited to:
                </p>
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li><strong>QuoteQuick Pro</strong> — instant-quote calculator software</li>
                  <li><strong>24/7 TradeLine</strong> — AI voice and chat assistant for your business</li>
                  <li><strong>MapGuard</strong> — Google Business Profile management</li>
                  <li><strong>ReputationShield</strong> — review request and response automation</li>
                  <li><strong>RankFlow</strong> — ongoing local SEO work</li>
                  <li><strong>SocialSync</strong> — social media content generation and posting</li>
                  <li><strong>WebCare</strong> — automated website health monitoring and maintenance</li>
                  <li><strong>SiteLaunch</strong> — website build (custom or template-based)</li>
                  <li><strong>WebFix</strong> — one-off website fixes</li>
                </ul>
                <p style={{ marginTop: 12 }}>
                  Specific features, service levels, and deliverables are defined on the
                  relevant product pages and in your onboarding form. We may update
                  features, retire products, or change specifications at any time; if a
                  change materially reduces the value of a service you're paying for,
                  you may cancel and receive a pro-rated refund for the unused portion of
                  the current billing period.
                </p>
              </Section>

              <Section title="4. Fees, billing, and taxes">
                <p>
                  Prices are as shown on our pricing pages at the time of purchase. We
                  bill in advance: monthly plans charge on the same day each month,
                  annual plans charge on the same day each year. Setup fees, one-time
                  fees, and ad-spend funds (where applicable) are charged at the time of
                  purchase or as disclosed at checkout.
                </p>
                <p>
                  You authorize us to charge your payment method for all fees owed. If
                  a charge fails, we may retry it, pause your service, and eventually
                  cancel the service for non-payment. You're responsible for all
                  applicable taxes; where we're required to collect sales tax (e.g.,
                  Canadian GST/HST, US state sales tax for certain jurisdictions), we'll
                  add it to your invoice.
                </p>
                <p>
                  All fees are quoted and billed in USD unless otherwise specified. We
                  offer CAD billing for Canadian customers at the exchange rate in
                  effect at your first charge; that rate is held for subsequent charges
                  on the same plan until a plan change or annual re-rate.
                </p>
              </Section>

              <Section title="5. Free trials, money-back guarantee, and refunds">
                <p>
                  <strong>QuoteQuick Pro</strong> offers a 14-day free trial with no
                  credit card required. If you don't upgrade before day 14, your
                  calculator is paused (not deleted); all data is preserved and can be
                  reactivated by purchasing a plan.
                </p>
                <p>
                  <strong>All other paid recurring services</strong> (24/7 TradeLine,
                  MapGuard, ReputationShield, SocialSync, RankFlow, WebCare) come with a
                  <strong> 30-day money-back guarantee</strong>. If the service isn't
                  working for you, email us within 30 days of your first charge and we'll
                  refund that charge in full. After 30 days, you can cancel any time,
                  but past charges are not refundable.
                </p>
                <p>
                  <strong>SiteLaunch (custom builds):</strong> refundable until we ship
                  the first design mockup. After that, no refunds are offered because
                  the design work has been performed.
                </p>
                <p>
                  <strong>SiteLaunch (template-based):</strong> if the final site doesn't
                  meet the agreed brand brief after one round of revision, you're
                  entitled to a full refund.
                </p>
                <p>
                  <strong>WebFix:</strong> full refund if the specific fix scope cannot
                  be delivered. Does not cover changes of mind.
                </p>
                <p>
                  Our full trial and refund policy is available on request.
                </p>
              </Section>

              <Section title="6. Cancellation and suspension">
                <p>
                  You can cancel any monthly plan at any time from your portal.
                  Cancellation stops future charges; you keep access until the end of
                  the current billing period. Annual plans can be canceled mid-term, but
                  we don't pro-rate unused months — access continues until the annual
                  period expires.
                </p>
                <p>
                  We may suspend or terminate your account for: non-payment, violation
                  of these Terms, misuse of the Service, legal compulsion, or behavior
                  that harms other customers or our systems. Where reasonable, we'll
                  provide notice and an opportunity to cure. We may terminate without
                  notice for serious violations (fraud, abuse, illegal activity).
                </p>
              </Section>

              <Section title="7. AI-generated content">
                <p>
                  Several of our products rely on large language models and other AI
                  systems (Anthropic Claude, OpenAI, Vapi, ElevenLabs, and others).
                  AI-generated content — voice responses, chat replies, generated posts,
                  draft messages, audit summaries, and reports — can occasionally contain
                  inaccuracies or outdated information.
                </p>
                <p>
                  You're responsible for reviewing AI-generated content before it goes
                  public (e.g., approving posts in SocialSync, confirming quote accuracy
                  in QuoteQuick, reviewing auto-drafted review replies in
                  ReputationShield). We build approval gates and quality checks into
                  every customer-facing AI output, but final responsibility for published
                  content rests with you.
                </p>
                <p>
                  When you use TradeLine, the AI may answer calls or chats on your
                  behalf and make representations about your business based on the
                  information you've provided in onboarding. It's your responsibility to
                  keep that information accurate.
                </p>
              </Section>

              <Section title="8. Third-party services">
                <p>
                  The Service depends on third-party platforms, including (but not
                  limited to): Stripe (payments), Anthropic Claude (AI), Vapi (voice),
                  Twilio (SMS, where applicable), SendGrid or similar (email), Google
                  (Maps, Business Profile, Search Console), Meta (Facebook, Instagram),
                  and ElevenLabs (voice synthesis). Your use of those platforms through
                  us is also subject to their terms.
                </p>
                <p>
                  If a third-party platform changes its API, pricing, or availability in
                  a way that affects our Service, we'll adapt as quickly as reasonably
                  possible but are not liable for disruptions caused by third-party
                  changes outside our control.
                </p>
              </Section>

              <Section title="9. Your content and data">
                <p>
                  You retain all rights to the content and data you provide to us
                  (business information, customer records, photos, copy). By using the
                  Service, you grant us a non-exclusive, worldwide license to use that
                  content solely as necessary to operate and improve the Service on your
                  behalf.
                </p>
                <p>
                  We process personal data on your behalf in accordance with our Privacy
                  Policy. For customers subject to GDPR, we act as a data processor
                  where applicable; a data processing addendum is available on request.
                </p>
                <p>
                  You warrant that you have the right to share any data you provide, and
                  that you have the required consents from your own customers before
                  entering their personal information into our system (for example, for
                  review requests or SMS follow-ups).
                </p>
              </Section>

              <Section title="10. Acceptable use">
                <p>
                  You agree not to: (a) use the Service for unlawful purposes; (b) send
                  spam or unsolicited communications (we comply with CAN-SPAM, CASL, and
                  GDPR); (c) impersonate others; (d) attempt to break, probe, or reverse
                  engineer the Service; (e) upload malware or harmful content; (f) use
                  the Service in a way that interferes with other customers' use; or
                  (g) use the Service to generate misleading reviews or other content
                  that violates platform policies (Google, Trustpilot, Meta).
                </p>
              </Section>

              <Section title="11. Intellectual property">
                <p>
                  The Service, including all software, designs, trademarks, logos, and
                  product names (including "WeFixTrades", "QuoteQuick Pro", "TradeLine",
                  "MapGuard", "ReputationShield", "RankFlow", "SocialSync",
                  "WebCare", "SiteLaunch", "WebFix"), is owned by MR Holdings &amp; Trade LLC and
                  protected by applicable intellectual property laws. We grant you a
                  limited, non-transferable, revocable license to use the Service
                  during your paid subscription.
                </p>
              </Section>

              <Section title="12. Warranty disclaimers">
                <p>
                  The Service is provided <strong>"as is"</strong> and <strong>"as
                  available"</strong>. To the fullest extent permitted by law, we
                  disclaim all warranties, express or implied, including implied
                  warranties of merchantability, fitness for a particular purpose, and
                  non-infringement.
                </p>
                <p>
                  We don't guarantee specific business outcomes (e.g., a specific
                  Google ranking, a specific number of leads, a specific review count).
                  We do guarantee that we'll perform the services as described and
                  investigate any material failure to deliver.
                </p>
              </Section>

              <Section title="13. Limitation of liability">
                <p>
                  To the maximum extent permitted by law, our aggregate liability to you
                  for any claim arising out of or relating to the Service is limited to
                  the amount you paid us in the twelve (12) months preceding the event
                  giving rise to the claim. We are not liable for indirect, incidental,
                  special, consequential, or punitive damages, or for lost profits or
                  revenue.
                </p>
              </Section>

              <Section title="14. Indemnification">
                <p>
                  You agree to defend and indemnify MR Holdings &amp; Trade LLC against claims
                  arising from your use of the Service, your content, or your breach of
                  these Terms — except to the extent those claims result from our gross
                  negligence or willful misconduct.
                </p>
              </Section>

              <Section title="15. Changes to these Terms">
                <p>
                  We may update these Terms from time to time. If we make material
                  changes, we'll notify active customers by email and post a notice on
                  the Service at least 14 days before changes take effect. Continued use
                  after the effective date means you accept the updated Terms. If you
                  disagree, cancel your service before the effective date.
                </p>
              </Section>

              <Section title="16. Governing law and disputes">
                <p>
                  These Terms are governed by the laws of the State of Wyoming, USA,
                  without regard to conflict-of-laws rules. Any dispute will be
                  resolved in the state or federal courts located in Wyoming, except
                  that either party may seek injunctive relief in any court of
                  competent jurisdiction.
                </p>
                <p>
                  If you're a consumer in a jurisdiction where mandatory local consumer
                  law applies, nothing in these Terms limits the rights you have under
                  that law.
                </p>
              </Section>

              <Section title="17. Contact">
                <p>
                  Questions about these Terms? Email us at <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent }}>support@wefixtrades.com</a> or reach us through the
                  contact form. Registered office: MR Holdings &amp; Trade LLC,
                  30 N Gould St, Ste R, Sheridan, WY 82801, United States.
                </p>
              </Section>

              <p style={{ fontSize: 12, color: mkt.textFaint, marginTop: 40, paddingTop: 20, borderTop: `1px solid ${mkt.border}`, lineHeight: 1.6 }}>
                These Terms were last updated on {EFFECTIVE}. A Data Processing
                Addendum for GDPR-regulated customers is available on request.
              </p>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
