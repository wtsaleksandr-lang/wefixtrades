/**
 * Wave 84 (W-SMS-9) — SMS segment math + encoding detection.
 *
 * Twilio bills per *segment*, not per message. A segment is:
 *   - 160 chars (GSM-7) for a single-segment ASCII message
 *   - 153 chars per segment when the body spans multiple segments (the 7
 *     reserved bits go to UDH concatenation headers)
 *   - 70 chars for a single-segment UCS-2 (Unicode) message
 *   - 67 chars per segment when a Unicode message spans multiple segments
 *
 * Single chokepoint: `sendSMS()` in `server/twilioClient.ts` consults this
 * helper to know how many segments to bill, so cost attribution is correct
 * for every path that hits Twilio.
 *
 * Encoding detection is best-effort. Twilio itself decides the encoding
 * server-side based on the actual byte content; we mirror their rule:
 * if every character is in the GSM-7 alphabet (approximated by a forgiving
 * ASCII + common-punctuation regex), the message ships GSM-7. Otherwise it
 * ships UCS-2. False positives on rare GSM-7 extension chars (€, {, }, [,
 * ], ~, |, \, ^) are accepted — they'd cost an extra GSM-7 byte each in
 * reality, but at the per-segment 1c rounding granularity that's noise.
 */

/**
 * Conservative GSM-7-compatible character set. Covers ASCII letters,
 * digits, common punctuation, whitespace. Characters outside this set
 * force UCS-2 (Unicode) encoding for the whole body.
 */
const GSM7_PATTERN = /^[A-Za-z0-9 .,!?@#$%&*()_+\-=\[\]{};':"\\|<>/`~\n\r]+$/;

export type SmsEncoding = "GSM-7" | "UCS-2";

export interface SmsSegmentInfo {
  segments: number;
  encoding: SmsEncoding;
}

/**
 * Compute the segment count + encoding for an outbound SMS body.
 *
 * Empty bodies return 1 segment / GSM-7 (Twilio still bills the API call).
 */
export function calculateSmsSegments(body: string): SmsSegmentInfo {
  const text = body ?? "";
  if (text.length === 0) {
    return { segments: 1, encoding: "GSM-7" };
  }

  const isGsm7 = GSM7_PATTERN.test(text);

  if (isGsm7) {
    if (text.length <= 160) return { segments: 1, encoding: "GSM-7" };
    return { segments: Math.ceil(text.length / 153), encoding: "GSM-7" };
  }

  if (text.length <= 70) return { segments: 1, encoding: "UCS-2" };
  return { segments: Math.ceil(text.length / 67), encoding: "UCS-2" };
}
