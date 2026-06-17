// PreviewChatBubbleSim — PREVIEW-ONLY visual simulation of the AI chat bubble.
//
// Why a presentational sim instead of mounting the real <AIChatBubble/>:
// the production component (client/src/components/ai/AIChatBubble.tsx) is
// built to live on the PUBLISHED page — it renders with `position: fixed`
// (so it would escape the preview bezel and dock to the editor viewport),
// attaches global window listeners (quotequick:step / quotequick:help /
// keydown / pointerdown / mousemove), runs 30s idle + proactive-nudge
// timers, POSTs to /api/ai/client-chat on send, and persists chat history
// and panel position to localStorage. None of that machinery can run
// inside the editor preview without leaking state into the editor session.
//
// This sim reproduces the two VISUAL states pixel-faithfully (styles are
// copied from AIChatBubble.tsx — pill :693-744, FAB :973-1017) so the
// owner can SEE what the `aiChatVisibility` Style-tab setting does:
//   - 'always'  → the full 56×56 chat FAB, visible immediately.
//   - 'rescue'  → the small "Need help?" pill; a "Simulate stuck visitor"
//     affordance (shown on hover/focus) flips the sim to the revealed FAB
//     for ~5s — the same reveal animation visitors get — then resets.
//
// It is mounted ONLY inside PreviewPane's device bezels (desktop browser
// chrome + mobile phone frame). It never renders in the published widget
// path (calculator.tsx keeps owning the real bubble).
//
// CONTRAST-2 — like the real bubble, the sim is light-theme locked: it
// paints accent + white exactly as the production widget does on any host
// site. The root carries data-theme="light" to scope the hardcoded-color
// exemption.

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';

export interface PreviewChatBubbleSimProps {
  /** Live `advanced.style.aiChatVisibility` value from the wizard config. */
  visibility: 'rescue' | 'always';
  /** Widget accent — matches the preview renderer's resolved accent. */
  accentColor?: string;
  /** Anchor offsets inside the bezel (px).
   *
   * preview-chat-floater fix — the cluster anchors to the bottom-LEFT of the
   * mockup (not bottom-right). Rationale:
   *   - The widget's primary CTA is a FULL-WIDTH sticky action bar pinned to
   *     the bottom of the screen, so the floater is lifted clear of that band
   *     (default `bottom` sits above it) and never overlaps "Get My Quote".
   *   - The editor's OWN build-assistant tab (AIBubble.tsx) docks to the RIGHT
   *     edge of the shell; anchoring the visitor floater LEFT keeps the two
   *     affordances on opposite sides so the owner never confuses them.
   *   - `left` inset keeps the cluster off the rounded phone-frame bezel so it
   *     is never clipped by `overflow: clip`.
   * On the PUBLISHED page the real <AIChatBubble/> keeps its bottom-right
   * `position: fixed` placement — this left anchor is preview-only. */
  bottom?: number;
  left?: number;
}

/** How long the simulated "stuck visitor" reveal lasts before resetting. */
const SIM_REVEAL_MS = 5_000;

