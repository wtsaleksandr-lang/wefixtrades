import { mkt } from "@/theme/tokens";
import { LegalShell, LegalSection, type TocItem } from "@/components/marketing/legal/LegalLayout";

/**
 * Privacy Policy — MR Holdings & Trade LLC (operating as "WeFixTrades")
 *
 * AI-drafted baseline covering the main US/Canada requirements plus a
 * reasonable GDPR posture. Includes OAuth sign-in (Google/Microsoft/Facebook),
 * Google API Limited-Use, an explicit data-deletion path (required by Meta,
 * Apple, and Google Play), the QuoteQuick roof/solar lead-capture widget data
 * flow, and a mobile-app section.
 *
 * IMPORTANT — this is a DRAFT for legal counsel. It is NOT final legal advice.
 * It must be reviewed and finalized by a qualified attorney before being relied
 * on, especially the items marked [COUNSEL: …] below (exact lead retention
 * period, the final CPRA "sale/share" determination, and the DSAR response SLA),
 * and before regulated verticals, enterprise, or EU market entry.
 *
 * Last full review: 2026-06-23.
 */

const ul = { paddingLeft: 20, marginTop: 8 } as const;
const a = { color: mkt.accent, textDecoration: "underline" } as const;
const EFFECTIVE = "June 23, 2026";

