import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, shadows, radius } from "@/theme/tokens";

const p = {
  colors: {
    navy: mkt.dark,
    heading: mkt.text,
    body: mkt.textMuted,
    muted: mkt.textMuted,
    accent: mkt.accent,
    pageBg: mkt.surface,
    surface: mkt.bg,
    border: mkt.border,
  },
  radius: { md: radius.md },
  shadows: { card: shadows.card },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: p.colors.heading, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${p.colors.border}` }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: p.colors.body, lineHeight: 1.8 }}>
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  useEffect(() => {
    document.title = "Privacy Policy — QuickQuotePro";
  }, []);

  return (
    <MarketingLayout>
      <div data-testid="privacy-page" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* Page Header */}
        <section style={{ background: p.colors.navy, padding: "72px 24px 64px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
            <h1 style={{ fontSize: 40, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.2, margin: "0 0 16px" }}>
              Privacy Policy
            </h1>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.6)", margin: 0 }}>
              Last updated: February 2026
            </p>
          </div>
        </section>

        {/* Content */}
        <section style={{ background: p.colors.pageBg, padding: "64px 24px 80px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{
              background: p.colors.surface,
              borderRadius: p.radius.md,
              padding: "48px 48px",
              boxShadow: p.shadows.card,
              border: `1px solid ${p.colors.border}`,
            }}>
              <p style={{ fontSize: 15, color: p.colors.body, lineHeight: 1.8, marginBottom: 36 }}>
                QuickQuotePro ("we", "our", or "us"), operated by WeFixTrades, is committed to protecting your privacy. This Privacy Policy explains how we collect, use, share, and protect information about you when you use our services.
              </p>

              <Section title="1. Data We Collect">
                <p>We collect the following types of information:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  <li><strong>Account information:</strong> Name, email address, phone number, and business details provided when you register.</li>
                  <li><strong>Usage data:</strong> Pages visited, features used, calculator configurations, lead data generated through your widget.</li>
                  <li><strong>Payment information:</strong> Billing details processed securely through Stripe. We do not store card numbers.</li>
                  <li><strong>Communications:</strong> Messages, support tickets, and email correspondence.</li>
                  <li><strong>Device & technical data:</strong> IP address, browser type, device identifiers, and log files for security and diagnostics.</li>
                  <li><strong>Customer lead data:</strong> Information submitted through your embedded quote calculator by end-users (your customers).</li>
                </ul>
              </Section>

              <Section title="2. How We Use Your Data">
                <p>We use collected information to:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  <li>Provide, maintain, and improve the QuickQuotePro platform and services.</li>
                  <li>Process payments and manage your subscription.</li>
                  <li>Send service-related notifications, updates, and support communications.</li>
                  <li>Power AI features including chat, SMS responses, and pricing estimations.</li>
                  <li>Analyse usage patterns to improve product performance.</li>
                  <li>Comply with legal obligations and protect against fraud or abuse.</li>
                  <li>Send marketing communications where you have opted in (you may opt out at any time).</li>
                </ul>
              </Section>

              <Section title="3. Third-Party Services">
                <p>We integrate with the following third-party services that may process your data:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  <li><strong>OpenAI:</strong> Powers our AI Employee chat, voice, and pricing validation features. Data sent to OpenAI is subject to their privacy policy. We do not send personally identifiable information unless explicitly included in your configuration.</li>
                  <li><strong>Stripe:</strong> Processes all subscription payments and deposit collections. Stripe is PCI-DSS compliant. We do not store payment card data.</li>
                  <li><strong>Twilio:</strong> Powers SMS and WhatsApp messaging features. Messages sent through your AI Employee are processed via Twilio's infrastructure.</li>
                  <li><strong>Google:</strong> Analytics and Maps API services.</li>
                  <li><strong>Amazon Web Services:</strong> Cloud infrastructure and data storage.</li>
                </ul>
              </Section>

              <Section title="4. Data Sharing">
                <p>We do not sell your personal information. We may share data with:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  <li>Service providers listed above, only as necessary to provide our services.</li>
                  <li>Legal authorities when required by law or to protect our rights.</li>
                  <li>Acquirers in the event of a merger, acquisition, or sale of assets (you will be notified).</li>
                </ul>
              </Section>

              <Section title="5. Your Rights">
                <p>Depending on your location, you may have the following rights:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
                  <li><strong>Correction:</strong> Request we correct inaccurate or incomplete data.</li>
                  <li><strong>Deletion:</strong> Request deletion of your personal data (subject to legal retention requirements).</li>
                  <li><strong>Portability:</strong> Request a machine-readable export of your data.</li>
                  <li><strong>Objection:</strong> Object to processing based on legitimate interests.</li>
                  <li><strong>Opt-out of marketing:</strong> Unsubscribe from marketing emails at any time via the link in our emails.</li>
                </ul>
                <p style={{ marginTop: 12 }}>To exercise any of these rights, contact us at <a href="mailto:contact@wefxtrades.com" style={{ color: p.colors.accent, textDecoration: "none" }}>contact@wefxtrades.com</a>.</p>
              </Section>

              <Section title="6. Cookie Policy">
                <p>We use cookies and similar technologies to:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  <li><strong>Essential cookies:</strong> Required for authentication, security, and core platform functionality.</li>
                  <li><strong>Analytics cookies:</strong> Help us understand how users interact with our platform (e.g., page views, feature usage).</li>
                  <li><strong>Preference cookies:</strong> Remember your settings and configuration choices.</li>
                </ul>
                <p style={{ marginTop: 12 }}>You can control cookies through your browser settings. Disabling essential cookies may affect platform functionality.</p>
              </Section>

              <Section title="7. Data Retention">
                <p>We retain your data for as long as your account is active or as needed to provide services. After account deletion:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  <li>Account data is deleted within 30 days.</li>
                  <li>Lead data generated through your calculator may be retained for up to 90 days to allow data export.</li>
                  <li>Billing records are retained for 7 years as required by law.</li>
                </ul>
              </Section>

              <Section title="8. Security">
                <p>
                  We implement industry-standard security measures including TLS encryption for data in transit, encrypted storage for sensitive data, and regular security audits. However, no system is completely secure. We encourage you to use a strong, unique password and enable two-factor authentication when available.
                </p>
              </Section>

              <Section title="9. Children's Privacy">
                <p>
                  QuickQuotePro is not intended for use by children under 16. We do not knowingly collect personal information from children under 16. If you believe a child has provided us with personal information, please contact us immediately.
                </p>
              </Section>

              <Section title="10. Changes to This Policy">
                <p>
                  We may update this Privacy Policy from time to time. We will notify you of significant changes via email or a prominent notice on our platform at least 14 days before they take effect. Your continued use of the service after the effective date constitutes acceptance of the revised policy.
                </p>
              </Section>

              <Section title="11. Contact Us">
                <p>
                  If you have questions or concerns about this Privacy Policy or our data practices, please contact us:
                </p>
                <div style={{ marginTop: 12, padding: "16px 20px", background: "#F0F7F4", borderRadius: 8, fontSize: 14, lineHeight: 1.8 }}>
                  <strong>WeFixTrades Pty Ltd</strong><br />
                  Email: <a href="mailto:contact@wefxtrades.com" style={{ color: p.colors.accent, textDecoration: "none" }}>contact@wefxtrades.com</a><br />
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
