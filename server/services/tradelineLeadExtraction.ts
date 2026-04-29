/**
 * TradeLine Lead Extraction (Phase 2.1)
 *
 * Given a completed call transcript, extract structured lead data via
 * Claude Haiku 4.5. Returns null on any failure rather than throwing —
 * this pipeline is non-critical and must never break call logging.
 */

import { chat } from "./aiService";

export interface ExtractedLead {
  caller_name: string | null;
  job_type: string;
  summary: string;
  urgency: "low" | "medium" | "high" | "emergency";
  address: string | null;
}

const URGENCY_VALUES = ["low", "medium", "high", "emergency"] as const;
type Urgency = (typeof URGENCY_VALUES)[number];

const SYSTEM_PROMPT = `You extract structured lead data from a phone-call transcript at a trades business (plumber, electrician, HVAC, roofer, etc.).

Return ONLY a JSON object matching this exact TypeScript shape:

{
  "caller_name": string | null,
  "job_type": string,
  "summary": string,
  "urgency": "low" | "medium" | "high" | "emergency",
  "address": string | null
}

Rules:
- If a field is unclear or not stated, return null. Do NOT hallucinate.
- "job_type" must be CONCRETE (e.g. "clogged kitchen drain", "broken garage door spring", "no hot water"). Never vague (e.g. "plumbing issue").
- "summary" must be under 200 characters.
- "urgency" mapping:
    emergency = active flooding, gas smell, no heat in winter, sparking/electrical hazard, security risk
    high      = needs same-day or next-day, customer stressed
    medium    = within a few days
    low       = quote, scheduled work, general enquiry
- Output ONLY the JSON. No prose, no markdown fences.`;

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
}

function isUrgency(v: unknown): v is Urgency {
  return typeof v === "string" && (URGENCY_VALUES as readonly string[]).includes(v);
}

/**
 * Extract a structured lead from a call transcript.
 * Returns null if the transcript is too short, the model call fails,
 * the response is unparseable, or required fields are missing.
 */
export async function extractLeadFromTranscript(
  transcriptText: string,
): Promise<ExtractedLead | null> {
  if (!transcriptText || transcriptText.trim().length < 50) {
    return null;
  }

  let raw: string;
  try {
    raw = await chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Call transcript:\n\n${transcriptText}` }],
      maxTokens: 400,
      modelOverride: "claude-haiku-4-5-20251001",
    });
  } catch (err: any) {
    console.warn("[tradeline-lead-extract] Claude call failed:", err?.message);
    return null;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch (err: any) {
    console.warn(
      "[tradeline-lead-extract] JSON parse failed:",
      err?.message,
      "raw:",
      raw.slice(0, 200),
    );
    return null;
  }

  // Validate required fields — refuse partial garbage
  const job_type =
    typeof parsed?.job_type === "string" && parsed.job_type.trim()
      ? parsed.job_type.trim()
      : null;
  const summary =
    typeof parsed?.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim().slice(0, 200)
      : null;
  const urgency: Urgency | null = isUrgency(parsed?.urgency) ? parsed.urgency : null;

  if (!job_type || !summary || !urgency) {
    console.warn(
      "[tradeline-lead-extract] Required fields missing in extraction:",
      { job_type, summary, urgency },
    );
    return null;
  }

  return {
    caller_name:
      typeof parsed?.caller_name === "string" && parsed.caller_name.trim()
        ? parsed.caller_name.trim()
        : null,
    job_type,
    summary,
    urgency,
    address:
      typeof parsed?.address === "string" && parsed.address.trim()
        ? parsed.address.trim()
        : null,
  };
}