const TOC: TocItem[] = [
  { id: "who", label: "1. Who this applies to" },
  { id: "collect", label: "2. Information we collect" },
  { id: "widget", label: "3. The QuoteQuick quote & lead-capture widget" },
  { id: "use", label: "4. How we use it" },
  { id: "bases", label: "5. Legal bases (EU/UK)" },
  { id: "share", label: "6. How we share" },
  { id: "signin", label: "7. Signing in with Google, Microsoft & Facebook" },
  { id: "google-api", label: "8. Google API — Limited Use" },
  { id: "retention", label: "9. How long we keep it" },
  { id: "rights", label: "10. Your rights" },
  { id: "deletion", label: "11. Deleting your data" },
  { id: "mobile", label: "12. Our mobile app" },
  { id: "cookies", label: "13. Cookies" },
  { id: "security", label: "14. Security" },
  { id: "transfers", label: "15. International transfers" },
  { id: "children", label: "16. Children" },
  { id: "changes", label: "17. Changes" },
  { id: "contact", label: "18. Contact" },
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
        <p>This policy applies to three groups:</p>
        <ul style={ul}>
          <li><strong>Customers</strong> — trades businesses (e.g. roofing and solar contractors) that buy a subscription or service from us.</li>
          <li><strong>Visitors</strong> — anyone browsing our public website, filling in a form, or calling our published phone line.</li>
          <li><strong>Homeowners</strong> — people who use a QuoteQuick quote / lead-capture widget embedded on one of our customers' websites to request a roof or solar quote, even though they don't have a WeFixTrades account.</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          Our customers also operate systems on their own customers' behalf (for example, a plumber using TradeLine to answer calls from homeowners, or a roofer using a QuoteQuick widget to capture quote requests). In those flows, the customer (the contractor) is the data <strong>controller</strong> of the homeowner's information and we act as a <strong>service provider / processor</strong> on their behalf. Our customers are responsible for their own privacy notices to their end users.
        </p>
        <p style={{ marginTop: 12 }}>
          Separately, WeFixTrades is an <strong>independent controller</strong> for its own operational uses of that data — fraud and abuse prevention, security, product analytics and improvement, and powering the AI roof/solar "see-it-on-your-house" render feature. Section 3 explains the widget flow in detail.
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

        <p><strong>Quote &amp; lead-capture widget (homeowners):</strong> when you request a roof or solar quote through a QuoteQuick widget embedded on one of our customers' sites, we collect:</p>
        <ul style={{ ...ul, marginBottom: 12 }}>
          <li>Your <strong>name</strong> and <strong>email address</strong> (required), and your <strong>phone number</strong> (optional)</li>
          <li>The <strong>property address</strong> you enter to generate the quote</li>
          <li><strong>Project details</strong> you provide — your timeframe (e.g. "as soon as possible"), what matters most to you (e.g. lower my bill, backup power), and whether you ask to book an on-site assessment</li>
          <li><strong>Derived roof &amp; solar property data</strong> computed from satellite, aerial, and elevation imagery for that address — roof measurements (area, squares, facets, pitch), estimated solar system size, and the estimated price range we show you</li>
          <li><strong>Consent metadata</strong> for any SMS opt-in — a timestamp, the consent text version you saw, the page URL, and (computed server-side, never trusted from your browser) a one-way hash of your IP address and your browser's user-agent string, kept as an audit trail</li>
        </ul>

        <p><strong>Information we receive from third parties:</strong></p>
        <ul style={ul}>
          <li>Sign-in providers — Google, Microsoft, and Facebook/Meta — when you sign in with them (see section 7)</li>
          <li>Google (Business Profile data, Search Console metrics) when you connect these</li>
          <li>Meta (Facebook/Instagram Page info) when you connect these</li>
          <li>Stripe (payment confirmations, subscription status)</li>
          <li>Public sources (business directories, Google Maps) for our free audit tool</li>
          <li>Mapping / imagery providers (Google Maps, Google Solar, Street View, aerial imagery) used to geocode a quote address and measure the roof for the widget</li>
        </ul>
      </LegalSection>

      <LegalSection id="widget" title="3. The QuoteQuick quote & lead-capture widget">
        <p>
          QuoteQuick is an instant roof &amp; solar quoting tool our customers (contractors) embed on their own websites. A homeowner types in their property address, we measure the roof from satellite and aerial imagery and show an instant estimate, and — if the homeowner chooses to "see their full quote" — they submit their contact details to receive it. This section explains what happens to a homeowner's information in that flow specifically.
        </p>
        <p style={{ marginTop: 12 }}>
          <strong>Who controls the data.</strong> The widget belongs to the <strong>contractor</strong>, and the homeowner is requesting a quote <em>from that contractor</em>. For the lead itself, the contractor is the <strong>controller</strong> and WeFixTrades acts as a <strong>service provider / processor</strong> that captures, stores, and routes the lead on the contractor's behalf. WeFixTrades is also an <strong>independent controller</strong> for its own limited operational purposes — fraud and abuse prevention, security, aggregate product analytics and improvement, and generating the AI "see-it-on-your-house" roof/solar render.
        </p>
        <p style={{ marginTop: 12 }}>
          <strong>What we collect.</strong> See the "Quote &amp; lead-capture widget" list in section 2 — name, email, optional phone, property address, project details, and the derived roof/solar property data and pricing estimate.
        </p>
        <p style={{ marginTop: 12 }}>
          <strong>Consent at submission.</strong> A notice is shown directly above the submit button telling you that, by submitting, you agree to share your details with that contractor and with WeFixTrades to prepare your quote, with a link to this Privacy Policy. Submitting the form is your consent to that sharing. If you provide a phone number and opt in to text messages, that SMS consent — and the exact wording you agreed to — is recorded (see section 7 of the consent points below and the SMS / text-message note at the end of this section).
        </p>
        <p style={{ marginTop: 12 }}>
          <strong>Where the lead goes.</strong> Section 6 ("How we share") describes the full fan-out: the lead is delivered to the contractor whose widget you used, and — at that contractor's choice — to their connected tools (CRM, Zapier, Make, GoHighLevel, Google Sheets, Slack, or a custom webhook). We also use our own processors (email and SMS providers; and the AI image / vision providers that power the render feature).
        </p>
        <p style={{ marginTop: 12 }}>
          <strong>SMS / text messages.</strong> We only send you text messages if you provided a phone number and consented at submission. Every message includes carrier-standard opt-out instructions; reply <strong>STOP</strong> to opt out at any time, or <strong>HELP</strong> for help. Standard message and data rates may apply. This consent is captured to support our customers' compliance with the US TCPA and Canada's CASL — [COUNSEL: confirm the consent language meets the express-written-consent standard you want to rely on for marketing vs. transactional texts].
        </p>
        <p style={{ marginTop: 12 }}>
          <strong>Your choices as a homeowner.</strong> You don't need a WeFixTrades account to ask us to access or delete the lead we hold about you — see section 10 ("Your rights").
        </p>
      </LegalSection>

      <LegalSection id="use" title="4. How we use information">
        <p>We use the information above to:</p>
        <ul style={ul}>
          <li>Provide, maintain, and improve the Service</li>
          <li>Process payments and manage subscriptions</li>
          <li>Configure and run the services you've purchased (including training AI assistants with your business information)</li>
          <li>Capture, measure, and route homeowner quote requests from the QuoteQuick widget to the contractor and their connected tools, and generate the AI roof/solar render for the quote</li>
          <li>Send transactional emails and text messages (receipts, onboarding, quote-ready and quote-expiring notices, service updates, support)</li>
          <li>Send marketing emails — only to people who've opted in; you can unsubscribe any time</li>
          <li>Detect and prevent fraud, abuse, and security incidents</li>
          <li>Comply with legal obligations</li>
          <li>Produce anonymized aggregate analytics that never identify an individual</li>
        </ul>
      </LegalSection>

      <LegalSection id="bases" title="5. Legal bases (for EU/UK visitors)">
        <p>If you're in the EU or UK, we process your personal information on the following legal bases (as applicable):</p>
        <ul style={ul}>
          <li><strong>Contract</strong> — to deliver the Service you've signed up for</li>
          <li><strong>Legitimate interest</strong> — to run the business, keep the Service secure, measure performance</li>
          <li><strong>Consent</strong> — for marketing emails and non-essential cookies</li>
          <li><strong>Legal obligation</strong> — to comply with tax, accounting, and legal requests</li>
        </ul>
      </LegalSection>

      <LegalSection id="share" title="6. How we share information">
        <p>
          We don't sell your personal information for money, and we don't share it for cross-context behavioral advertising. We share it (a) with the businesses you are asking to serve you, and (b) with service providers who help us operate the Service, and only to the extent they need it.
        </p>

        <p style={{ marginTop: 16 }}><strong>Quote &amp; lead-capture widget — where a homeowner's lead goes.</strong> When you submit a quote request through a QuoteQuick widget, your lead is shared as follows:</p>
        <ul style={ul}>
          <li><strong>The contractor whose widget you used</strong> — the business you are requesting a quote from. This is the whole point of the widget: your details are delivered to that contractor so they can prepare and send your quote and follow up with you.</li>
          <li><strong>That contractor's connected tools</strong> — if the contractor has set them up, your lead is also routed to their chosen integration: a <strong>CRM</strong>, <strong>Zapier</strong>, <strong>Make</strong>, <strong>GoHighLevel</strong>, <strong>Google Sheets</strong>, <strong>Slack</strong>, or a <strong>custom webhook</strong>. The contractor — not WeFixTrades — chooses and controls these destinations.</li>
          <li><strong>Our own processors</strong> — email and SMS providers to deliver your quote and notifications, and the AI image / vision providers below that power the roof/solar render.</li>
        </ul>

        <p style={{ marginTop: 16 }}><strong>Service providers we use to operate the Service:</strong></p>
        <ul style={ul}>
          <li><strong>Stripe</strong> — payment processing</li>
          <li><strong>Anthropic / OpenAI</strong> — the AI that powers our assistants, content, and images</li>
          <li><strong>Replicate, OpenAI, and Google (Gemini)</strong> — the AI image and vision providers that generate the roof/solar "see-it-on-your-house" render and detect roof features from imagery for the widget</li>
          <li><strong>Vapi</strong> — voice AI for phone calls</li>
          <li><strong>Twilio</strong> — SMS (including homeowner quote-ready / quote-expiring texts and any product you use)</li>
          <li><strong>ElevenLabs / Deepgram</strong> — voice synthesis and speech-to-text for TradeLine</li>
          <li><strong>SendGrid / SMTP providers</strong> — transactional email</li>
          <li><strong>Google</strong> — sign-in, Business Profile, Maps, Solar &amp; Street View imagery (for the widget), analytics</li>
          <li><strong>Microsoft</strong> — sign-in (identity)</li>
          <li><strong>Meta</strong> — sign-in, Facebook / Instagram posting APIs</li>
          <li><strong>White-label service partners</strong> — third-party agencies and freelancers who fulfill specific services. We share only the minimum business info they need.</li>
          <li><strong>Hosting and infrastructure providers</strong> — AWS (hosting), Cloudflare (CDN &amp; security), monitoring</li>
        </ul>

        <p style={{ marginTop: 16 }}>
          <strong>CCPA/CPRA "sale" and "share".</strong> We do not sell personal information for money and we do not "share" it for cross-context behavioral advertising as those terms are defined under California's CPRA. Routing a homeowner's lead to the contractor they are requesting a quote from (and to that contractor's chosen CRM/integration) is a disclosure the consumer directs and reasonably expects — generally treated as a consumer-directed disclosure rather than a "sale" — and our other vendors act as service providers under written terms that bar them from using the data for their own purposes. [COUNSEL: confirm the final CPRA characterization of the lead-to-contractor-and-CRM flow — consumer-directed disclosure vs. "sale/share" — and confirm whether a "Do Not Sell or Share My Personal Information" link and Global Privacy Control (GPC) honoring are required here. If so, we will add the link and honor GPC signals; this is a placeholder pending that determination.]
        </p>

        <p style={{ marginTop: 12 }}>
          We may also share information: (a) with your consent; (b) to comply with legal process or government requests; (c) to protect rights, property, or safety; (d) in connection with a merger, acquisition, or sale of assets — in which case we'll notify active customers before the transfer.
        </p>
      </LegalSection>

      <LegalSection id="signin" title="7. Signing in with Google, Microsoft & Facebook">
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
          product is a separate step, covered in section 8 and section 6.)
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

      <LegalSection id="google-api" title="8. Google API Services — Limited Use disclosure">
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

      <LegalSection id="retention" title="9. How long we keep information">
        <p>We retain personal information for as long as your account is active or as needed to provide the Service, then:</p>
        <ul style={ul}>
          <li><strong>Active accounts</strong> — data retained while the subscription is active</li>
          <li><strong>Canceled accounts</strong> — retained for 90 days in case of reactivation, then anonymized</li>
          <li><strong>Quote &amp; lead-capture widget leads</strong> — a homeowner's lead (contact details, property address, project details, and derived roof/solar data) is retained while the contractor's account is active so the contractor can work the lead, and for a defined period afterward, unless the homeowner or the contractor asks us to delete it sooner. [COUNSEL: set the exact retention period for widget leads — e.g. retained for the life of the contractor's account plus N months/years, or N months from capture — and confirm it against any contractor data-retention commitments.] The TCPA/CASL SMS-consent audit fields (consent timestamp, text version, IP hash, user-agent) are retained as long as needed to evidence consent for any messaging dispute. [COUNSEL: confirm the consent-record retention period.]</li>
          <li><strong>Billing records</strong> — retained for 7 years to meet tax and accounting requirements</li>
          <li><strong>Call recordings and transcripts</strong> — retained by Vapi per their policy (typically 7 days; longer on paid retention)</li>
          <li><strong>Support emails</strong> — retained while you're a customer, then archived for 2 years</li>
        </ul>
        <p style={{ marginTop: 12 }}>You can request earlier deletion — see "Deleting your data" below.</p>
      </LegalSection>

      <LegalSection id="rights" title="10. Your rights">
        <p>Depending on where you live, you may have the right to:</p>
        <ul style={ul}>
          <li>Access the personal information we hold about you</li>
          <li>Correct inaccurate information</li>
          <li>Delete your data ("right to be forgotten")</li>
          <li>Export your data in a portable format</li>
          <li>Object to or restrict certain processing</li>
          <li>Withdraw consent for marketing or text messages at any time (for SMS, reply STOP)</li>
          <li>Opt out of the sale or sharing of personal information (we don't sell for money or share for cross-context behavioral advertising — see section 6 — but the right is here if required by law)</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          To exercise any of these rights, email <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent }}>support@wefixtrades.com</a> or <a href="mailto:privacy@wefixtrades.com" style={{ color: mkt.accent }}>privacy@wefixtrades.com</a>. We'll verify your identity and respond within 30 days (sooner where required by law). [COUNSEL: confirm the response SLA per CCPA/CPRA (45 days, extendable) and PIPEDA, and whether privacy@ should be the canonical DSAR intake.]
        </p>
        <p style={{ marginTop: 12 }}>
          <strong>Homeowners without an account (widget leads):</strong> you don't need a WeFixTrades account to exercise these rights over the lead we hold about you. Email <a href="mailto:privacy@wefixtrades.com" style={{ color: mkt.accent }}>privacy@wefixtrades.com</a> (or <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent }}>support@wefixtrades.com</a>) from — or naming — the <strong>email address or phone number you used</strong> to submit the quote request, and tell us what you'd like (access, correction, or deletion). We use that email/phone to locate and verify your lead. Because the contractor is the controller of that lead, we may also forward a deletion or access request to the relevant contractor and act on their instruction.
        </p>
        <p style={{ marginTop: 12 }}>
          <strong>California residents:</strong> we comply with the CCPA/CPRA. In the past 12 months we have <em>not</em> sold personal information for money or shared it for cross-context behavioral advertising. We do disclose homeowner widget leads to the contractor the homeowner requested a quote from and to that contractor's chosen integrations, as described in section 6 — see the CPRA note there.
        </p>
        <p style={{ marginTop: 12 }}>
          <strong>Canadian residents:</strong> we comply with PIPEDA and applicable provincial privacy laws, and (for any text messages) Canada's Anti-Spam Legislation (CASL).
        </p>
      </LegalSection>

      {/* Anchor alias: external references (Meta App dashboard "Data Deletion
          Instructions URL", repo platform-approval docs, the data-deletion
          callback's status page) link to /privacy#data-deletion. Keep both
          ids working so those external links stay stable. */}
      <span id="data-deletion" aria-hidden="true" style={{ display: "block", scrollMarginTop: 96 }} />
      <LegalSection id="deletion" title="11. Deleting your data">
        <p>You can delete your WeFixTrades account and the personal data we hold at any time:</p>
        <ul style={ul}>
          <li><strong>In the app:</strong> go to <em>Settings → Account</em> and choose "Delete account".</li>
          <li><strong>By email:</strong> contact <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent }}>support@wefixtrades.com</a> from (or naming) the email address on your account and ask us to delete your data.</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          We permanently delete or anonymize your personal data within <strong>30 days</strong>
          {" "}of a verified request, except where we must retain certain records for legal,
          tax, or accounting reasons (see section 9). If you signed in or connected via
          Google, Microsoft, or Facebook/Meta, deleting your WeFixTrades account also removes
          the profile data we received from them — and you can additionally revoke our access
          in each provider's own settings.
        </p>
      </LegalSection>

      <LegalSection id="mobile" title="12. Our mobile app">
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

      <LegalSection id="cookies" title="13. Cookies and similar technologies">
        <p>
          We use strictly necessary cookies for login sessions and security. With your consent, we may also use analytics cookies to measure site performance. We don't use third-party advertising trackers (no Meta Pixel, no Google Ads retargeting) on the public marketing site. See our full <a href="/cookies" style={{ color: mkt.accent }}>Cookie Policy</a>.
        </p>
      </LegalSection>

      <LegalSection id="security" title="14. Security">
        <p>
          We protect personal information with industry-standard technical and organizational measures: TLS for data in transit, encryption at rest for sensitive fields (OAuth tokens, session data), access controls and audit logging, and regular dependency patching. Our infrastructure runs on SOC 2 / ISO 27001-certified providers (AWS, Cloudflare) — see our <a href="/security" style={{ color: mkt.accent }}>Security page</a>. No system is perfect — if we experience a breach involving your personal information, we'll notify affected customers without undue delay as required by law.
        </p>
      </LegalSection>

      <LegalSection id="transfers" title="15. International transfers">
        <p>
          We operate out of the United States. If you access the Service from outside the US, you understand your information may be transferred to, stored, and processed in the US and other jurisdictions where our service providers operate. For EU/UK transfers, we rely on Standard Contractual Clauses with our processors where applicable.
        </p>
      </LegalSection>

      <LegalSection id="children" title="16. Children">
        <p>
          The Service is not directed to children under 16. We don't knowingly collect information from children. If you believe we've inadvertently collected information from a child, email <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent }}>support@wefixtrades.com</a> and we'll delete it.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="17. Changes to this Policy">
        <p>
          We may update this Privacy Policy from time to time. If we make material changes, we'll notify active customers by email and post a notice on the Service at least 14 days before changes take effect. Continued use after the effective date means you accept the updated policy.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="18. Contact">
        <p>
          Questions about this Privacy Policy or our data practices? Email <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent }}>support@wefixtrades.com</a>. Mailing address: MR Holdings &amp; Trade LLC, 30 N Gould St, Ste R, Sheridan, WY 82801, United States.
        </p>
        <p style={{ marginTop: 12 }}>
          EU/UK customers: if you're not satisfied with our response, you have the right to complain to your local data protection authority.
        </p>
      </LegalSection>

      <p style={{ fontSize: 12, color: mkt.onDarkFaint, marginTop: 40, paddingTop: 20, borderTop: `1px solid ${mkt.onDarkBorder}`, lineHeight: 1.6 }}>
        Last updated {EFFECTIVE}. A Data Processing Addendum for GDPR-regulated customers is available on request. This policy is a working draft prepared with the help of AI and is provided for transparency; it is not legal advice and has not yet been finalized by our legal counsel. Several points (exact lead-data retention, the final CCPA/CPRA "sale/share" determination, and data-subject-request timelines) remain under attorney review.
      </p>
    </LegalShell>
  );
}
