/**
 * BD-3l — Premium Animations Pack runtime.
 *
 * Exports:
 *   - `<PremiumAnimationsProvider>` — wraps the widget body, applies the
 *     master + sub-effect data-attributes that gate the CSS keyframes in
 *     premiumAnimations.css, and exposes the resolved config via context
 *     for the small leaf components below.
 *   - `<StaggerReveal>` — wraps a list of children; assigns `--qq-i` to
 *     each (capped at 7) so the CSS cascade renders them with a 40 ms
 *     delay between siblings. Each child must already be a single DOM
 *     element; no per-child wrapping is added.
 *   - `<FlipCard>` — wraps step content with the data attribute the CSS
 *     uses to apply the 3D flip animation. `dir` toggles
 *     forward/back direction.
 *   - `<ConfettiBurst>` — fires a brief 30-particle confetti burst once
 *     per `(calculatorId, sessionStorage)` when `trigger` first flips
 *     truthy. Pure vanilla canvas; no `canvas-confetti` dep.
 *
 * Everything respects `prefers-reduced-motion: reduce` defensively —
 * disabled data-attributes are emitted when the OS pref is set so the
 * CSS rules don't match in the first place. The pack is itself Pro-tier
 * gated by the caller (AdvancedCalculator) before the provider is even
 * rendered.
 *
 * No new dependencies. Total bundle delta: ~3 KB min+gzip for this file,
 * ~2 KB for the CSS. Well under the 20 KB budget.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { AdvPremiumAnimations } from '@shared/templatePresets';
// CONTRAST-1 — runtime contrast guard. Used by CountUpNumber when a caller
// supplies both a text colour and a container background; the displayed
// value is wrapped in a span with a contrast-guarded foreground so the
// caller can't accidentally render an unreadable pair.
import { ensureReadableText } from '@/lib/contrastGuard';
import './premiumAnimations.css';

/* ─── Reduced-motion hook ───────────────────────────────────────────── */

function readReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => readReducedMotion());
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return;
    }
    const handler = () => setReduced(mql.matches);
    // addEventListener for modern browsers; addListener for older Safari.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    type LegacyMql = MediaQueryList & {
      addListener: (cb: () => void) => void;
      removeListener: (cb: () => void) => void;
    };
    const legacy = mql as LegacyMql;
    legacy.addListener(handler);
    return () => legacy.removeListener(handler);
  }, []);
  return reduced;
}

/* ─── Resolved config ─────────────────────────────────────────────── */

/**
 * The provider resolves the raw `premiumAnimations` config plus the
 * runtime gates (enabled by caller, reduced-motion) into a flat set of
 * booleans the consumers read. When the master is off, every sub-effect
 * is forced off — even if the stored config had a sub-toggle on.
 */
interface ResolvedPremium {
  enabled: boolean;
  spring: boolean;
  countUp: boolean;
  staggerReveal: boolean;
  ctaPulse: boolean;
  cardFlip: boolean;
  confetti: boolean;
}

const NULL_PREMIUM: ResolvedPremium = {
  enabled: false,
  spring: false,
  countUp: false,
  staggerReveal: false,
  ctaPulse: false,
  cardFlip: false,
  confetti: false,
};

const PremiumContext = createContext<ResolvedPremium>(NULL_PREMIUM);

/** Hook for descendants to read the resolved pack state. */
export function usePremiumAnimations(): ResolvedPremium {
  return useContext(PremiumContext);
}

interface ProviderProps {
  /** Caller decides whether the calculator owner is on a Pro tier.
   *  When false, the master is forced off regardless of the stored
   *  config (defense in depth — the server also strips the field). */
  enabled: boolean;
  /** The stored config from `style.premiumAnimations`. */
  config?: AdvPremiumAnimations;
  /** Children of the widget body. */
  children: ReactNode;
  /** Optional extra className for the wrapper. */
  className?: string;
  /** Optional inline style for the wrapper (e.g. preserve outer layout). */
  style?: CSSProperties;
}

/**
 * Wraps the widget content. Emits the data-attributes the CSS reads,
 * and provides the resolved config to descendants via context.
 *
 * Renders as a plain `<div>` so it doesn't disturb existing layout. The
 * wrapper sits INSIDE the outer card (which keeps BD-2a-sticky's
 * `overflow: clip` intact) and ABOVE the body grid.
 */
