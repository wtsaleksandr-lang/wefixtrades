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

/**
 * Wave 88 — TCR vetting bot fallback. The Twilio / TCR A2P 10DLC vetting
 * scraper does NOT execute JavaScript, so it sees the unhydrated React
 * shell (empty `<div id="root">`) for every route. The site-wide
 * prerender (`scripts/seo/prerender-routes.mjs`) only splices `<head>`
 * tags into the shell, not body content.
 *
 * To get the consent content into the static HTML that TCR fetches, we
 * render the disclosure copy inside a hidden `<div data-noscript-fallback>`
 * here (brand, opt-in/opt-out keywords, STOP/HELP, rate language,
 * frequency, privacy + terms links). The prerender script's body-capture
 * pass (see `scripts/seo/prerender-routes.mjs`) finds elements matching
 * that selector, lifts their innerHTML out, wraps it in a real
 * `<noscript>` tag, and inlines it into the shell's `<div id="root">` so
 * a no-JS fetch of `/sms-consent-disclosure` shows the full disclosure
 * — satisfying TCR's vetting requirements.
 *
 * Why not a literal `<noscript>` here? In a JS-enabled browser (including
 * Playwright during prerender capture), `<noscript>` content is parsed as
 * raw text/CDATA, not as DOM children — so `querySelector` can't reach
 * it and the prerender script would see an empty noscript. A regular
 * hidden div is fully addressable.
 *
 * Visual users never see this block (`display: none`). Hydration is
 * unaffected — React 18 mounts cleanly over arbitrary children of the
 * root element.
 */
function ConsentNoScriptFallback() {
  return (
    <div data-noscript-fallback="sms-consent" style={{ display: "none" }} aria-hidden="true">
      <div style={{ padding: 24, maxWidth: 760, margin: "0 auto", fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
        <h1>SMS Consent &amp; Disclosure — WeFixTrades</h1>
        <p>
          <strong>Effective {EFFECTIVE}.</strong> Brand: MR Holdings &amp; Trade
          LLC, operating as <strong>WeFixTrades</strong>. This page describes
          how WeFixTrades sends SMS / MMS text messages on behalf of trades
          businesses (plumbers, electricians, HVAC contractors, cleaners,
          roofers, landscapers, and similar service providers) to their
          customers, leads, and contacts, and how a recipient can stop those
          messages at any time. It is provided to satisfy A2P 10DLC carrier
          and Twilio consent disclosure requirements.
        </p>

        <h2>Message categories</h2>
        <p>
          Recipients who provide their phone number to a business that uses
          WeFixTrades may receive: appointment confirmations, appointment
          reminders, quote and estimate updates, service / dispatch updates,
          review requests, and direct operational replies to messages the
          recipient sent the business. Marketing or promotional SMS are not
          sent unless the business has separately collected marketing consent.
        </p>

        <h2>How opt-in is collected</h2>
        <p>
          Recipients affirmatively opted in by submitting a quote or booking
          form on the business's website (with a clear SMS authorization
          statement), agreeing by phone or to the business's AI assistant to
          a follow-up text, initiating a text conversation with the business,
          or as an existing customer who previously provided their number
          for service matters.
        </p>

        <h2>Message frequency</h2>
        <p>
          Frequency varies based on activity. A typical recipient receives
          between 1 and 10 messages per month while an active quote, booking,
          or service is in progress, and fewer outside of active engagements.
          No recurring messages on a fixed automated schedule.
        </p>

        <h2>Message and data rates</h2>
        <p>
          <strong>Message and data rates may apply.</strong> SMS and MMS
          charges are set by the recipient's wireless carrier and are not
          controlled by WeFixTrades. Check with your carrier for plan details.
        </p>

        <h2>How to opt out (STOP)</h2>
        <p>
          Reply with <strong>STOP</strong>, <strong>STOPALL</strong>,
          <strong> UNSUBSCRIBE</strong>, <strong>CANCEL</strong>,
          <strong> END</strong>, or <strong>QUIT</strong> to any message
          thread to stop receiving SMS. After STOP, you will receive a single
          confirmation message and no further SMS from that business through
          WeFixTrades unless you opt back in. To opt back in, reply
          <strong> START</strong> or <strong>UNSTOP</strong>. Opting out of
          SMS does not cancel any service, quote, or booking with the
          business — contact the business directly to cancel.
        </p>

        <h2>How to get help (HELP)</h2>
        <p>
          Reply <strong>HELP</strong> to any message and you will receive a
          short response with the business's name, this disclosure page URL,
          and support contact instructions. For SMS-specific issues with the
          WeFixTrades platform, email{" "}
          <a href="mailto:support@wefixtrades.com">support@wefixtrades.com</a>
          {" "}or contact our support team.
        </p>

        <h2>Supported carriers</h2>
        <p>
          WeFixTrades sends through Twilio over the major U.S. and Canadian
          carrier networks: AT&amp;T, Verizon, T-Mobile, US Cellular, Sprint,
          Rogers, Bell, Telus, plus MVNO resellers. Carriers are not liable
          for delayed or undelivered messages.
        </p>

        <h2>Privacy and terms</h2>
        <p>
          Phone numbers, message content, and delivery metadata are processed
          per our <a href="/privacy">Privacy Policy</a> and use of the
          messaging service is governed by our{" "}
          <a href="/terms">Terms of Service</a>. Phone numbers are not sold,
          rented, or shared with third parties for their own marketing.
        </p>

        <h2>Contact for SMS support</h2>
        <p>
          Email: <a href="mailto:support@wefixtrades.com">support@wefixtrades.com</a>.
          Web: <a href="/contact">wefixtrades.com/contact</a>. Mailing address:
          MR Holdings &amp; Trade LLC, 30 N Gould St, Ste R, Sheridan, WY
          82801, United States.
        </p>
      </div>
    </div>
  );
}

export default function SmsConsentDisclosurePage() {
  return (
    <MarketingLayout>
      <PageMeta
        title="SMS consent & disclosure"
        description="How WeFixTrades uses SMS, what messages we send, message frequency, rate disclosures, opt-out instructions, and SMS support contact."
        canonical="/sms-consent-disclosure"
      />
      <ConsentNoScriptFallback />
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
