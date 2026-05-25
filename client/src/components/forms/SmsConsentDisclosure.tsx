/**
 * SmsConsentDisclosure
 *
 * Renders the SMS opt-in disclosure block required immediately after any
 * customer-facing phone-number input on wefixtrades.com.
 *
 * Required by Twilio A2P 10DLC campaign approval. Previously rejected with
 * error 30909 (MESSAGE_FLOW) for missing inline consent language. The wording
 * here is the exact text Twilio expects and must not be paraphrased without
 * coordinating a re-submission of the campaign.
 *
 * Two render variants:
 *  - "tailwind" (default): for surfaces that load our Tailwind stylesheet
 *    (admin, portal, marketing, public booking pages).
 *  - "inline": for the embedded quote widget that runs on third-party
 *    customer sites WITHOUT our Tailwind stylesheet. Uses only inline
 *    styles so the disclosure renders correctly in any host page.
 */

export type SmsConsentDisclosureVariant = "tailwind" | "inline";

interface SmsConsentDisclosureProps {
  variant?: SmsConsentDisclosureVariant;
  className?: string;
}

const DISCLOSURE_BODY =
  "By providing your phone number, you agree to receive SMS messages from WeFixTrades for quotes, appointment confirmations, support responses, and service reminders. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. See our ";

export function SmsConsentDisclosure({
  variant = "tailwind",
  className,
}: SmsConsentDisclosureProps) {
  if (variant === "inline") {
    return (
      <p
        data-testid="sms-consent-disclosure"
        style={{
          marginTop: 6,
          marginBottom: 0,
          fontSize: 11,
          lineHeight: 1.4,
          color: "#6b7280",
        }}
      >
        {DISCLOSURE_BODY}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#6b7280", textDecoration: "underline" }}
        >
          Privacy Policy
        </a>
        .
      </p>
    );
  }

  return (
    <p
      data-testid="sms-consent-disclosure"
      className={
        className ??
        "mt-1.5 text-xs leading-snug text-muted-foreground"
      }
    >
      {DISCLOSURE_BODY}
      <a
        href="/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-foreground"
      >
        Privacy Policy
      </a>
      .
    </p>
  );
}

export default SmsConsentDisclosure;