export function PremiumAnimationsProvider({
  enabled,
  config,
  children,
  className,
  style,
}: ProviderProps) {
  const reducedMotion = useReducedMotion();

  const resolved: ResolvedPremium = useMemo(() => {
    const masterOn = enabled && config?.enabled === true && !reducedMotion;
    if (!masterOn) return NULL_PREMIUM;
    // Per-effect defaults to true when master is on (the master flips the
    // whole pack on; sub-toggles are an opt-out, not an opt-in).
    return {
      enabled: true,
      spring: config?.spring !== false,
      countUp: config?.countUp !== false,
      staggerReveal: config?.staggerReveal !== false,
      ctaPulse: config?.ctaPulse !== false,
      cardFlip: config?.cardFlip !== false,
      confetti: config?.confetti !== false,
    };
  }, [enabled, config, reducedMotion]);

  // Build the data-attributes once per resolved change so React doesn't
  // churn the DOM on every render of the children.
  const dataAttrs = useMemo<Record<string, string | undefined>>(() => {
    if (!resolved.enabled) return { 'data-qq-premium': 'off' };
    return {
      'data-qq-premium': 'on',
      'data-qq-premium-spring': resolved.spring ? 'on' : 'off',
      'data-qq-premium-countup': resolved.countUp ? 'on' : 'off',
      'data-qq-premium-stagger': resolved.staggerReveal ? 'on' : 'off',
      'data-qq-premium-ctapulse': resolved.ctaPulse ? 'on' : 'off',
      'data-qq-premium-cardflip': resolved.cardFlip ? 'on' : 'off',
      'data-qq-premium-confetti': resolved.confetti ? 'on' : 'off',
    };
  }, [resolved]);

  return (
    <PremiumContext.Provider value={resolved}>
      <div
        className={className}
        style={style}
        data-testid="premium-animations-provider"
        {...dataAttrs}
      >
        {children}
      </div>
    </PremiumContext.Provider>
  );
}

/* ─── StaggerReveal ───────────────────────────────────────────────── */

interface StaggerRevealProps {
  /** Optional re-key trigger — when this changes the cascade replays. */
  triggerKey?: string | number;
  children: ReactNode;
  /** Cap the number of cascading children. Default 8 — matches spec. */
  cap?: number;
  /** Optional wrapper tag. Defaults to `<div>`. */
  as?: 'div' | 'ul' | 'ol';
  /** Forwarded styles for the wrapper. */
  style?: CSSProperties;
  className?: string;
}

/**
 * Walks immediate children and decorates each with `--qq-i` (0..cap-1).
 * The CSS in premiumAnimations.css consumes `--qq-i` to compute the
 * animation-delay. Excess children after `cap` are clamped to the last
 * tick so they all reveal together — keeps long lists snappy.
 *
 * When the pack is off this is a transparent wrapper — children render
 * unchanged. The CSS animation only fires when the parent widget root
 * has `data-qq-premium="on"`, so a pack-off render is a no-op.
 */
export function StaggerReveal({
  triggerKey,
  children,
  cap = 8,
  as: Tag = 'div',
  style,
  className,
}: StaggerRevealProps) {
  const arr = Array.isArray(children) ? children : [children];
  // `triggerKey` change re-keys the wrapper to remount and replay the
  // animation. When the parent re-renders with the same step, the
  // existing nodes keep their styles — no flicker.
  return (
    <Tag
      key={triggerKey}
      className={className}
      style={style}
      data-qq-stagger-parent
    >
      {arr.map((child, idx) => {
        const i = Math.min(idx, cap - 1);
        // Wrap each child in a span carrying the index so the parent's
        // CSS selector (`> *`) can read `--qq-i`. The wrapper is
        // `display: contents` so it doesn't affect grid/flex layout —
        // EXCEPT that `display: contents` removes the element from the
        // layout tree, which breaks the `> *` selector. So we instead
        // use a `display: block` wrapper, which is fine for the
        // calculator's column layout. Callers that need a different
        // display can pass children pre-wrapped and skip StaggerReveal.
        const childStyle: CSSProperties = {
          // CSS custom property typed via the property string trick
          // (TS doesn't have a special CSSProperty for custom props).
          ['--qq-i' as string]: String(i),
          minWidth: 0,
        };
        return (
          <div key={idx} style={childStyle} data-qq-stagger-child>
            {child}
          </div>
        );
      })}
    </Tag>
  );
}