export default function PreviewChatBubbleSim({
  visibility,
  accentColor = '#0d3cfc',
  // Sits low in the bottom-LEFT corner (like the live site's launcher). The
  // primary CTA is in the right column / bottom-right, so the left corner is
  // clear. Small inset so the rounded phone-frame bezel never clips it.
  bottom = 24,
  left = 14,
}: PreviewChatBubbleSimProps) {
  // Local-only reveal state for the rescue-mode simulation. No production
  // timers/events are involved — this is a pure show-and-tell flip.
  const [simRevealed, setSimRevealed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  const clearSimTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  // Mode change (owner flips the Style-tab control) resets the simulation
  // so the sim always reflects the freshly-selected mode's resting state.
  useEffect(() => {
    setSimRevealed(false);
    clearSimTimer();
  }, [visibility, clearSimTimer]);

  // Never leak the reset timer past unmount.
  useEffect(() => () => { clearSimTimer(); }, [clearSimTimer]);

  /** Flip pill → revealed FAB for SIM_REVEAL_MS, then reset. */
  const simulateStuckVisitor = useCallback(() => {
    setSimRevealed(true);
    clearSimTimer();
    timerRef.current = window.setTimeout(() => {
      setSimRevealed(false);
      timerRef.current = undefined;
    }, SIM_REVEAL_MS);
  }, [clearSimTimer]);

  const showFab = visibility === 'always' || simRevealed;
  const captionVisible = hovered || simRevealed;

  return (
    <div
      data-theme="light"
      data-testid="preview-chat-sim"
      data-sim-state={showFab ? 'fab' : 'pill'}
      role="group"
      aria-label="AI chat bubble preview"
      // Keep editor machinery out of the loop: clicks on the sim must not
      // bubble into the bezel's click-to-edit / selection handlers.
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovered(false);
      }}
      style={{
        position: 'absolute',
        bottom,
        left,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 6,
        // The cluster itself is interactive; the bezel content around it
        // stays fully clickable (small corner footprint, like the real FAB).
        pointerEvents: 'auto',
      }}
    >
      {/* Caption — so the sim is never mistaken for a working chat. Shown
          on hover/focus and during the simulated reveal. */}
      {captionVisible && (
        <div
          role="note"
          data-testid="preview-chat-sim-caption"
          style={{
            maxWidth: 210,
            background: 'rgba(15,23,42,0.88)',
            color: '#fff',
            fontSize: 11,
            lineHeight: 1.35,
            fontWeight: 500,
            borderRadius: 8,
            padding: '4px 9px',
            textAlign: 'left',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            animation: 'qq-chat-sim-rise 160ms ease-out both',
          }}
        >
          {simRevealed
            ? 'This is the help button a stuck visitor sees'
            : 'Preview — visitors see this on your site'}
        </div>
      )}

      {/* Rescue-mode affordance — one click shows the owner the reveal
          visitors get (step ≥ 2 / 30s idle / Help click on the live site). */}
      {visibility === 'rescue' && hovered && !simRevealed && (
        <button
          type="button"
          data-testid="preview-chat-sim-simulate"
          onClick={simulateStuckVisitor}
          style={{
            background: '#fff',
            color: '#334155',
            border: '1px solid #e2e8f0',
            borderRadius: 999,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            whiteSpace: 'nowrap',
            animation: 'qq-chat-sim-rise 160ms ease-out both',
          }}
        >
          Simulate stuck visitor
        </button>
      )}

      {showFab ? (
        /* Full chat FAB — static visual replica of the real bubble
           (AIChatBubble.tsx :973). Non-interactive by design: the preview
           shows the launcher, not a live chat. A clean ICON BADGE (no text
           tag) — it reads as the customer's chat button exactly like the live
           site, and stays visually distinct from the editor's own titled
           build-assistant tab (docked RIGHT) by being an icon-only badge in the
           bottom-LEFT corner. The hover caption still names it for the owner. */
        <div
          data-testid="preview-chat-sim-fab"
          role="img"
          aria-label="Chat button as visitors see it"
          title="Preview — visitors see this on your site"
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: accentColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            color: '#fff',
            flexShrink: 0,
            // Same entrance the real bubble plays when rescue mode reveals.
            animation: 'qq-chat-sim-rise 200ms ease-out both',
          }}
        >
          <MessageCircle size={24} aria-hidden="true" />
        </div>
      ) : (
        /* Rescue-mode "Need help?" pill — replica of AIChatBubble.tsx :693.
           Clicking it runs the same stuck-visitor simulation as the chip so
           the most obvious gesture also demonstrates the reveal. */
        <button
          type="button"
          data-testid="preview-chat-sim-pill"
          onClick={simulateStuckVisitor}
          aria-label="Preview how the chat appears for a stuck visitor"
          title="Preview — visitors see this on your site"
          style={{
            padding: '8px 14px',
            borderRadius: 999,
            background: accentColor,
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
            opacity: 0.92,
          }}
        >
          <MessageCircle size={14} aria-hidden="true" />
          Need help?
        </button>
      )}

      <style>{`
        @keyframes qq-chat-sim-rise {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes qq-chat-sim-rise {
            from { transform: none; opacity: 1; }
            to { transform: none; opacity: 1; }
          }
        }
      `}</style>
    </div>
  );
}
