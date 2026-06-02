import { mkt } from "@/theme/tokens";
import { LegalShell, LegalSection, type TocItem } from "@/components/marketing/legal/LegalLayout";

/**
 * Privacy Policy — MR Holdings & Trade LLC (operating as "WeFixTrades")
 *
 * AI-drafted baseline covering the main US/Canada requirements plus a
 * reasonable GDPR posture. Includes OAuth sign-in (Google/Microsoft/Facebook),
 * Google API Limited-Use, an explicit data-deletion path (required by Meta,
 * Apple, and Google Play), and a mobile-app section. Have an attorney review
 * before regulated verticals, enterprise, or EU market entry.
 *
 * Last full review: 2026-06-01.
 */

const ul = { paddingLeft: 20, marginTop: 8 } as const;
const a = { color: mkt.accent, textDecoration: "underline" } as const;
const EFFECTIVE = "June 1, 2026";

const TOC: TocItem[] = [
  { id: "who", label: "1. Who this applies to" },
  { id: "collect", label: "2. Information we collect" },
  { id: "use", label: "3. How we use it" },
  { id: "bases", label: "4. Legal bases (EU/UK)" },
  { id: "share", label: "5. How we share" },
  { id: "signin", label: "6. Signing in with Google, Microsoft & Facebook" },
  { id: "google-api", label: "7. Google API — Limited Use" },
  { id: "retention", label: "8. How long we keep it" },
  { id: "rights", label: "9. Your rights" },
  { id: "deletion", label: "10. Deleting your data" },
  { id: "mobile", label: "11. Our mobile app" },
  { id: "cookies", label: "12. Cookies" },
  { id: "security", label: "13. Security" },
  { id: "transfers", label: "14. International transfers" },
  { id: "children", label: "15. Children" },
  { id: "changes", label: "16. Changes" },
  { id: "contact", label: "17. Contact" },
];

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      sub={`Effective ${EFFECTIVE}`}
      metaTitle="Privacy policy"
      metaDescription="How WeFixTrades collects, uses, stores, and protects your data and the data of your customers — including sign-in providers and our mobile app."
      canonical="/privacy"
      toc={TOC}
    >
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.75, marginBottom: 32 }}>
        This Privacy Policy explains how MR Holdings &amp; Trade LLC (operating as "WeFixTrades") ("<strong>WeFixTrades</strong>", "<strong>we</strong>", "<strong>us</strong>", "<strong>our</strong>") collects, uses, shares, and protects information when you visit our website, use our Service, or communicate with us. If you don't agree with this policy, don't use the Service.
      </p>

      <LegalSection id="who" title="1. Who this policy applies to">
        <p>This policy applies to two groups:</p>
        <ul style={ul}>
          <li><strong>Customers</strong> — trades businesses that buy a subscription or service from us.</li>
          <li><strong>Visitors</strong> — anyone browsing our public website, filling in a form, or calling our published phone line.</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          Our customers also operate systems on their own customers' behalf (for example, a plumber using TradeLine to answer calls from homeowners). In those flows, the plumber is the data controller of the homeowner's information and we act as the data processor. Our customers are responsible for their own privacy notices to their end users.
        </p>
      </LegalSection>

      <LegalSection id="collect" title="2. Information we collect">
        <p><strong>Information you give us directly:</strong></p>
        <ul style={{ ...ul, marginBottom: 12 }}>
          <li>Name, email, phone number, business name, trade type, service area</li>
          <li>Billing address and payment information (processed by Stripe — we don't store full card numbers)</li>
          <li>Onboarding form responses (services you offer, pricing, working hours, tone preferences)</li>
          <li>Content you upload (logos, photos, brand assets, review templates, and files you attach in chat)</li>
          <li>Messages you send us (email, contact form, support tickets, phone call transcripts)</li>
        </ul>

        <p><strong>Information we collect automatically:</strong></p>
        <ul style={{ ...ul, marginBottom: 12 }}>
          <li>Device and browser info (user agent, screen size, time zone)</li>
          <li>IP address and approximate geolocation</li>
          <li>Usage events (pages viewed, features used, clicks, form submissions)</li>
          <li>Call metadata from Vapi (call time, duration, caller number, transcript)</li>
          <li>Cookies and similar storage — see "Cookies" below</li>
        </ul>

        <p><strong>Information we receive from third parties:</strong></p>
        <ul style={ul}>
          <li>Sign-in providers — Google, Microsoft, and Facebook/Meta — when you sign in with them (see section 6)</li>
          <li>Google (Business Profile data, Search Console metrics) when you connect these</li>
          <li>Meta (Facebook/Instagram Page info) when you connect these</li>
          <li>Stripe (payment confirmations, subscription status)</li>
          <li>Public sources (business directories, Google Maps) for our free audit tool</li>
        </ul>
      </LegalSection>

      <LegalSection id="use" title="3. How we use information">
        <p>We use the information above to:</p>
        <ul style={ul}>
          <li>Provide, maintain, and improve the Service</li>
          <li>Process payments and manage subscriptions</li>
          <li>Configure and run the services you've purchased (including training AI assistants with your business information)</li>
          <li>Send transactional emails (receipts, onboarding, service updates, support)</li>
          <li>Send marketing emails — only to people who've opted in; you can unsubscribe any time</li>
          <li>Detect and prevent fraud, abuse, and security incidents</li>
          <li>Comply with legal obligations</li>
          <li>Produce anonymized aggregate analytics that never identify an individual</li>
        </ul>
      </LegalSection>

      <LegalSection id="bases" title="4. Legal bases (for EU/UK visitors)">
        <p>If you're in the EU or UK, we process your personal information on the following legal bases (as applicable):</p>
        <ul style={ul}>
          <li><strong>Contract</strong> — to deliver the Service you've signed up for</li>
          <li><strong>Legitimate interest</strong> — to run the business, keep the Service secure, measure performance</li>
          <li><strong>Consent</strong> — for marketing emails and non-essential cookies</li>
          <li><strong>Legal obligation</strong> — to comply with tax, accounting, and legal requests</li>
        </ul>
      </LegalSection>

      <LegalSection id="share" title="5. How we share information">
        <p>
          We don't sell your personal information. We share it only with service providers who help us operate the Service, and only to the extent they need it. Those include:
        </p>
        <ul style={ul}>
          <li><strong>Stripe</strong> — payment processing</li>
          <li><strong>Anthropic / OpenAI</strong> — the AI that powers our assistants, content, and images</li>
          <li><strong>Vapi</strong> — voice AI for phone calls</li>
          <li><strong>Twilio</strong> — SMS (where applicable to a product you use)</li>
          <li><strong>ElevenLabs / Deepgram</strong> — voice synthesis and speech-to-text for TradeLine</li>
          <li><strong>SendGrid / SMTP providers</strong> — transactional email</li>
          <li><strong>Google</strong> — sign-in, Business Profile, Maps, analytics</li>
          <li><strong>Microsoft</strong> — sign-in (identity)</li>
          <li><strong>Meta</strong> — sign-in, Facebook / Instagram posting APIs</li>
          <li><strong>White-label service partners</strong> — third-party agencies and freelancers who fulfill specific services. We share only the minimum business info they need.</li>
          <li><strong>Hosting and infrastructure providers</strong> — AWS (hosting), Cloudflare (CDN &amp; security), monitoring</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          We may also share information: (a) with your consent; (b) to comply with legal process or government requests; (c) to protect rights, property, or safety; (d) in connection with a merger, acquisition, or sale of assets — in which case we'll notify active customers before the transfer.
        </p>
      </LegalSection>

      <LegalSection id="signin" title="6. Signing in with Google, Microsoft & Facebook">
        <p>
          You can create or access your WeFixTrades account using <strong>"Sign in with
          Google"</strong>, <strong>"Sign in with Microsoft"</strong>, or <strong>"Sign in
          with Facebook"</strong>. When you do, we receive a limited set of profile
          information from that provider — typically your <strong>name, email address, and a
          profile identifier</strong> (and, where the provider supplies it, your profile
          picture).
        </p>
        <p style={{ marginTop: 12 }}>
          We use this only to create and secure your account and to sign you in. We do not
          post to those accounts and do not access anything beyond basic profile information
          through sign-in. (Connecting your Google Business Profile or Meta Pages to a
          product is a separate step, covered in section 7 and section 5.)
        </p>
        <p style={{ marginTop: 12 }}>Your use of each provider's sign-in is also governed by that provider's own privacy policy:</p>
        <ul style={ul}>
          <li>Google — <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={a}>Google Privacy Policy</a></li>
          <li>Microsoft — <a href="https://privacy.microsoft.com/privacystatement" target="_blank" rel="noopener noreferrer" style={a}>Microsoft Privacy Statement</a></li>
          <li>Facebook/Meta — <a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noopener noreferrer" style={a}>Meta Privacy Policy</a></li>
        </ul>
        <p style={{ marginTop: 12 }}>
          You can disconnect WeFixTrades from your provider account at any time in that
          provider's security settings, and you can request deletion of the data we hold —
          see <strong>"Deleting your data"</strong> below.
        </p>
      </LegalSection>

      <LegalSection id="google-api" title="7. Google API Services — Limited Use disclosure">
        <p>
          When you connect your Google Business Profile to MapGuard, we receive
          data through Google API Services (specifically the <em>business.manage</em>
          scope: your business listing, reviews, and the ability to publish posts
          and reply to reviews on your behalf).
        </p>
        <p style={{ marginTop: 12 }}>
          <strong>WeFixTrades' use and transfer of information received from Google
          APIs to any other app will adhere to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={a}>
            Google API Services User Data Policy
          </a>, including the Limited Use requirements.</strong>
        </p>
        <p style={{ marginTop: 12 }}>Concretely, this means we:</p>
        <ul style={ul}>
          <li>Only use Google user data to provide and improve the user-facing features of MapGuard — visibility monitoring, automated Google Business posts, owner replies to reviews, and profile health alerts. We do not use this data for advertising, profiling, or any unrelated purpose.</li>
          <li>Do not transfer Google user data to third parties except as necessary to provide and improve those features (for example, calling an AI provider's API to draft a review reply or post body — the AI provider never retains the data).</li>
          <li>Do not allow humans to read your Google user data unless we have your explicit consent for a specific support case, it is necessary to investigate a security incident or comply with applicable law, or the data is aggregated and anonymized.</li>
          <li>Do not sell Google user data to anyone, ever.</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          Google OAuth tokens are stored encrypted at rest and used only by the
          MapGuard service to publish posts, fetch reviews, and post owner replies
          on the schedule and conditions you've configured. You can revoke our
          access any time at{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={a}>
            myaccount.google.com/permissions
          </a>.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="8. How long we keep information">
        <p>We retain personal information for as long as your account is active or as needed to provide the Service, then:</p>
        <ul style={ul}>
          <li><strong>Active accounts</strong> — data retained while the subscription is active</li>
          <li><strong>Canceled accounts</strong> — retained for 90 days in case of reactivation, then anonymized</li>
          <li><strong>Billing records</strong> — retained for 7 years to meet tax and accounting requirements</li>
          <li><strong>Call recordings and transcripts</strong> — retained by Vapi per their policy (typically 7 days; longer on paid retention)</li>
          <li><strong>Support emails</strong> — retained while you're a customer, then archived for 2 years</li>
        </ul>
        <p style={{ marginTop: 12 }}>You can request earlier deletion — see "Deleting your data" below.</p>
      </LegalSection>

      <LegalSection id="rights" title="9. Your rights">
        <p>Depending on where you live, you may have the right to:</p>
        <ul style={ul}>
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
      </LegalSection>

      <LegalSection id="deletion" title="10. Deleting your data">
        <p>You can delete your WeFixTrades account and the personal data we hold at any time:</p>
        <ul style={ul}>
          <li><strong>In the app:</strong> go to <em>Settings → Account</em> and choose "Delete account".</li>
          <li><strong>By email:</strong> contact <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent }}>support@wefixtrades.com</a> from (or naming) the email address on your account and ask us to delete your data.</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          We permanently delete or anonymize your personal data within <strong>30 days</strong>
          {" "}of a verified request, except where we must retain certain records for legal,
          tax, or accounting reasons (see section 8). If you signed in or connected via
          Google, Microsoft, or Facebook/Meta, deleting your WeFixTrades account also removes
          the profile data we received from them — and you can additionally revoke our access
          in each provider's own settings.
        </p>
      </LegalSection>

      <LegalSection id="mobile" title="11. Our mobile app">
        <p>
          WeFixTrades is also available as a mobile app on the <strong>Apple App Store</strong>{" "}
          (iOS) and <strong>Google Play</strong> (Android). The app follows the same privacy
          practices described in this policy. In addition:
        </p>
        <ul style={ul}>
          <li>The app may collect device information and, with your permission, push-notification tokens and — only where a feature requires it (e.g. answering calls) — microphone access. It does not access your contacts, photos, or location unless you explicitly grant permission for a specific feature.</li>
          <li>On iOS you can also use <strong>Sign in with Apple</strong>, which lets you hide your email from us via Apple's private email relay.</li>
          <li>Our <strong>Apple App Privacy</strong> details and <strong>Google Play Data Safety</strong> disclosures are published on the respective store listings and reflect the practices in this policy.</li>
          <li>Your use of the app is also subject to the Apple App Store and Google Play terms.</li>
        </ul>
      </LegalSection>

      <LegalSection id="cookies" title="12. Cookies and similar technologies">
        <p>
          We use strictly necessary cookies for login sessions and security. With your consent, we may also use analytics cookies to measure site performance. We don't use third-party advertising trackers (no Meta Pixel, no Google Ads retargeting) on the public marketing site. See our full <a href="/cookies" style={{ color: mkt.accent }}>Cookie Policy</a>.
        </p>
      </LegalSection>

      <LegalSection id="security" title="13. Security">
        <p>
          We protect personal information with industry-standard technical and organizational measures: TLS for data in transit, encryption at rest for sensitive fields (OAuth tokens, session data), access controls and audit logging, and regular dependency patching. Our infrastructure runs on SOC 2 / ISO 27001-certified providers (AWS, Cloudflare) — see our <a href="/security" style={{ color: mkt.accent }}>Security page</a>. No system is perfect — if we experience a breach involving your personal information, we'll notify affected customers without undue delay as required by law.
        </p>
      </LegalSection>

      <LegalSection id="transfers" title="14. International transfers">
        <p>
          We operate out of the United States. If you access the Service from outside the US, you understand your information may be transferred to, stored, and processed in the US and other jurisdictions where our service providers operate. For EU/UK transfers, we rely on Standard Contractual Clauses with our processors where applicable.
        </p>
      </LegalSection>

      <LegalSection id="children" title="15. Children">
        <p>
          The Service is not directed to children under 16. We don't knowingly collect information from children. If you believe we've inadvertently collected information from a child, email <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent }}>support@wefixtrades.com</a> and we'll delete it.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="16. Changes to this Policy">
        <p>
          We may update this Privacy Policy from time to time. If we make material changes, we'll notify active customers by email and post a notice on the Service at least 14 days before changes take effect. Continued use after the effective date means you accept the updated policy.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="17. Contact">
        <p>
          Questions about this Privacy Policy or our data practices? Email <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent }}>support@wefixtrades.com</a>. Mailing address: MR Holdings &amp; Trade LLC, 30 N Gould St, Ste R, Sheridan, WY 82801, United States.
        </p>
        <p style={{ marginTop: 12 }}>
          EU/UK customers: if you're not satisfied with our response, you have the right to complain to your local data protection authority.
        </p>
      </LegalSection>

      <p style={{ fontSize: 12, color: mkt.onDarkFaint, marginTop: 40, paddingTop: 20, borderTop: `1px solid ${mkt.onDarkBorder}`, lineHeight: 1.6 }}>
        Last updated {EFFECTIVE}. A Data Processing Addendum for GDPR-regulated customers is available on request.
      </p>
    </LegalShell>
  );
}