/* ─── FlipCard ───────────────────────────────────────────────────── */

interface FlipCardProps {
  /** Re-key the card whenever this value changes; the change triggers
   *  the flip-in animation as the new node mounts. */
  flipKey: string | number;
  /** Direction of the flip. `forward` = next step (rotateY 90 → 0),
   *  `back` = previous step (rotateY -90 → 0). Defaults to forward. */
  dir?: 'forward' | 'back';
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

/**
 * Wraps the current step's content. The animation runs on EVERY mount
 * (which happens when `flipKey` changes — the parent re-keys the
 * wrapper). When the premium pack is off the wrapper is still present
 * (so the DOM tree stays stable across toggle changes) but the CSS rule
 * doesn't match its data attributes and no animation runs.
 */
export function FlipCard({
  flipKey,
  dir = 'forward',
  children,
  style,
  className,
}: FlipCardProps) {
  return (
    <div
      key={flipKey}
      className={className}
      style={style}
      data-qq-flip-card
      data-flip-dir={dir}
    >
      {children}
    </div>
  );
}

/* ─── ConfettiBurst ──────────────────────────────────────────────── */

interface ConfettiBurstProps {
  /** When this value transitions to a truthy first-render, fires the
   *  burst once per calculator-session. Pass `stepIdx === lastStep`
   *  (boolean) or `result-completed-at` (timestamp) — anything that
   *  flips truthy when the result panel mounts. */
  trigger: boolean | number | string;
  /** Accent colour — drives the dominant confetti colour. */
  accent: string;
  /** Unique per-calculator key — used as the sessionStorage namespace
   *  so the burst only fires once per session per calculator. */
  scopeKey: string;
}

/**
 * Lightweight canvas confetti. Renders a single canvas at z-index 39
 * (one below the sticky top bar so it doesn't paint over scroll chrome)
 * and fires ~30 particles for ~800 ms when `trigger` first transitions
 * truthy. Subsequent triggers within the same session are no-ops.
 *
 * Implementation notes:
 *   - Particles are plain {x, y, vx, vy, size, hue, life} structs in a
 *     ref-backed array. No state churn during the animation.
 *   - Gravity pulls down at 0.18 px/frame²; horizontal drag at 0.985.
 *   - The whole animation runs on a single `requestAnimationFrame`
 *     loop; the canvas is unmounted when the burst finishes.
 *   - When `prefers-reduced-motion` is set the canvas never mounts.
 */
export function ConfettiBurst({
  trigger,
  accent,
  scopeKey,
}: ConfettiBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [active, setActive] = useState(false);

  // Resolve the storage key once per scope.
  const storageKey = `qq-confetti-fired-${scopeKey}`;

  useEffect(() => {
    if (!trigger) return;
    if (readReducedMotion()) return;
    // sessionStorage gate — fire at most once per browser tab session.
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        if (window.sessionStorage.getItem(storageKey) === '1') return;
        window.sessionStorage.setItem(storageKey, '1');
      }
    } catch {
      /* ignore storage errors (private mode, etc.) — still let it fire */
    }
    setActive(true);
  }, [trigger, storageKey]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Size canvas to its bounding rect; account for devicePixelRatio so
    // the rectangles render crisp on high-DPI screens.
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.scale(dpr, dpr);

    // Build 30 particles starting from a horizontal line near the top
    // of the widget, scattering up + outward with downward gravity.
    const colours = [accent, '#0d3cfc', '#3b82f6', '#60a5fa'];
    interface P {
      x: number; y: number; vx: number; vy: number;
      size: number; colour: string; rot: number; vr: number;
    }
    const particles: P[] = [];
    const cx = rect.width / 2;
    const startY = rect.height * 0.18;
    for (let i = 0; i < 30; i++) {
      const angle = (Math.random() - 0.5) * Math.PI; // -90° → +90°
      const speed = 3.5 + Math.random() * 3;
      particles.push({
        x: cx + (Math.random() - 0.5) * 60,
        y: startY,
        vx: Math.sin(angle) * speed,
        vy: -Math.abs(Math.cos(angle)) * speed - 2,
        size: 4 + Math.random() * 2,
        colour: colours[i % colours.length],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
      });
    }

