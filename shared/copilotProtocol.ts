/**
 * Shared copilot confirmation/options protocol (Phase 0).
 *
 * The AI assistant can ask the user a question and offer a set of clickable
 * options by appending a fenced <<<COPILOT_PROMPT>>> block to its reply. The
 * options are AI-generated per context — nothing is hard-coded. The widget
 * renders the prompt + buttons (+ an optional free-text input); the chosen
 * value is sent back as the user's next message.
 *
 * Used by both the client portal copilot (parsed server-side in
 * portalRoutes.ts) and the admin copilot (parsed client-side from the
 * streamed reply in AdminCopilot.tsx) — hence this lives in shared/.
 */

export interface CopilotPromptOption {
  /** Button label shown to the user. */
  label: string;
  /** Message text sent back as the user's next turn when the option is clicked. */
  value: string;
}

export interface CopilotPromptRequest {
  /** The question / confirmation text shown above the buttons. */
  prompt: string;
  /** 1–5 clickable options. */
  options: CopilotPromptOption[];
  /** When true, the widget also shows a free-text input for a custom reply. */
  allow_custom?: boolean;
}

const COPILOT_PROMPT_RE = /<<<COPILOT_PROMPT>>>([\s\S]*?)<<<END_COPILOT_PROMPT>>>/;

/** Validate + clamp an untrusted parsed object into a CopilotPromptRequest. */
export function sanitizeCopilotPrompt(parsed: unknown): CopilotPromptRequest | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const p = parsed as Record<string, unknown>;
  if (typeof p.prompt !== "string" || !Array.isArray(p.options)) return undefined;

  const options: CopilotPromptOption[] = (p.options as unknown[])
    .filter(
      (o): o is Record<string, unknown> =>
        !!o &&
        typeof o === "object" &&
        typeof (o as Record<string, unknown>).label === "string" &&
        typeof (o as Record<string, unknown>).value === "string",
    )
    .slice(0, 5)
    .map((o) => ({
      label: String(o.label).slice(0, 60),
      value: String(o.value).slice(0, 240),
    }));
  if (options.length === 0) return undefined;

  const prompt = p.prompt.trim().slice(0, 600);
  if (!prompt) return undefined;

  return { prompt, options, allow_custom: p.allow_custom === true };
}

/**
 * Extract a COPILOT_PROMPT block from assistant text. Returns the text with
 * the block stripped, plus the parsed request (if present + valid).
 */
export function extractCopilotPrompt(text: string): {
  cleanedText: string;
  prompt?: CopilotPromptRequest;
} {
  const match = text.match(COPILOT_PROMPT_RE);
  if (!match) return { cleanedText: text };
  let prompt: CopilotPromptRequest | undefined;
  try {
    prompt = sanitizeCopilotPrompt(JSON.parse(match[1].trim()));
  } catch {
    // malformed JSON — strip the block, emit no prompt
  }
  const cleanedText = text.replace(COPILOT_PROMPT_RE, "").trim();
  return { cleanedText, prompt };
}

/**
 * System-prompt instruction that teaches the AI how + when to emit a
 * COPILOT_PROMPT block. Appended verbatim to both copilots' system prompts
 * so the wording stays identical across the portal + admin assistants.
 */
export const COPILOT_PROMPT_INSTRUCTION = `

== ASKING THE USER (confirmation buttons) ==
Whenever you want the user to make a choice — confirm an action, pick between options, or approve something — DON'T just ask in prose. Append a single fenced block AT THE END of your reply:

<<<COPILOT_PROMPT>>>
{"prompt":"<the question, max ~600 chars>","options":[{"label":"<button text>","value":"<message sent when clicked>"}],"allow_custom":true}
<<<END_COPILOT_PROMPT>>>

Rules:
- Generate the options from the situation — they are NOT a fixed set. Write whatever buttons fit (e.g. "Yes, draft it", "Not now", "Show me the details first").
- 1–5 options. Keep labels short (≤ 60 chars).
- "value" is the message sent back as if the user typed it — make it unambiguous (e.g. "Yes, go ahead and draft the invoice").
- Set "allow_custom" to true when a free-text reply makes sense (almost always); the user then also gets a "type your own" input.
- Before ANY action that changes data, sends an email, or affects billing, ALWAYS ask first with this block and wait for the user's choice. Never act without an explicit confirmation.
- Put a short human-readable sentence in your reply BEFORE the block. The block itself is invisible — the user sees the prompt + buttons rendered from it.
- Use it for genuine choices only — skip it for plain answers or explanations.`;
