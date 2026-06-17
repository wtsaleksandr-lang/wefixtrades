// PreviewChatBubbleSim — PREVIEW-ONLY visual simulation of the AI chat bubble,
// plus an in-product EXPLAINER of what the owner's assistant can do.
//
// Why a presentational sim instead of mounting the real <AIChatBubble/>:
// the production component (client/src/components/ai/AIChatBubble.tsx) is
// built to live on the PUBLISHED page — it renders with `position: fixed`
// (so it would escape the preview bezel and dock to the editor viewport),
// attaches global window listeners, runs idle/proactive timers, POSTs to
// /api/ai/client-chat on send, and persists state to localStorage. None of
// that can run inside the editor preview without leaking into the session.
//
// This sim reproduces the two VISUAL states (styles copied from
// AIChatBubble.tsx) so the owner SEES what the `aiChatVisibility` setting does:
//   - 'always'  → the full 56×56 chat FAB, visible immediately.
//   - 'rescue'  → the small "Need help?" pill (the resting state on the live
//                 site before a visitor seems stuck).
// It is mounted INSIDE the calculator mockup (the device bezels on desktop /
// tablet, the bare widget card on mobile) so it reads as part of the owner's
// OWN calculator — an example of the chat their customers would get.
//
// EXPLAINER (Alex 2026-06-17): hovering (desktop) or tapping (mobile) the
// launcher reveals a small popover that tells the owner this assistant is
// THEIRS to configure — it can be a pushy upseller, a calm navigator, or a
// hand-off that routes hot leads straight to a phone call or WhatsApp chat.
// This is informational (preview-only); it never sends a message or opens a
// real chat.
//
// CONTRAST — like the real bubble, the sim is light-theme locked: it paints the
// CTA colour + white exactly as the production widget does on any host site.
// The root carries data-theme="light" to scope the hardcoded-color exemption.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { MessageCircle, TrendingUp, Compass, PhoneCall } from 'lucide-react';

export interface PreviewChatBubbleSimProps {
  /** Live `advanced.style.aiChatVisibility` value from the wizard config. */
  visibility: 'rescue' | 'always';
  /** Launcher colour — MUST match the live CTA button (PreviewPane passes
   *  `style.ctaColor ?? style.accent ?? default`, the same derivation the
   *  renderer uses for the CTA), so the floater tracks theme/colour changes. */
  accentColor?: string;
  /** Anchor offsets inside the mockup card (px). Bottom-left keeps the launcher
   *  clear of the editor's right-edge AI build tab and of the full-width CTA. */
  bottom?: number;
  left?: number;
}

/** The three configurable assistant behaviours shown in the explainer. */
const ASSISTANT_MODES = [
  {
    Icon: TrendingUp,
    title: 'Upsell & close',
    desc: 'Make it proactive — suggest add-ons, upgrades and higher tiers.',
  },
  {
    Icon: Compass,
    title: 'Guide & answer',
    desc: 'Keep it helpful — answer questions and walk visitors through the form.',
  },
  {
    Icon: PhoneCall,
    title: 'Hand off to you',
    desc: 'Route hot leads straight to a phone call or WhatsApp chat.',
  },
] as const;

