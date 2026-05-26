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

/**
 * Wave 12A: recommendation card. AI emits a card when it wants to show a
 * product / next-step suggestion alongside text — richer than a button, but
 * still deterministic (no LLM call when clicked). Rendered as a tappable
 * tile with title, description, optional image, and an optional href.
 */
export interface CopilotCard {
  title: string;
  description: string;
  /** Optional CTA label shown on the card. Defaults to "Learn more". */
  cta?: string;
  /** Optional image URL — must be relative (/static/...) or https. */
  image?: string;
  /** Optional href. Must be a safe path (starts with "/" or "https://"). */
  href?: string;
}

const COPILOT_PROMPT_RE = /<<<COPILOT_PROMPT>>>([\s\S]*?)<<<END_COPILOT_PROMPT>>>/;
const COPILOT_CARDS_RE = /<<<COPILOT_CARDS>>>([\s\S]*?)<<<END_COPILOT_CARDS>>>/;

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

/** Validate + clamp an untrusted parsed array into safe CopilotCard items. */
export function sanitizeCopilotCards(parsed: unknown): CopilotCard[] | undefined {
  if (!Array.isArray(parsed)) return undefined;
  const cards: CopilotCard[] = parsed
    .filter(
      (c): c is Record<string, unknown> =>
        !!c &&
        typeof c === "object" &&
        typeof (c as Record<string, unknown>).title === "string" &&
        typeof (c as Record<string, unknown>).description === "string",
    )
    .slice(0, 3)
    .map((c) => {
      const href = typeof c.href === "string" ? c.href.trim() : undefined;
      const safeHref =
        href && (href.startsWith("/") || href.startsWith("https://")) && !href.includes("..")
          ? href.slice(0, 240)
          : undefined;
      const image = typeof c.image === "string" ? c.image.trim() : undefined;
      const safeImage =
        image && (image.startsWith("/") || image.startsWith("https://")) && !image.includes("..")
          ? image.slice(0, 240)
          : undefined;
      return {
        title: String(c.title).slice(0, 80),
        description: String(c.description).slice(0, 220),
        cta: typeof c.cta === "string" ? String(c.cta).slice(0, 32) : undefined,
        image: safeImage,
        href: safeHref,
      };
    })
    .filter((c) => c.title.length > 0 && c.description.length > 0);
  return cards.length > 0 ? cards : undefined;
}

/**
 * Extract a COPILOT_CARDS block from assistant text. Cards live separately
 * from buttons + prompts so a reply can include both ("Here's the right fit
 * [CARD] — want to bundle add-ons? [PROMPT]").
 */
export function extractCopilotCards(text: string): {
  cleanedText: string;
  cards?: CopilotCard[];
} {
  const match = text.match(COPILOT_CARDS_RE);
  if (!match) return { cleanedText: text };
  let cards: CopilotCard[] | undefined;
  try {
    cards = sanitizeCopilotCards(JSON.parse(match[1].trim()));
  } catch {
    // malformed JSON — strip block, emit no cards
  }
  const cleanedText = text.replace(COPILOT_CARDS_RE, "").trim();
  return { cleanedText, cards };
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

/**
 * Wave 12A: brevity + guided-tour preamble appended to every copilot system
 * prompt. Together with COPILOT_PROMPT, ACTION_PROPOSAL and COPILOT_CARDS
 * blocks, it turns the assistant from a "wall of text" responder into a
 * Claude.ai-style guided tour: short replies + clickable next steps.
 */
export const COPILOT_GUIDED_TOUR_PREAMBLE = `

== STYLE — KEEP IT SHORT, GIVE BUTTONS ==
- DEFAULT TO 1-3 SENTENCES. Only expand into bullets when the user explicitly asks ("compare", "list all", "give me the details").
- When the user describes a goal, suggest ONE recommended next step — don't enumerate every option.
- Whenever the user could move forward by picking between things, append a COPILOT_PROMPT block (see below). Don't ask multi-part questions in prose.
- Whenever you recommend a product, surface, or destination, prefer the COPILOT_CARDS block (see below) over a wall of bullets.
- Never list more than 3 options at once — if there are more, pick the best one and offer to "see more" via a button.`;

/**
 * Wave 12A: COPILOT_CARDS instruction — shared by all three copilot surfaces
 * (portal, admin, marketing widget). Cards render as rich recommendation
 * tiles so the AI can sell visually without paragraphs of text.
 */
export const COPILOT_CARDS_INSTRUCTION = `

== RECOMMENDATION CARDS ==
When you want to recommend a specific product, plan, page, or next step with more weight than a button, append a single fenced block AT THE END of your reply:

<<<COPILOT_CARDS>>>
[{"title":"<short product/page name, max 80 chars>","description":"<one-line pitch, max 220 chars>","cta":"<optional button label, max 32 chars>","image":"<optional /static/... or https://... URL>","href":"<optional path starting with / or https:// URL>"}]
<<<END_COPILOT_CARDS>>>

Rules:
- 1–3 cards per block. Skip the block if a single sentence does the job.
- href MUST start with "/" (relative) or "https://". No "..", no schemes other than https.
- image is optional — only include if you know the asset URL.
- Put a one-line lead-in sentence in your reply BEFORE the block. The block itself is invisible to the user; they see a tile rendered from it.
- Use cards for: product recommendations, "here's where to go", upsells / cross-sells. Skip for plain Q&A.`;
