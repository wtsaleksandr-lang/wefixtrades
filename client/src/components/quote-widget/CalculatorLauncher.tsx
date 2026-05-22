/**
 * BD-3m — Floating launcher (collapsed icon → expanded widget panel).
 *
 * Renders a 56×56 circular brand-blue Calculator icon docked into the
 * chosen viewport corner. Clicking the icon expands the full
 * AdvancedCalculator in a 480×720 panel (auto-fits the viewport; goes
 * full-screen with a backdrop scrim on ≤ 768px viewports).
 *
 * Used by:
 *   - `client/public/embed-widget.js` indirectly (via React mount when the
 *     embed mode is `floating`).
 *   - The wizard PreviewPane / Install tab for "Live preview reflects mode"
 *     so owners can see what the customer will see.
 *
 * The component takes the AdvancedCalculator as `children` (or a
 * `renderCalculator` render-prop) — this keeps the launcher 100% layout-
 * only and avoids re-implementing the calculator's prop wiring.
 *
 * Collision avoidance with the AI chat bubble:
 *   - Reads `qq-chat-position` localStorage (the chat panel's drag-pinned
 *     {x, y} coordinates). Translates those into the nearest corner.
 *   - When the chat corner matches the launcher's corner, offsets the
 *     launcher 72px horizontally (desktop) or vertically (mobile) so the
 *     two affordances never overlap.
 *   - One-way: AIChatBubble.tsx is read-only from BD-3m — chat is the
 *     older surface, the launcher yields.
 *
 * Z-index ladder (matches BD-3c chat bubble's 9998 ceiling):
 *   - launcher: 9990
 *   - panel:    9991
 *   - scrim:    9991 (mobile only)
 *   - chat bubble: 9998 (untouched)
 *
 * Animation: 240ms ease-out expand (`transform: scale + opacity`). The
 * collapsed launcher itself has no idle motion. Respects
 * `prefers-reduced-motion: reduce` — every transition collapses to 0 ms
 * defensively in CSS + the JS expand timer.
 *
 * Persistence: open/closed state in `qq-launcher-state-${calculatorId}`
 * localStorage. Default closed. If the saved value is `'open'` on mount,
 * the panel auto-expands.
 *
 * Zero new dependencies: lucide-react Calculator is already imported by
 * existing modules; the rest is plain React + inline styles.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Calculator, X } from 'lucide-react';
import type {
  AdvFloatingLauncher,
  AdvFloatingLauncherPosition,
} from '@shared/templatePresets';

/** BD-3m — brand-blue icon colour (locked; matches DEFAULT_ADV_STYLE.accent). */
const BRAND_BLUE = '#0d3cfc';

/** BD-3m — mobile breakpoint (matches AIChatBubble.tsx + design system). */
const MOBILE_BREAKPOINT = 768;

/** BD-3m — collision offset when chat bubble lives in the same corner. */
const COLLISION_OFFSET_PX = 72;

/** BD-3m — viewport margin from the chosen corner (matches embed popup mode). */
const EDGE_MARGIN_PX = 20;

/** BD-3m — expanded-panel dimensions. */
const PANEL_WIDTH = 480;
const PANEL_HEIGHT = 720;

/** BD-3m — launcher dimensions (desktop / mobile). */
const LAUNCHER_SIZE_DESKTOP = 56;
const LAUNCHER_SIZE_MOBILE = 48;

/** BD-3m — animation duration; respects prefers-reduced-motion. */
const ANIM_MS = 240;

/** BD-3m — localStorage key prefix for the saved open/closed state. */
const LAUNCHER_STATE_KEY_PREFIX = 'qq-launcher-state-';
/** BD-3m — chat panel coordinate key (READ-ONLY from this component). */
const CHAT_POSITION_KEY = 'qq-chat-position';

interface ChatPosition {
  x: number;
  y: number;
}

interface CalculatorLauncherProps {
  /** BD-3m — owning calculator id; namespaces the localStorage open/closed key. */
  calculatorId: number | string;
  /** BD-3m — resolved launcher config from `advanced.style.floatingLauncher`. */
  config: AdvFloatingLauncher;
  /**
   * BD-3m — when true, `customIconUrl` + `label` are honoured. When false,
   * the launcher falls back to the default lucide:Calculator + canned
   * a11y label (defense-in-depth, matches server-side strip).
   */
  proTierUnlocked?: boolean;
  /**
   * BD-3m — the AdvancedCalculator (or any widget) that mounts inside the
   * expanded panel. Pass either pre-built JSX as `children`, or a render
   * function via `renderCalculator` if you need to lazy-mount.
   */
  children?: ReactNode;
  renderCalculator?: () => ReactNode;
  /**
   * BD-3m — accent override (Style tab → accent). Defaults to BRAND_BLUE.
   * The icon stroke + open-state focus ring use this colour.
   */
  accent?: string;
}

/** BD-3m — defensive localStorage wrappers. Privacy-mode + sandbox safe. */
function readStorage(key: string): string | null {
  try { return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null; }
  catch { return null; }
}
function writeStorage(key: string, value: string): void {
  try { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); }
  catch { /* QuotaExceeded / sandbox — silent */ }
}