export default function PreviewChatBubbleSim({
  visibility,
  accentColor = '#0d3cfc',
  // Inset past the mockup's 16px corner radius so the launcher reads as an
  // internal component of the calculator, not something riding the frame edge.
  bottom = 22,
  left = 20,
}: PreviewChatBubbleSimProps) {
  // Contrast — the launcher paints on `accentColor` (the live CTA colour). On a
  // BRIGHT CTA (e.g. yellow) white text/icon is unreadable, so derive the
  // foreground from the colour's luminance, exactly like the renderer guards the
  // CTA label. `accentInk` is a readable-on-pale-tint variant for the explainer
  // icon chips (their background is a 12% wash of the same colour).
  const launcherFg = launcherForeground(accentColor);
  const accentInk = readableInk(accentColor);
  // open = hover (desktop) OR pinned-by-click (works on touch). Click pins it
  // so it survives on mobile (no hover); click-outside / Escape unpins.
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const open = hovered || pinned;

  const showFab = visibility === 'always';

  // Dismiss the pinned popover on outside-tap / Escape (hover dismiss is handled
  // by onMouseLeave). Only armed while pinned so we never fight normal hover.
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node | null)) setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPinned(false); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [pinned]);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPinned((v) => !v);
  }, []);

  const launcherLabel = 'See what your AI assistant can do';

  return (
    <div
      ref={rootRef}
      data-theme="light"
      data-testid="preview-chat-sim"
      data-sim-state={showFab ? 'fab' : 'pill'}
      data-sim-open={open ? 'true' : 'false'}
      role="group"
      aria-label="AI chat assistant preview"
      // Keep editor machinery out of the loop: clicks on the sim must not bubble
      // into the bezel's click-to-edit / selection handlers.
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        bottom,
        left,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 8,
        pointerEvents: 'auto',
      }}
    >
      {/* Explainer popover — opens UPWARD above the launcher. */}
      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="How your AI assistant can work"
          data-testid="preview-chat-sim-explainer"
          style={{
            width: 248,
            maxWidth: 'calc(100vw - 28px)',
            background: '#ffffff',
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            boxShadow: '0 12px 32px rgba(15,23,42,0.18), 0 2px 6px rgba(15,23,42,0.08)',
            padding: '13px 13px 11px',
            textAlign: 'left',
            animation: 'qq-chat-sim-rise 160ms ease-out both',
            cursor: 'default',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
            Your AI assistant — your rules
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 500, color: '#64748b', margin: '2px 0 10px', lineHeight: 1.35 }}>
            Configure how it works for your customers:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {ASSISTANT_MODES.map(({ Icon, title, desc }) => (
              <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    // Tint the icon chip with the launcher/CTA colour so the
                    // explainer reads as part of the same branded assistant.
                    background: hexToTint(accentColor, 0.12),
                    color: accentInk,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 1,
                  }}
                >
                  <Icon size={16} aria-hidden="true" />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', lineHeight: 1.25 }}>{title}</div>
                  <div style={{ fontSize: 11, fontWeight: 400, color: '#64748b', lineHeight: 1.3 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, fontWeight: 500, color: '#94a3b8', margin: '10px 0 0', lineHeight: 1.3 }}>
            Preview — this is what your customers see on your live calculator.
          </div>
        </div>
      )}

      {showFab ? (
        /* Full chat FAB — static visual replica of the real bubble. A clean ICON
           BADGE in the launcher colour, so it reads as the customer's chat
           button exactly like the live site. Hover/tap reveals the explainer. */
        <button
          type="button"
          data-testid="preview-chat-sim-fab"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          aria-label={launcherLabel}
          title={launcherLabel}
          onClick={toggle}
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: accentColor,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            color: launcherFg,
            flexShrink: 0,
            animation: 'qq-chat-sim-rise 200ms ease-out both',
          }}
        >
          <MessageCircle size={24} aria-hidden="true" />
        </button>
      ) : (
        /* Rescue-mode "Need help?" pill — replica of the resting launcher.
           Hover/tap reveals the explainer (no fake chat opens). */
        <button
          type="button"
          data-testid="preview-chat-sim-pill"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          aria-label={launcherLabel}
          title={launcherLabel}
          onClick={toggle}
          style={{
            padding: '8px 14px',
            borderRadius: 999,
            background: accentColor,
            color: launcherFg,
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
            opacity: 0.96,
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

/** Soft tint of a hex/any CSS colour for the icon chips. Falls back to a neutral
 *  wash when the colour isn't a parseable #rrggbb (e.g. a named/rgb value), so
 *  the chip is never invisible. */
function hexToTint(color: string, alpha: number): string {
  const rgb = parseHex(color);
  if (!rgb) return `rgba(100,116,139,${alpha})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

function parseHex(color: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** WCAG relative luminance (0 = black, 1 = white). */
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Foreground (text/icon) that sits ON the launcher colour: dark on a bright
 *  fill (yellow/amber/lime), white on a dark fill — never white-on-yellow. Uses
 *  the SAME luminance threshold (0.5) and the SAME dark/white pair as the
 *  renderer's CTA-label guard (AdvancedCalculator `ctaFg`), so the launcher's
 *  text decision always matches the CTA button it mirrors. Unparseable colours
 *  default to white (the historic behaviour for dark brand accents). */
function launcherForeground(color: string): string {
  const rgb = parseHex(color);
  if (!rgb) return '#ffffff';
  return relativeLuminance(rgb) >= 0.5 ? 'rgb(17,17,17)' : '#ffffff';
}

/** A version of the colour guaranteed legible as an ICON on a pale tint of
 *  itself: bright colours are darkened ~50% so a yellow/amber accent doesn't
 *  render near-invisibly on its own pale wash; darker colours pass through. */
function readableInk(color: string): string {
  const rgb = parseHex(color);
  if (!rgb) return color;
  if (relativeLuminance(rgb) < 0.5) return color;
  return `rgb(${Math.round(rgb.r * 0.5)},${Math.round(rgb.g * 0.5)},${Math.round(rgb.b * 0.5)})`;
}
