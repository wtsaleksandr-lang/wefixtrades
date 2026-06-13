/**
 * UNIFIED-AI U4 — graceful customer-widget handoff contract (PURE).
 *
 * Every customer-facing BLOCKED / LIMIT state of the calculator-widget chat
 * (/api/ai/client-chat agent-loop branch) must look like a warm human
 * hand-off, NEVER like a broken assistant. Before this module the blocked
 * states surfaced as:
 *   - gate_blocked (surface kill switch / monthly budget) → empty SSE reply →
 *     typing dots then SILENCE (worst state);
 *   - per-calculator daily cap → JSON 503;
 *   - trial expired → 403 the bubble rendered as an "upgrade to Pro" card
 *     shown to the HOMEOWNER (a direct identity violation);
 *   - cost cap mid-chat → already graceful, kept.
 *
 * This module defines ONE contract used by BOTH sides (server emits it,
 * AIChatBubble renders it) so they can never drift:
 *
 *   1. an assistant TEXT frame  — `{ text: <warm copy> }`
 *   2. a terminal HANDOFF frame — `{ done: true, handoff: { reason,
 *      captureLead: true } }`
 *
 * The whole exchange is delivered as **200 + SSE** — a blocked customer is
 * NEVER shown a 403/503/empty. The bubble turns the handoff frame into a
 * normal assistant bubble + an inline mini lead-capture form (name / phone /
 * email) that posts to the existing /api/leads path.
 *
 * Kept import-light (no express, no DB) so the regression gate
 * (clientChatAccess.test.ts) can drive it without DATABASE_URL.
 */

/** The blocked/limit states that convert to a warm lead-capture hand-off. */
export type HandoffReason =
  | "gate_blocked" // surface kill switch / monthly budget hit at loop start or mid-run
  | "daily_cap" // per-calculator daily conversation cap (free-included activation)
  | "monthly_budget" // surface monthly spend cap (a more specific gate_blocked)
  | "kill_switch" // admin kill switch ON (a more specific gate_blocked)
  | "trial_expired_midchat" // dormant trial machinery expired mid-conversation
  | "cost_cap"; // 25¢/conversation ceiling reached mid-chat

/** Terminal SSE frame payload carried under the `done` envelope. */
export interface HandoffFrame {
  reason: HandoffReason;
  /** Always true — the UI shows the inline lead form for every handoff. */
  captureLead: true;
}

/** Warm, on-brand copy per state. `{business}` is interpolated by the caller's
 *  businessName. NEVER mentions Pro / upgrade / budget / kill switch — the
 *  customer must only ever see a friendly "leave your details" message. */
export function handoffCopy(reason: HandoffReason, businessName: string): string {
  const biz = businessName?.trim() || "the team";
  switch (reason) {
    case "cost_cap":
      // Mid-chat cost ceiling — the existing graceful "grab a human" line.
      return "I'd love to keep helping — let me grab a human teammate. Leave your details and they'll follow up shortly.";
    default:
      // Every other blocked/limit state gets the canonical warm hand-off.
      return `Thanks for reaching out! Leave your details and ${biz} will get right back to you.`;
  }
}

/**
 * Map the agent-loop's gate_blocked `errorMessage` (the human-readable reason
 * from aiSystemGate.ts — "…kill switch is ON." / "…reached its monthly
 * budget…") to a specific HandoffReason. Anything unrecognised falls back to
 * the generic `gate_blocked` (still a warm hand-off — fail-closed to handoff).
 */
export function classifyGateBlock(errorMessage: string | undefined): HandoffReason {
  const m = (errorMessage || "").toLowerCase();
  if (m.includes("kill switch")) return "kill_switch";
  if (m.includes("monthly budget") || m.includes("budget")) return "monthly_budget";
  return "gate_blocked";
}

/**
 * Map the pre-stream access-gate result body (clientChatAccess.ts) to a
 * HandoffReason. The gate returns honest 403/503 bodies for the route's
 * historical non-SSE callers; for the SSE agent-loop branch we instead convert
 * them to a warm hand-off. Returns null when the body is NOT one of the
 * customer-block states (caller then keeps the original status — should not
 * happen for the known gate, but fail-safe).
 */
export function classifyAccessGateBlock(body: {
  error?: string;
  message?: string;
}): HandoffReason {
  const err = body?.error || "";
  // trial_expired is the only wire-coded error string; everything else is a
  // human-readable sentence (enabled-off, inactive subscription, daily cap).
  if (err === "trial_expired") return "trial_expired_midchat";
  if (/unavailable right now/i.test(err)) return "daily_cap";
  // enabled:false / inactive subscription / anything else → generic block.
  return "gate_blocked";
}

/** SSE frame strings — the SINGLE source of the wire shape (server side). */
export function handoffTextFrame(text: string): string {
  return `data: ${JSON.stringify({ text })}\n\n`;
}

export function handoffDoneFrame(reason: HandoffReason): string {
  const frame: { done: true; handoff: HandoffFrame } = {
    done: true,
    handoff: { reason, captureLead: true },
  };
  return `data: ${JSON.stringify(frame)}\n\n`;
}