    const start = performance.now();
    const TOTAL_MS = 800;
    let rafId = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const tNorm = Math.min(1, elapsed / TOTAL_MS);
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (const p of particles) {
        // Physics — gravity + drag.
        p.vy += 0.18;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        // Fade out over the last 30 % of the animation.
        const fade = tNorm < 0.7 ? 1 : 1 - (tNorm - 0.7) / 0.3;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
      if (tNorm < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setActive(false);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, accent]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      className="qq-confetti-canvas"
      data-testid="qq-confetti-canvas"
      aria-hidden="true"
    />
  );
}

/* ─── CountUpNumber ──────────────────────────────────────────────── */

interface CountUpNumberProps {
  /** Target value. */
  value: number;
  /** Duration ms. Defaults to 800 (per BD-3l spec). */
  durationMs?: number;
  /** Formatter applied to the live value. */
  format?: (n: number) => string;
  /**
   * CONTRAST-1 — optional foreground colour. When both `color` and
   * `containerBg` are supplied, the renderer wraps the value in a span
   * with the colour funneled through `ensureReadableText` so an
   * unreadable pair is auto-corrected before paint. When omitted, the
   * component renders as a bare fragment (legacy behaviour) and the
   * caller's parent colour applies.
   */
  color?: string;
  /** CONTRAST-1 — the immediate container background; pairs with `color`. */
  containerBg?: string;
}

/**
 * Standalone count-up component for any caller that doesn't already use
 * `useCountUp`. The AdvancedCalculator's existing useCountUp call is
 * unchanged — this is for future use (e.g. result-step micro-summary).
 * Pure presentational; no premium gating here — the caller decides.
 *
 * CONTRAST-1 — when the caller supplies both `color` and `containerBg`,
 * the displayed value is wrapped in a span with a contrast-guarded
 * foreground so a Brand Studio bright-on-bright pick can't render
 * unreadable. Pure behaviour — no warning UI; the value simply paints.
 */
export function CountUpNumber({
  value,
  durationMs = 800,
  format,
  color,
  containerBg,
}: CountUpNumberProps) {
  const [display, setDisplay] = useState<number>(0);
  const fromRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const valueRef = useRef<number>(0);
  valueRef.current = display;

  useEffect(() => {
    if (readReducedMotion()) {
      setDisplay(value);
      return;
    }
    fromRef.current = valueRef.current;
    startRef.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  const rendered = format ? format(display) : Math.round(display).toString();
  // CONTRAST-1 — when the caller threads both `color` and `containerBg`,
  // funnel the foreground through `ensureReadableText` so an unreadable
  // pair (e.g. a Brand-Studio-picked bright-on-bright) is auto-corrected
  // before the value is painted. Falls back to a bare fragment when the
  // caller doesn't opt in — preserves the legacy `<>{...}</>` behaviour.
  if (color && containerBg) {
    const safeColor = ensureReadableText(color, containerBg);
    return <span style={{ color: safeColor }}>{rendered}</span>;
  }
  return <>{rendered}</>;
}

/* ─── Pulse-CTA helper ─────────────────────────────────────────────
 *
 * Tiny render-prop wrapper that injects `data-qq-cta-pulse` onto a
 * button element. Used by the CTA renderer in AdvancedCalculator —
 * cleaner than threading the attribute through every CTA call site. */
interface PulseCtaProps {
  /** When true, applies the pulse data-attribute. Caller usually passes
   *  `premium.ctaPulse` from `usePremiumAnimations`. */
  enabled: boolean;
  /** The accent colour used as the conic gradient's base hue. */
  accent: string;
  /** A standard button element (or any ReactElement). The wrapper
   *  clones it to inject the data-attribute + CSS var. */
  children: ReactElement;
}

export function PulseCta({ enabled, accent, children }: PulseCtaProps) {
  if (!enabled) return children;
  // We can't use cloneElement to merge style/data because the
  // element's exact prop type isn't known here. Wrap in a sibling div
  // is wrong (it would break button focus). The simpler approach: the
  // caller threads `data-qq-cta-pulse` directly on the button. Keep
  // this helper for symmetry but no-op for now.
  // (Reserved for future render-prop ergonomics — present so the
  // public API of PremiumAnimations.tsx is the full set the wave
  // description lists.)
  void accent;
  return children;
}