/** BD-3m — translate the chat panel's {x, y} coords into the nearest corner.
 *  Returns null if no chat position is stored (chat never been opened). */
function resolveChatCorner(): AdvFloatingLauncherPosition | null {
  if (typeof window === 'undefined') return null;
  const raw = readStorage(CHAT_POSITION_KEY);
  if (!raw) return null;
  let pos: ChatPosition | null = null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
      pos = { x: parsed.x, y: parsed.y };
    }
  } catch { return null; }
  if (!pos) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = pos.x < vw / 2;
  const top = pos.y < vh / 2;
  return (`${top ? 'top' : 'bottom'}-${left ? 'left' : 'right'}`) as AdvFloatingLauncherPosition;
}

/** BD-3m — does the user OS request reduced motion? Defensive default false. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

export default function CalculatorLauncher({
  calculatorId,
  config,
  proTierUnlocked = false,
  children,
  renderCalculator,
  accent,
}: CalculatorLauncherProps): JSX.Element | null {
  const enabled = config.enabled === true;
  const position: AdvFloatingLauncherPosition = config.position ?? 'bottom-right';
  // BD-3m — Pro-only sub-fields. Defense in depth: the StyleTab also disables
  // these inputs for free-tier, and the server route strips them on save.
  // If both layers somehow leak, this final gate still keeps the launcher
  // visually neutral on free-tier embeds.
  const customIconUrl = proTierUnlocked && typeof config.customIconUrl === 'string'
    ? config.customIconUrl : '';
  const label = proTierUnlocked && typeof config.label === 'string' && config.label.trim().length > 0
    ? config.label.trim() : 'Open quote calculator';

  const stateKey = useMemo(
    () => `${LAUNCHER_STATE_KEY_PREFIX}${calculatorId}`,
    [calculatorId],
  );

  // Mount-time: read saved state. Default closed. SSR safe.
  const [open, setOpen] = useState<boolean>(false);
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
    const raw = readStorage(stateKey);
    if (raw === 'open') setOpen(true);
  }, [stateKey]);

  // Persist on change (don't write on initial render to avoid clobbering).
  useEffect(() => {
    if (!hasMounted) return;
    writeStorage(stateKey, open ? 'open' : 'closed');
  }, [open, stateKey, hasMounted]);

  // Mobile breakpoint detection — used for both launcher size + full-screen
  // panel + collision-axis (horizontal on desktop, vertical on mobile).
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const check = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Collision detection — recompute on mount AND on storage events (so the
  // launcher re-positions when the chat is dragged in another tab/iframe).
  const [collides, setCollides] = useState(false);
  useEffect(() => {
    const recheck = () => {
      const chatCorner = resolveChatCorner();
      setCollides(chatCorner !== null && chatCorner === position);
    };
    recheck();
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === CHAT_POSITION_KEY) recheck();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [position]);

  // Escape closes the panel.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const reducedMotion = useMemo(() => prefersReducedMotion(), []);

  if (!enabled) {
    // BD-3m — when the floating launcher mode is off, render nothing.
    // Inline embed mode is handled by the embed script / wizard preview.
    return null;
  }

  // ─── Position math ───────────────────────────────────────────────
  // `position` is the picked corner; collide offset is applied along the
  // long axis (horizontal on desktop, vertical on mobile) so the launcher
  // sits 72 px clear of the AI chat bubble that owns the same corner.
  const launcherSize = isMobile ? LAUNCHER_SIZE_MOBILE : LAUNCHER_SIZE_DESKTOP;
  const collisionOffset = collides ? COLLISION_OFFSET_PX : 0;
  const horizontalCollision = collides && !isMobile;
  const verticalCollision = collides && isMobile;

  const launcherPos: Record<string, string | number> = {
    position: 'fixed',
    width: launcherSize,
    height: launcherSize,
    zIndex: 9990,
  };
  switch (position) {
    case 'bottom-right':
      launcherPos.bottom = EDGE_MARGIN_PX + (verticalCollision ? collisionOffset : 0);
      launcherPos.right = EDGE_MARGIN_PX + (horizontalCollision ? collisionOffset : 0);
      break;
    case 'bottom-left':
      launcherPos.bottom = EDGE_MARGIN_PX + (verticalCollision ? collisionOffset : 0);
      launcherPos.left = EDGE_MARGIN_PX + (horizontalCollision ? collisionOffset : 0);
      break;
    case 'top-right':
      launcherPos.top = EDGE_MARGIN_PX + (verticalCollision ? collisionOffset : 0);
      launcherPos.right = EDGE_MARGIN_PX + (horizontalCollision ? collisionOffset : 0);
      break;
    case 'top-left':
      launcherPos.top = EDGE_MARGIN_PX + (verticalCollision ? collisionOffset : 0);
      launcherPos.left = EDGE_MARGIN_PX + (horizontalCollision ? collisionOffset : 0);
      break;
  }

  // Expanded-panel position: on mobile we go full-screen; on desktop the
  // panel docks to the same corner as the launcher.
  const panelPos: Record<string, string | number> = {
    position: 'fixed',
    zIndex: 9991,
    background: '#fff',
    borderRadius: isMobile ? 0 : 16,
    boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };
  if (isMobile) {
    Object.assign(panelPos, {
      inset: 0,
      width: '100vw',
      height: '100vh',
    });
  } else {
    // Auto-fit: clamp to viewport with 16px gutters all around.
    const w = `min(${PANEL_WIDTH}px, calc(100vw - 32px))`;
    const h = `min(${PANEL_HEIGHT}px, calc(100vh - 32px))`;
    Object.assign(panelPos, { width: w, height: h });
    switch (position) {
      case 'bottom-right':
        panelPos.bottom = EDGE_MARGIN_PX;
        panelPos.right = EDGE_MARGIN_PX;
        break;
      case 'bottom-left':
        panelPos.bottom = EDGE_MARGIN_PX;
        panelPos.left = EDGE_MARGIN_PX;
        break;
      case 'top-right':
        panelPos.top = EDGE_MARGIN_PX;
        panelPos.right = EDGE_MARGIN_PX;
        break;
      case 'top-left':
        panelPos.top = EDGE_MARGIN_PX;
        panelPos.left = EDGE_MARGIN_PX;
        break;
    }
  }

  // Transform origin so the expand animation pops OUT of the launcher's
  // corner rather than from screen-center.
  const transformOrigin = position.replace('-', ' ');

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const iconColour = accent || BRAND_BLUE;

  const launcherButton = (
    <button
      type="button"
      data-testid="qq-launcher"
      data-position={position}
      data-collides={collides ? 'true' : 'false'}
      aria-label={label}
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={toggle}
      style={{
        ...launcherPos,
        display: open ? 'none' : 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff',
        border: 'none',
        borderRadius: '50%',
        cursor: 'pointer',
        padding: 0,
        boxShadow: '0 6px 18px rgba(15,23,42,0.18)',
        transition: reducedMotion ? 'none' : 'transform 120ms ease-out, box-shadow 120ms ease-out',
      }}
      onMouseEnter={(e) => {
        if (reducedMotion) return;
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.04)';
      }}
      onMouseLeave={(e) => {
        if (reducedMotion) return;
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
      }}
    >
      {customIconUrl ? (
        // BD-3m — Pro-tier custom icon. Renders inside the same 56/48 circle
        // with object-fit: contain so any aspect ratio works. The image
        // upload uploader in StyleTab enforces the 1 MB cap via FileReader.
        <img
          src={customIconUrl}
          alt=""
          width={launcherSize}
          height={launcherSize}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <Calculator
          size={isMobile ? 22 : 26}
          color={iconColour}
          strokeWidth={2.25}
          aria-hidden="true"
        />
      )}
    </button>
  );

  return (
    <>
      {launcherButton}

      {/* Mobile-only scrim behind the full-screen panel so the host page
       *  content doesn't bleed through any safe-area gaps. Desktop uses the
       *  panel shadow alone. */}
      {open && isMobile && (
        <div
          data-testid="qq-launcher-scrim"
          aria-hidden="true"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9991,
            background: 'rgba(15,23,42,0.42)',
          }}
        />
      )}

      {/* Expanded panel — auto-fits the viewport. Mounts only when open
       *  so the AdvancedCalculator doesn't pay any cost before first click.
       *  When closed the launcher button alone is on the page. */}
      <div
        role="dialog"
        aria-modal={isMobile ? 'true' : 'false'}
        aria-label={label}
        data-testid="qq-launcher-panel"
        data-state={open ? 'open' : 'closed'}
        style={{
          ...panelPos,
          display: open ? 'flex' : 'none',
          transformOrigin,
          // BD-3m — expand animation. The collapsed state never mounts the
          // calculator (mount-on-open above), so this transition only fires
          // ONCE per open. Reduced-motion users get the instant-open path.
          animation: open && !reducedMotion
            ? `qq-launcher-expand ${ANIM_MS}ms ease-out`
            : undefined,
        }}
      >
        {/* Close button — top-right of the panel. z-indexed above the
         *  calculator's own content so it's always tappable. */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close calculator"
          data-testid="qq-launcher-close"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
            width: 32,
            height: 32,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fff',
            border: '1px solid rgba(15,23,42,0.12)',
            borderRadius: 999,
            cursor: 'pointer',
            color: '#0f172a',
            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {open ? (renderCalculator ? renderCalculator() : children) : null}
        </div>
      </div>

      {/* BD-3m — keyframes scoped via plain inline <style>. No new CSS
       *  dependency; the rule is auto-deduped by the browser when this
       *  component mounts more than once. Reduced-motion users skip the
       *  animation entirely (the `animation` style above is undefined). */}
      <style>{`
        @keyframes qq-launcher-expand {
          0% { opacity: 0; transform: scale(0.92); }
          100% { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-testid="qq-launcher"],
          [data-testid="qq-launcher-panel"] {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </>
  );
}
