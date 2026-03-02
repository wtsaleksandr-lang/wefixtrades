import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, shadows, radius } from "@/theme/tokens";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: mkt.text, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${mkt.border}` }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.8 }}>
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  useEffect(() => {
    document.title = "Terms of Service — QuickQuotePro";
  }, []);

  return (
    <MarketingLayout>
      <div data-testid="terms-page" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* Page Header */}
        <section style={{ background: mkt.dark, padding: "72px 24px 64px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
            <h1 style={{ fontSize: 40, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.2, margin: "0 0 16px" }}>
              Terms of Service
            </h1>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.6)", margin: 0 }}>
              Last updated: February 2026
            </p>
          </div>
        </section>

        {/* Content */}
        <section style={{ background: mkt.surface, padding: "64px 24px 80px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{
              background: mkt.bg,
              borderRadius: radius.md,
              padding: "48px 48px",
              boxShadow: shadows.card,
              border: `1px solid ${mkt.border}`,
            }}>
              <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.8, marginBottom: 36 }}>
                These Terms of Service ("Terms") govern your access to and use of QuickQuotePro, a product of WeFixTrades Pty Ltd ("Company", "we", "us", or "our"). By creating an account or using our services, you agree to be bound by these Terms.
              </p>

              <Section title="1. Acceptance of Terms">
                <p>
                  By accessing or using QuickQuotePro (the "Service"), you confirm that you are at least 18 years old, have the legal authority to enter into these Terms on behalf of yourself or your organisation, and agree to comply with all applicable laws and regulations.
                </p>
                <p style={{ marginTop: 12 }}>
                  If you do not agree to these Terms, you may not access or use the Service. We reserve the right to update these Terms at any time. Continued use of the Service after changes constitutes acceptance.
                </p>
              </Section>

              <Section title="2. Service Description">
                <p>
                  QuickQuotePro is a SaaS platform that provides trades businesses with tools for:
                </p>
                <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  <li>Instant online estimate and quote calculators</li>
                  <li>Lead capture and management</li>
                  <li>Online booking and deposit collection</li>
                  <li>AI-powered chat, voice, and SMS customer engagement</li>
                  <li>Marketing automation and follow-up sequences</li>
                  <li>Analytics and reporting</li>
                </ul>
                <p style={{ marginTop: 12 }}>
                  We reserve the right to modify, suspend, or discontinue any part of the Service at any time with reasonable notice to active subscribers.
                </p>
              </Section>

              <Section title="3. Subscription and Billing">
                <p>
                  QuickQuotePro is offered on a subscription basis. By subscribing to a paid plan, you agree to:
                </p>
                <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  <li><strong>Payment:</strong> Pay the applicable subscription fees in advance on a monthly or annual basis. All prices are in AUD unless otherwise stated.</li>
                  <li><strong>Automatic renewal:</strong> Subscriptions automatically renew unless cancelled before the renewal date.</li>
                  <li><strong>Price changes:</strong> We may change subscription prices with 30 days' notice. Changes take effect at your next renewal.</li>
                  <li><strong>Refunds:</strong> We offer a 14-day free trial for new accounts. After the trial, subscription fees are non-refundable unless required by law.</li>
                  <li><strong>Taxes:</strong> Prices displayed exclude GST or other applicable taxes, which will be added at checkout where required.</li>
                </ul>
                <p style={{ marginTop: 12 }}>
                  Payments are processed by Stripe. You authorise us to charge your payment method on file at each renewal.
                </p>
              </Section>

              <Section title="4. Acceptable Use">
                <p>You agree not to use the Service to:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  <li>Violate any applicable laws or regulations</li>
                  <li>Send spam, unsolicited communications, or deceptive messages</li>
                  <li>Impersonate any person or entity</li>
                  <li>Collect or harvest personal data without proper consent</li>
                  <li>Interfere with or disrupt the Service or servers</li>
                  <li>Attempt to gain unauthorised access to any part of the Service</li>
                  <li>Use the AI features to generate harmful, illegal, or misleading content</li>
                  <li>Resell or sublicense access to the Service without our written consent</li>
                </ul>
                <p style={{ marginTop: 12 }}>
                  We reserve the right to suspend or terminate your account for violations of these policies without refund.
                </p>
              </Section>

              <Section title="5. Intellectual Property Ownership">
                <p>
                  <strong>Our IP:</strong> QuickQuotePro, including all software, algorithms, designs, trademarks, and documentation, is owned by WeFixTrades Pty Ltd and protected by intellectual property laws. You may not copy, modify, or distribute our platform without express written permission.
                </p>
                <p style={{ marginTop: 12 }}>
                  <strong>Your content:</strong> You retain ownership of all content, data, and configurations you create within the platform ("Customer Content"), including your calculator templates, pricing logic, and brand assets. By using our Service, you grant us a non-exclusive, royalty-free licence to process and display your Customer Content solely to provide the Service.
                </p>
                <p style={{ marginTop: 12 }}>
                  <strong>Feedback:</strong> Any feedback, suggestions, or ideas you provide about the Service may be used by us freely without obligation.
                </p>
              </Section>

              <Section title="6. Data and Privacy">
                <p>
                  Your use of the Service is also governed by our <a href="/privacy" style={{ color: mkt.accent, textDecoration: "none" }}>Privacy Policy</a>, which is incorporated into these Terms by reference. You are responsible for ensuring that your use of the Service complies with applicable data protection laws, including obtaining necessary consent from your end-users (the customers who interact with your quote calculators).
                </p>
                <p style={{ marginTop: 12 }}>
                  As a data controller for your customers' information, you must have a lawful basis for processing their data and must have a compliant privacy policy on your own website.
                </p>
              </Section>

              <Section title="7. Third-Party Integrations">
                <p>
                  The Service integrates with third-party platforms including Stripe, Twilio, and OpenAI. Your use of these integrations is subject to their respective terms of service. We are not responsible for the actions, performance, or data practices of these third parties.
                </p>
              </Section>

              <Section title="8. Limitation of Liability">
                <p>
                  To the maximum extent permitted by law, WeFixTrades Pty Ltd and its directors, employees, and agents shall not be liable for:
                </p>
                <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  <li>Any indirect, incidental, special, or consequential damages</li>
                  <li>Loss of profits, revenue, data, or business opportunities</li>
                  <li>Damages arising from your use of or inability to use the Service</li>
                  <li>Any errors or inaccuracies in AI-generated estimates or responses</li>
                </ul>
                <p style={{ marginTop: 12 }}>
                  Our total liability to you for any claim arising from these Terms or the Service shall not exceed the amount you paid us in the 12 months preceding the claim.
                </p>
                <p style={{ marginTop: 12 }}>
                  <strong>Disclaimer:</strong> The Service is provided "as is" without warranties of any kind, express or implied. We do not warrant that the Service will be error-free, uninterrupted, or completely secure.
                </p>
              </Section>

              <Section title="9. Indemnification">
                <p>
                  You agree to indemnify, defend, and hold harmless WeFixTrades Pty Ltd and its affiliates, officers, directors, employees, and agents from any claims, liabilities, damages, losses, or expenses (including legal fees) arising from your use of the Service, your violation of these Terms, or your infringement of any third-party rights.
                </p>
              </Section>

              <Section title="10. Termination">
                <p>
                  <strong>By you:</strong> You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of your current billing period.
                </p>
                <p style={{ marginTop: 12 }}>
                  <strong>By us:</strong> We may suspend or terminate your access to the Service immediately if you breach these Terms, fail to pay fees, or we determine your use poses a risk to other users or the Service. We will provide reasonable notice where practicable.
                </p>
                <p style={{ marginTop: 12 }}>
                  Upon termination, your right to access the Service ceases. You may export your data for 30 days after cancellation. After this period, your data will be deleted in accordance with our Privacy Policy.
                </p>
              </Section>

              <Section title="11. Governing Law and Disputes">
                <p>
                  These Terms are governed by the laws of New South Wales, Australia. Any disputes arising under these Terms shall first be attempted to be resolved through good-faith negotiation. If not resolved within 30 days, disputes shall be subject to the exclusive jurisdiction of the courts of New South Wales, Australia.
                </p>
                <p style={{ marginTop: 12 }}>
                  For consumer disputes, nothing in these Terms limits your rights under the Australian Consumer Law.
                </p>
              </Section>

              <Section title="12. Miscellaneous">
                <p>
                  <strong>Entire agreement:</strong> These Terms, together with our Privacy Policy and any order forms or service agreements, constitute the entire agreement between you and WeFixTrades regarding the Service.
                </p>
                <p style={{ marginTop: 12 }}>
                  <strong>Severability:</strong> If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force.
                </p>
                <p style={{ marginTop: 12 }}>
                  <strong>Waiver:</strong> Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights.
                </p>
                <p style={{ marginTop: 12 }}>
                  <strong>Assignment:</strong> You may not assign your rights under these Terms without our prior written consent. We may assign our rights to an affiliate or in connection with a merger or acquisition.
                </p>
              </Section>

              <Section title="13. Contact">
                <p>
                  For questions about these Terms of Service, please contact us:
                </p>
                <div style={{ marginTop: 12, padding: "16px 20px", background: mkt.accentTint, borderRadius: 8, fontSize: 14, lineHeight: 1.8 }}>
                  <strong>WeFixTrades Pty Ltd</strong><br />
                  Email: <a href="mailto:contact@wefxtrades.com" style={{ color: mkt.accent, textDecoration: "none" }}>contact@wefxtrades.com</a><br />
                  Response time: Usually within 2 business hours
                </div>
              </Section>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
