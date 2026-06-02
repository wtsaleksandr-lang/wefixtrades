import { mkt } from "@/theme/tokens";
import { Link } from "wouter";
import { LegalShell, LegalSection, type TocItem } from "@/components/marketing/legal/LegalLayout";

/**
 * Security & Trust page.
 *
 * Honest posture: WeFixTrades does NOT currently hold its own SOC 2 / ISO
 * audit. The certifications cited belong to our infrastructure providers
 * (AWS, Cloudflare, Stripe) — we inherit the security of that infrastructure
 * and describe our own practices truthfully. Do not add claims of WeFixTrades
 * holding its own certifications unless/until an audit is actually completed.
 */

const ulStyle: React.CSSProperties = { paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 };

const TOC: TocItem[] = [
  { id: "infrastructure", label: "Infrastructure" },
  { id: "encryption", label: "Encryption" },
  { id: "access", label: "Access controls" },
  { id: "appsec", label: "Application & network" },
  { id: "payments", label: "Payments" },
  { id: "backups", label: "Backups & resilience" },
  { id: "privacy", label: "Privacy & compliance" },
  { id: "subprocessors", label: "Sub-processors" },
  { id: "disclosure", label: "Report a vulnerability" },
];

export default function SecurityPage() {
  return (
    <LegalShell
      eyebrow="Trust"
      title="Security & Trust"
      sub="How we protect your data — and your customers' data."
      metaTitle="Security & Trust"
      metaDescription="How WeFixTrades protects your data and your customers' data — encryption, access controls, enterprise-grade infrastructure, and our privacy and compliance posture."
      canonical="/security"
      toc={TOC}
    >
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.75, marginBottom: 32 }}>
        Trade businesses trust WeFixTrades with quotes, calls, reviews, and customer
        contact details. We take that seriously. This page explains, plainly, how we
        protect that data and the infrastructure it runs on.
      </p>

      <LegalSection id="infrastructure" title="Enterprise-grade infrastructure">
        <p>
          WeFixTrades runs on <strong>Amazon Web Services (AWS)</strong> and{" "}
          <strong>Cloudflare</strong>. These providers maintain independently audited
          certifications, including:
        </p>
        <ul style={ulStyle}>
          <li><strong>SOC 2 Type II</strong></li>
          <li><strong>ISO 27001 / 27017 / 27018</strong></li>
          <li><strong>PCI DSS Level 1</strong></li>
        </ul>
        <p style={{ marginTop: 12 }}>
          We inherit the physical, network, and platform security of that audited
          infrastructure. To be clear: these certifications are held by our infrastructure
          providers. WeFixTrades does not currently hold its own SOC 2 audit — when we do,
          we'll publish the report here.
        </p>
      </LegalSection>

      <LegalSection id="encryption" title="Encryption">
        <ul style={ulStyle}>
          <li><strong>In transit:</strong> all traffic is served over TLS (HTTPS) with modern ciphers, terminated at Cloudflare's edge.</li>
          <li><strong>At rest:</strong> data stored in our databases and object storage is encrypted using AWS-managed encryption.</li>
          <li><strong>Secrets:</strong> API keys and credentials are stored in a managed secrets vault, never in source code.</li>
        </ul>
      </LegalSection>

      <LegalSection id="access" title="Access controls">
        <ul style={ulStyle}>
          <li>Least-privilege access for our team — staff only get the access their role requires.</li>
          <li>Two-factor authentication on internal and administrative accounts.</li>
          <li>Strict tenant isolation: every customer's data is scoped to their account and never mixed with another's.</li>
          <li>Customer accounts support strong passwords, two-factor authentication, and session controls.</li>
        </ul>
      </LegalSection>

      <LegalSection id="appsec" title="Application & network security">
        <ul style={ulStyle}>
          <li>Cloudflare Web Application Firewall (WAF) and DDoS protection in front of all traffic.</li>
          <li>Input validation and output encoding to defend against SQL injection and XSS.</li>
          <li>Rate limiting and bot/abuse protection on public endpoints.</li>
          <li>Automated dependency monitoring and regular code review.</li>
        </ul>
      </LegalSection>

      <LegalSection id="payments" title="Payments">
        <p>
          Card payments are processed by <strong>Stripe</strong>, a PCI DSS Level 1
          certified provider. Card numbers are handled directly by Stripe — WeFixTrades
          never sees or stores full card details.
        </p>
      </LegalSection>

      <LegalSection id="backups" title="Backups & resilience">
        <ul style={ulStyle}>
          <li>Automated, encrypted database backups with point-in-time recovery.</li>
          <li>Infrastructure runs across redundant availability zones.</li>
          <li>Monitoring and alerting on availability and error rates.</li>
        </ul>
      </LegalSection>

      <LegalSection id="privacy" title="Privacy & compliance">
        <p>
          We align our data handling with <strong>GDPR</strong> and <strong>CCPA</strong>{" "}
          principles. You and your customers can request access to, correction of, or
          deletion of personal data we hold.
        </p>
        <ul style={ulStyle}>
          <li>A <strong>Data Processing Agreement (DPA)</strong> is available on request for business customers.</li>
          <li>See our{" "}
            <Link href="/privacy" style={{ color: mkt.accent, textDecoration: "none" }}>Privacy Policy</Link>,{" "}
            <Link href="/cookies" style={{ color: mkt.accent, textDecoration: "none" }}>Cookie Policy</Link>, and{" "}
            <Link href="/terms" style={{ color: mkt.accent, textDecoration: "none" }}>Terms of Service</Link>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="subprocessors" title="Sub-processors">
        <p>
          We use a small set of trusted sub-processors to deliver the Service, including
          AWS (hosting), Cloudflare (CDN &amp; security), Stripe (payments), Twilio
          (calls &amp; SMS), Google (Maps &amp; Business Profile), and AI providers
          (e.g. Anthropic, OpenAI) for assistant features. A current list is available
          on request.
        </p>
      </LegalSection>

      <LegalSection id="disclosure" title="Reporting a vulnerability">
        <p>
          Found a security issue? We want to know. Email{" "}
          <a href="mailto:security@wefixtrades.com" style={{ color: mkt.accent, textDecoration: "none" }}>
            security@wefixtrades.com
          </a>{" "}
          with the details and steps to reproduce. We'll acknowledge your report and keep
          you updated. Please give us a reasonable window to fix the issue before any
          public disclosure.
        </p>
      </LegalSection>

      <p style={{ fontSize: 13, color: mkt.textFaint, lineHeight: 1.6, marginTop: 8 }}>
        This page describes our current practices and may evolve as the product grows.
        For questions, contact{" "}
        <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent, textDecoration: "none" }}>support@wefixtrades.com</a>.
      </p>
    </LegalShell>
  );
}
