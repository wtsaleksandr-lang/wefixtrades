import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { mkt } from "@/theme/tokens";
import { V7Hero, V7Section, V7Container, V7PageShell } from "@/components/marketing/v7";

/**
 * SMS Consent &amp; Disclosure — public page required by Twilio for A2P 10DLC
 * campaign re-submission. The campaign vetting reviewer must be able to fetch
 * this page anonymously and confirm:
 *   - Brand identification
 *   - Description of SMS use cases
 *   - Standard rate / frequency disclosures
 *   - STOP / HELP keywords
 *   - Privacy policy + Terms of Service links
 *   - Contact for SMS support
 *
 * Route: /sms-consent-disclosure  (no auth)
 *
 * Wave 76 — keep static and dependency-free. The page is part of the marketing
 * critical path because Twilio's vetting bot will scrape it; the content must
 * be present in the static HTML, not behind a chunk.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: mkt.onDark,
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: `1px solid ${mkt.onDarkBorder}`,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}

const EFFECTIVE = "May 28, 2026";

export default function SmsConsentDisclosurePage() {
  return (
    <MarketingLayout>
      <PageMeta
        title="SMS consent & disclosure"
        description="How WeFixTrades uses SMS, what messages we send, message frequency, rate disclosures, opt-out instructions, and SMS support contact."
        canonical="/sms-consent-disclosure"
      />
      <V7PageShell>
        <V7Hero
          productName="Legal"
          headline="SMS Consent & Disclosure"
          sub={`Effective ${EFFECTIVE}`}
        />
        <V7Section padding="40px">
          <V7Container maxWidth={760}>
            <div
              style={{
                background: mkt.sectionLight,
                borderRadius: 24,
                padding: "44px",
                border: `1px solid ${mkt.onDarkBorder}`,
              }}
            >
              <p
                style={{
                  fontSize: 15,
                  color: mkt.onDarkMuted,
                  lineHeight: 1.75,
                  marginBottom: 32,
                }}
              >
                This page describes how MR Holdings &amp; Trade LLC (operating as
                "<strong>WeFixTrades</strong>") sends text messages (SMS / MMS) to the
                customers, leads, and business contacts of the trades businesses
                that use our platform, and how a recipient can stop those messages
                at any time. It is provided to satisfy carrier and Twilio A2P 10DLC
                disclosure requirements for the WeFixTrades messaging sender.
              </p>

              <Section title="1. Who is sending these messages">
                <p>
                  Messages are sent by <strong>WeFixTrades</strong> on behalf of the
                  trades business (the plumber, electrician, HVAC contractor, cleaner,
                  roofer, landscaper, or similar service provider) that you contacted
                  or transacted with. The sender identification in each message will
                  identify the business by name.
                </p>
                <p style={{ marginTop: 12 }}>
                  WeFixTrades is the operator of the messaging infrastructure and is
                  the registered A2P 10DLC sender. Our trades-business customers are
                  the originators of the underlying communications and are
                  responsible for the recipient relationship.
                </p>
              </Section>

              <Section title="2. What messages you will receive">
                <p>
                  If you have provided your phone number to a business that uses
                  WeFixTrades, you may receive the following categories of SMS or
                  MMS:
                </p>
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li>
                    <strong>Appointment confirmations</strong> — confirming that a
                    requested service visit has been scheduled.
                  </li>
                  <li>
                    <strong>Appointment reminders</strong> — sent shortly before a
                    scheduled service visit.
                  </li>
                  <li>
                    <strong>Quote and estimate updates</strong> — notifying you that
                    a quote you requested is ready, has been updated, or is about to
                    expire.
                  </li>
                  <li>
                    <strong>Service / dispatch updates</strong> — letting you know
                    when a technician is on the way, has been delayed, or has
                    completed a visit.
                  </li>
                  <li>
                    <strong>Review requests</strong> — inviting you to share feedback
                    after a completed service, with a link to a review form.
                  </li>
                  <li>
                    <strong>Operational replies</strong> — direct replies to a
                    message you sent the business (for example, asking a follow-up
                    question about a quote).
                  </li>
                </ul>
                <p style={{ marginTop: 12 }}>
                  We do not send marketing or promotional SMS to recipients of a
                  trades business unless that business has separately collected
                  marketing consent from you.
                </p>
              </Section>

              <Section title="3. How you opted in">
                <p>
                  You are receiving messages because you affirmatively provided your
                  phone number to a trades business in one of the following ways:
                </p>
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li>
                    You filled in a quote or booking form on the business's website
                    and the form clearly stated that submitting your number authorizes
                    SMS related to your inquiry.
                  </li>
                  <li>
                    You spoke with the business or its AI assistant by phone and
                    agreed to receive a follow-up confirmation or quote by text.
                  </li>
                  <li>
                    You initiated a conversation by texting the business's number.
                  </li>
                  <li>
                    You were an existing customer of the business and the business
                    contacted you on the number you previously provided for service
                    matters.
                  </li>
                </ul>
                <p style={{ marginTop: 12 }}>
                  Your phone number is not sold, rented, or shared with third
                  parties for their own marketing.
                </p>
              </Section>

              <Section title="4. Message frequency">
                <p>
                  Message frequency varies based on your activity with the business.
                  A typical recipient receives between 1 and 10 messages per month
                  while an active quote, booking, or service is in progress, and
                  fewer messages outside of active engagements. You will not receive
                  recurring messages on a fixed automated schedule.
                </p>
              </Section>

              <Section title="5. Message and data rates">
                <p>
                  Message and data rates may apply. SMS and MMS charges are set by
                  your wireless carrier and are not controlled by WeFixTrades or the
                  business. Check with your carrier for details on your specific
                  plan.
                </p>
              </Section>

              <Section title="6. How to stop messages (opt-out)">
                <p>
                  You can stop receiving messages at any time by replying with any
                  of the following keywords to the message thread:
                </p>
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li><strong>STOP</strong></li>
                  <li><strong>STOPALL</strong></li>
                  <li><strong>UNSUBSCRIBE</strong></li>
                  <li><strong>CANCEL</strong></li>
                  <li><strong>END</strong></li>
                  <li><strong>QUIT</strong></li>
                </ul>
                <p style={{ marginTop: 12 }}>
                  After you reply STOP you will receive a single confirmation
                  message acknowledging the opt-out, and you will not receive
                  further SMS from that business through WeFixTrades unless you
                  later opt back in. To opt back in, reply <strong>START</strong> or
                  <strong> UNSTOP</strong> to the same thread.
                </p>
                <p style={{ marginTop: 12 }}>
                  Opting out of SMS does not cancel any service, quote, or booking
                  with the business. To cancel an appointment or quote, contact the
                  business directly.
                </p>
              </Section>

              <Section title="7. How to get help">
                <p>
                  Reply <strong>HELP</strong> to any message and you will receive a
                  short response with the business's name, this page URL, and
                  instructions on how to reach support.
                </p>
                <p style={{ marginTop: 12 }}>
                  For SMS-specific issues with the WeFixTrades platform, email{" "}
                  <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent }}>
                    support@wefixtrades.com
                  </a>{" "}
                  or call our support line. Our support team can confirm opt-out
                  status, troubleshoot delivery issues, and assist with disputes.
                </p>
              </Section>

              <Section title="8. Supported carriers">
                <p>
                  WeFixTrades sends through Twilio over the major U.S. and Canadian
                  carrier networks, including AT&amp;T, Verizon, T-Mobile, US
                  Cellular, Sprint, Rogers, Bell, and Telus, plus their MVNO
                  resellers. Carriers are not liable for delayed or undelivered
                  messages.
                </p>
              </Section>

              <Section title="9. Privacy and data handling">
                <p>
                  Your phone number, message content, and delivery metadata are
                  processed and stored in accordance with our{" "}
                  <a href="/privacy" style={{ color: mkt.accent, textDecoration: "underline" }}>
                    Privacy Policy
                  </a>
                  . Message content may be retained by the business to provide
                  service history; aggregated, anonymized analytics may also be
                  retained by WeFixTrades to operate and improve the platform.
                </p>
                <p style={{ marginTop: 12 }}>
                  Use of the messaging service is also governed by our{" "}
                  <a href="/terms" style={{ color: mkt.accent, textDecoration: "underline" }}>
                    Terms of Service
                  </a>
                  .
                </p>
              </Section>

              <Section title="10. Contact for SMS support">
                <p>
                  Questions, complaints, or requests related to SMS from WeFixTrades:
                </p>
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  <li>
                    Email:{" "}
                    <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent }}>
                      support@wefixtrades.com
                    </a>
                  </li>
                  <li>
                    Web:{" "}
                    <a href="/contact" style={{ color: mkt.accent, textDecoration: "underline" }}>
                      wefixtrades.com/contact
                    </a>
                  </li>
                  <li>
                    Mailing address: MR Holdings &amp; Trade LLC, 30 N Gould St,
                    Ste R, Sheridan, WY 82801, United States.
                  </li>
                </ul>
              </Section>

              <p
                style={{
                  fontSize: 12,
                  color: mkt.onDarkFaint,
                  marginTop: 40,
                  paddingTop: 20,
                  borderTop: `1px solid ${mkt.onDarkBorder}`,
                  lineHeight: 1.6,
                }}
              >
                Last updated {EFFECTIVE}. This disclosure is provided to satisfy the
                A2P 10DLC campaign vetting requirements of Twilio and the U.S. /
                Canadian wireless carriers and does not modify the contractual
                relationship between you and the business that contacted you.
              </p>
            </div>
          </V7Container>
        </V7Section>
      </V7PageShell>
    </MarketingLayout>
  );
}
