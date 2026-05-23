import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, Loader2, GripHorizontal, Trash2 } from 'lucide-react';

/**
 * CONTRAST-2 — AIChatBubble is light-theme locked.
 *
 * The chat panel renders over a white surface with a brand-accent header,
 * so `#fff` and `#000` inside the style objects below are intentional for
 * that single theme. The pill-mode and panel-mode root JSX elements both
 * carry data-theme="light", which scopes the hardcoded-color lint
 * exemption to this whole module.
 */

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** BD-3c Feature 3 — timestamp for persistence (ms since epoch). */
  ts?: number;
}

interface AIChatBubbleProps {
  calculatorId: number;
  accentColor?: string;
  businessName?: string;
  theme?: any;
  /**
   * W-BB-1 — opt into multi-step agent loop. When true, the bubble POSTs
   * with `useAgentLoop: true` and consumes SSE step events so the typing
   * indicator can show "Checking schedule..." → "Confirming booking..."
   * before the final reply lands. Default true; pass false to keep the
   * legacy single-call behaviour.
   */
  useAgentLoop?: boolean;
  /** Customer identity captured by the lead form earlier in the widget. */
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  /**
   * BD-2c — visibility mode.
   *   - `'rescue'` (default): bubble stays hidden until the user has
   *     advanced beyond step 2, idles for 30s on a single step, or clicks
   *     a Help button anywhere in the widget. Once revealed, persists.
   *   - `'always'`: legacy behaviour, bubble visible from page load.
   *
   * Free-tier calculators always use `'rescue'` regardless of the stored
   * value (the caller — `calculator.tsx` — enforces the tier gate).
   */
  visibility?: 'rescue' | 'always';
}

/**
 * Human-readable status labels for the agent-loop "AI is …" indicator.
 * Keys match the auto-tier tool names in customerWidgetTools.ts.
 */
const TOOL_STATUS_LABELS: Record<string, string> = {
  fetch_customer_quote_history: 'Checking your quote history',
  propose_appointment_times: 'Finding available times',
  book_appointment: 'Confirming your booking',
  send_quote_confirmation_email: 'Sending your estimate',
  request_human_followup: 'Looping in a human teammate',
  update_my_quote_with_addons: 'Recalculating your quote',
};

function generateSessionId() {
  return 'sess_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now();
}

// BD-3c Feature 3 — localStorage keys + caps.
const POSITION_KEY = 'qq-chat-position';
const HISTORY_KEY_PREFIX = 'qq-chat-history-';
const HISTORY_MAX = 50;

// BD-3d Feature 2 — proactive (behavior-triggered) chat copy + cooldown
// timings. Triggers: 30s idle on the wizard, 5+ wizard patches in 30s
// without save, OR any HelpCue click. 3-minute cooldown between proactive
// messages; dismissing a specific copy variant extends THAT variant's
// cooldown to 10 minutes so the user isn't nagged with the same line.
const PROACTIVE_LAST_KEY = 'qq-proactive-last-shown'; // ms timestamp
const PROACTIVE_DISMISS_PREFIX = 'qq-proactive-dismiss-'; // + variant key
const PROACTIVE_COOLDOWN_MS = 3 * 60 * 1000;
const PROACTIVE_DISMISS_COOLDOWN_MS = 10 * 60 * 1000;
const PROACTIVE_IDLE_MS = 30_000;
const PROACTIVE_RAPID_WINDOW_MS = 30_000;
const PROACTIVE_RAPID_THRESHOLD = 5;
const PROACTIVE_VISIBLE_MS = 4_000;

interface ProactiveCopy { key: string; text: string; }
const PROACTIVE_VARIANTS: ProactiveCopy[] = [
  { key: 'build-for-you', text: "Struggling to build a tool? Just text me what you need and I'll build it for you." },
  { key: 'need-a-hand', text: 'Need a hand?' },
  { key: 'formula', text: 'I can quickly create you a perfect calculation formula' },
  { key: 'upload-invoice', text: "Upload an image of your regular service invoice/quote and I'll replicate this into a well-designed calculator formula" },
];

// BD-3c Feature 3 — defensive storage wrappers. localStorage throws in
// privacy mode, when full, or under sandbox restrictions; swallow silently
// so chat keeps working without persistence.
function readStorage(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* QuotaExceeded etc. */ }
}
function removeStorage(key: string): void {
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}
function readSession(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}
function writeSession(key: string, value: string): void {
  try { window.sessionStorage.setItem(key, value); } catch { /* ignore */ }
}

interface PanelPosition { x: number; y: number; }

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 480;
// BD-3c Feature 2 — input height presets.
const INPUT_MIN_H = 64;   // bigger default (~3 lines, was ~36px)
const INPUT_EXPANDED_H = 120; // expand-on-focus (~6 lines)

function loadPosition(): PanelPosition | null {
  const raw = readStorage(POSITION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
      return { x: parsed.x, y: parsed.y };
    }
  } catch { /* ignore malformed */ }
  return null;
}

function historyKey(calculatorId: number): string {
  // Fallback to a session-scoped key when calculatorId is missing/invalid.
  if (!calculatorId || !Number.isFinite(calculatorId)) {
    return ''; // sentinel — caller falls back to sessionStorage
  }
  return `${HISTORY_KEY_PREFIX}${calculatorId}`;
}

function loadHistory(calculatorId: number): Message[] {
  const key = historyKey(calculatorId);
  let raw: string | null = null;
  if (key) raw = readStorage(key);
  else raw = readSession('qq-chat-history-session');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map((m: any) => ({ role: m.role, content: m.content, ts: typeof m.ts === 'number' ? m.ts : undefined }))
        .slice(-HISTORY_MAX);
    }
  } catch { /* ignore */ }
  return [];
}

function saveHistory(calculatorId: number, messages: Message[]): void {
  // Strip to role+content+ts only (no tokens, no internal state).
  const trimmed = messages
    .slice(-HISTORY_MAX)
    .map((m) => ({ role: m.role, content: m.content, ts: m.ts ?? Date.now() }));
  const payload = JSON.stringify(trimmed);
  const key = historyKey(calculatorId);
  if (key) writeStorage(key, payload);
  else writeSession('qq-chat-history-session', payload);
}

function clearHistory(calculatorId: number): void {
  const key = historyKey(calculatorId);
  if (key) removeStorage(key);
  else writeSession('qq-chat-history-session', '[]');
}

export default function AIChatBubble({
  calculatorId,
  accentColor = '#6366f1',
  businessName = 'AI Assistant',
  theme,
  useAgentLoop = true,
  customerEmail,
  customerPhone,
  customerName,
  visibility = 'rescue',
}: AIChatBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);
  /* BD-2c — visibility gate. `'always'` mode keeps the bubble visible from
   * mount (legacy). `'rescue'` mode starts hidden and reveals once ANY of:
   *   - widget reports `stepIndex >= 2` via the `quotequick:step` event
   *   - the user has been idle on the current step for >= 30s
   *   - any Help button anywhere in the widget dispatches `quotequick:help`
   * Once revealed, persists for the rest of the session. */
  const [revealed, setRevealed] = useState(visibility === 'always');
  useEffect(() => {
    if (visibility === 'always') { setRevealed(true); return; }
    if (typeof window === 'undefined') return;

    let idleTimer: number | undefined;
    const startIdle = () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setRevealed(true), 30_000);
    };
    startIdle();

    const onStep = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      // Restart the idle timer on each step change.
      startIdle();
      if (typeof detail.stepIndex === 'number' && detail.stepIndex >= 2) {
        setRevealed(true);
      }
    };
    const onHelp = () => setRevealed(true);
    // Generic any-input movement resets the idle timer so we don't reveal
    // while the user is actively typing or scrolling.
    const onActivity = () => startIdle();

    window.addEventListener('quotequick:step', onStep as EventListener);
    window.addEventListener('quotequick:help', onHelp as EventListener);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('pointerdown', onActivity);
    return () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      window.removeEventListener('quotequick:step', onStep as EventListener);
      window.removeEventListener('quotequick:help', onHelp as EventListener);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('pointerdown', onActivity);
    };
  }, [visibility]);
  // BD-3d Feature 2 — proactive toast above the pill. Holds the currently
  // visible copy variant + a small notification badge flag. Both clear when
  // the user opens the chat panel, dismisses the toast, or the auto-hide
  // timer elapses. Independent from `revealed` so the toast also surfaces
  // when the full FAB is visible.
  const [proactiveCopy, setProactiveCopy] = useState<ProactiveCopy | null>(null);
  const [proactiveBadge, setProactiveBadge] = useState(false);
  const rapidEditTimestamps = useRef<number[]>([]);
  const proactiveHideTimer = useRef<number | undefined>(undefined);

  /**
   * BD-3d Feature 2 — pick the next eligible proactive copy variant.
   *
   * Iterates the variant list in order; the first one whose per-variant
   * dismissal cooldown has elapsed wins. Returns null when all variants are
   * dismissed within the last 10 minutes (the user clearly doesn't want
   * proactive nudges right now).
   */
  const pickProactiveVariant = useCallback((): ProactiveCopy | null => {
    const now = Date.now();
    for (const v of PROACTIVE_VARIANTS) {
      const raw = readSession(`${PROACTIVE_DISMISS_PREFIX}${v.key}`);
      if (!raw) return v;
      const ts = Number(raw);
      if (!Number.isFinite(ts) || now - ts > PROACTIVE_DISMISS_COOLDOWN_MS) return v;
    }
    return null;
  }, []);

  /**
   * BD-3d Feature 2 — fire a proactive nudge.
   *
   * Respects the 3-minute global cooldown (sessionStorage). No-ops when the
   * chat panel is open, when the bubble hasn't been revealed yet and we're
   * still in pure-pill mode (the pill itself is the affordance — extra toast
   * would be noisy), or when the user has dismissed every variant recently.
   */
  const fireProactive = useCallback(() => {
    if (isOpen) return; // user is already chatting; no nudge needed
    const lastRaw = readSession(PROACTIVE_LAST_KEY);
    const last = lastRaw ? Number(lastRaw) : 0;
    if (last && Date.now() - last < PROACTIVE_COOLDOWN_MS) return;
    const variant = pickProactiveVariant();
    if (!variant) return;
    writeSession(PROACTIVE_LAST_KEY, String(Date.now()));
    setProactiveCopy(variant);
    setProactiveBadge(true);
    if (proactiveHideTimer.current !== undefined) {
      window.clearTimeout(proactiveHideTimer.current);
    }
    proactiveHideTimer.current = window.setTimeout(() => {
      setProactiveCopy(null);
      // Badge persists past the toast hide so the FAB carries a subtle
      // unread dot until the user actually opens the chat.
    }, PROACTIVE_VISIBLE_MS);
  }, [isOpen, pickProactiveVariant]);

  // BD-3d Feature 2 — install behavior-triggered listeners. Idle timer on
  // wizard activity (mousemove / keydown / pointerdown / wizard-patch),
  // rapid-edit counter on wizard patches, instant fire on help-cue clicks.
  // Cleans up everything on unmount.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let idleTimer: number | undefined;
    const restartIdle = () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(fireProactive, PROACTIVE_IDLE_MS);
    };
    restartIdle();

    const onActivity = () => { restartIdle(); };
    const onPatch = () => {
      // Rapid-edit detection: keep timestamps inside the rolling 30s window.
      const now = Date.now();
      const arr = rapidEditTimestamps.current;
      arr.push(now);
      while (arr.length && now - arr[0] > PROACTIVE_RAPID_WINDOW_MS) arr.shift();
      if (arr.length >= PROACTIVE_RAPID_THRESHOLD) {
        // Reset the window so we don't re-fire on the very next patch.
        rapidEditTimestamps.current = [];
        fireProactive();
      }
      restartIdle();
    };
    const onSave = () => { rapidEditTimestamps.current = []; };
    const onHelpCue = () => { fireProactive(); };

    window.addEventListener('mousemove', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('quotequick:wizard-patch', onPatch as EventListener);
    window.addEventListener('quotequick:wizard-save', onSave as EventListener);
    window.addEventListener('quotequick:help-cue-clicked', onHelpCue as EventListener);

    return () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      if (proactiveHideTimer.current !== undefined) window.clearTimeout(proactiveHideTimer.current);
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('quotequick:wizard-patch', onPatch as EventListener);
      window.removeEventListener('quotequick:wizard-save', onSave as EventListener);
      window.removeEventListener('quotequick:help-cue-clicked', onHelpCue as EventListener);
    };
  }, [fireProactive]);

  // BD-3d Feature 2 — opening the panel clears the toast + badge. The user
  // got the message (literally), so further nudges would be spam.
  useEffect(() => {
    if (!isOpen) return;
    setProactiveCopy(null);
    setProactiveBadge(false);
    if (proactiveHideTimer.current !== undefined) {
      window.clearTimeout(proactiveHideTimer.current);
      proactiveHideTimer.current = undefined;
    }
  }, [isOpen]);

  /** BD-3d Feature 2 — dismiss the current toast. Extends the per-variant
   *  cooldown to 10 minutes so the same line doesn't reappear soon. */
  const handleDismissProactive = useCallback(() => {
    const variant = proactiveCopy;
    if (variant) {
      writeSession(`${PROACTIVE_DISMISS_PREFIX}${variant.key}`, String(Date.now()));
    }
    setProactiveCopy(null);
    if (proactiveHideTimer.current !== undefined) {
      window.clearTimeout(proactiveHideTimer.current);
      proactiveHideTimer.current = undefined;
    }
  }, [proactiveCopy]);

  /** BD-3d Feature 2 — tapping the toast opens the chat panel directly. */
  const handleAcceptProactive = useCallback(() => {
    setProactiveCopy(null);
    setProactiveBadge(false);
    setRevealed(true);
    setIsOpen(true);
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trialExpired, setTrialExpired] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  /** Current in-progress step label for the typing indicator tooltip. */
  const [stepStatus, setStepStatus] = useState<string | null>(null);
  // BD-3c Feature 2 — focus state for expand-on-click input. Stays expanded
  // while focused, OR while there's content in the input.
  const [inputFocused, setInputFocused] = useState(false);
  // BD-3c Feature 3 — panel position (null = use default bottom-right).
  // Loaded from localStorage on first open so the position survives reloads.
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // BD-3c Feature 3 — track whether history has been hydrated for this open
  // session, so we don't double-fire the auto-greeting on top of restored
  // history.
  const hydratedRef = useRef(false);

  const sessionIdRef = useRef(generateSessionId());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Detect prefers-reduced-motion once for animation gating.
  const reduceMotionRef = useRef(false);
  useEffect(() => {
    try {
      reduceMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch { reduceMotionRef.current = false; }
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Scroll to bottom within the chat container (not the page)
  useEffect(() => {
    if (isOpen && messagesAreaRef.current) {
      messagesAreaRef.current.scrollTo({ top: messagesAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // BD-3c Feature 3 — restore conversation + position on panel open.
  // Runs once per open transition (hydratedRef guards re-entry).
  useEffect(() => {
    if (!isOpen) {
      hydratedRef.current = false;
      return;
    }
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    // Restore position once on first reveal (independent of open).
    if (position === null) {
      const saved = loadPosition();
      if (saved) setPosition(saved);
    }

    const restored = loadHistory(calculatorId);
    if (restored.length > 0) {
      setMessages(restored);
    } else {
      setMessages([{
        role: 'assistant',
        content: `Hi! I'm the AI assistant for ${businessName}. How can I help you today?`,
        ts: Date.now(),
      }]);
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen, businessName, calculatorId, position]);

  // BD-3c Feature 3 — persist conversation on every message change. Skip
  // when the panel is closed (no messages yet to persist) and when there's
  // only the auto-greeting (don't pollute storage with the seed).
  useEffect(() => {
    if (!isOpen) return;
    if (messages.length === 0) return;
    if (messages.length === 1 && messages[0].role === 'assistant') return;
    saveHistory(calculatorId, messages);
  }, [messages, calculatorId, isOpen]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading || trialExpired) return;

    const userMessage: Message = { role: 'user', content: input.trim(), ts: Date.now() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);
    setStepStatus(null);
    setError(null);

    try {
      const res = await fetch('/api/ai/client-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          calculator_id: calculatorId,
          session_id: sessionIdRef.current,
          useAgentLoop,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          customer_name: customerName,
        }),
      });

      // SSE branch (W-BB-1) — agent loop streams progress + final text.
      const contentType = res.headers.get('content-type') || '';
      if (useAgentLoop && contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantText = '';
        // Reserve one placeholder assistant message we keep updating.
        setMessages(prev => [...prev, { role: 'assistant', content: '', ts: Date.now() }]);
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';
          for (const frame of frames) {
            const line = frame.startsWith('data: ') ? frame.slice(6) : frame;
            if (line === '[DONE]') continue;
            try {
              const evt = JSON.parse(line);
              if (evt.error) {
                setError(evt.error);
              } else if (evt.text) {
                assistantText += evt.text;
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: 'assistant', content: assistantText, ts: Date.now() };
                  return copy;
                });
              } else if (evt.step) {
                if (evt.step.type === 'tool_use') {
                  const label = TOOL_STATUS_LABELS[evt.step.payload?.name] || 'Working on it';
                  setStepStatus(label + '...');
                } else if (evt.step.type === 'tool_result') {
                  setStepStatus(null);
                }
              }
            } catch {
              // Ignore malformed frames — keep the stream alive.
            }
          }
        }
        return;
      }

      // Legacy JSON branch — single-call behavior.
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'trial_expired') {
          setTrialExpired(true);
          setMessages(prev => [...prev, { role: 'assistant', content: data.message || 'AI Assistant paused — upgrade to continue.', ts: Date.now() }]);
        } else {
          setError(data.error || 'Something went wrong. Please try again.');
        }
        return;
      }
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, ts: Date.now() }]);
    } catch (err) {
      setError('Unable to connect. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
      setStepStatus(null);
    }
  }, [input, isLoading, trialExpired, messages, calculatorId, useAgentLoop, customerEmail, customerPhone, customerName]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // BD-3c Feature 3 — clear conversation. Wipes storage for this calc and
  // resets to a fresh auto-greeting.
  const handleClearConversation = useCallback(() => {
    clearHistory(calculatorId);
    setMessages([{
      role: 'assistant',
      content: `Hi! I'm the AI assistant for ${businessName}. How can I help you today?`,
      ts: Date.now(),
    }]);
    setError(null);
  }, [calculatorId, businessName]);

  // BD-3c Feature 3 — drag-handle move. Pointer-based (works for mouse +
  // touch). We snapshot the initial position + pointer location on
  // pointerdown, then translate by the delta on pointermove, clamped to
  // viewport. Persists to localStorage on pointerup. Mobile (isMobile) is
  // full-screen so drag is disabled there.
  const handleDragStart = useCallback((startEvent: React.PointerEvent<HTMLDivElement>) => {
    if (isMobile) return;
    startEvent.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const startPointerX = startEvent.clientX;
    const startPointerY = startEvent.clientY;
    const startX = rect.left;
    const startY = rect.top;
    setIsDragging(true);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startPointerX;
      const dy = ev.clientY - startPointerY;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Clamp so the panel can't be dragged off-screen.
      const nextX = Math.max(0, Math.min(vw - PANEL_WIDTH, startX + dx));
      const nextY = Math.max(0, Math.min(vh - PANEL_HEIGHT, startY + dy));
      setPosition({ x: nextX, y: nextY });
    };
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      // Persist final position.
      setPosition((p) => {
        if (p) writeStorage(POSITION_KEY, JSON.stringify(p));
        return p;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [isMobile]);

  // BD-3c Feature 2 — derived input height. Expanded while focused or
  // while there's content (so the user can read what they typed without
  // it collapsing during e.g. a quick click outside).
  const inputExpanded = inputFocused || input.length > 0;
  const inputHeight = inputExpanded ? INPUT_EXPANDED_H : INPUT_MIN_H;
  const inputTransition = reduceMotionRef.current
    ? 'none'
    : 'height 180ms ease-out';

  // BD-3c Feature 3 — compute panel style. When position is set AND we're
  // on desktop, use absolute top/left coordinates. Otherwise default
  // bottom-right anchor (legacy behavior).
  const desktopPanelStyle: React.CSSProperties = position !== null
    ? {
        position: 'fixed',
        top: `${position.y}px`,
        left: `${position.x}px`,
        zIndex: 9999,
        width: `${PANEL_WIDTH}px`,
        height: `${PANEL_HEIGHT}px`,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        background: '#fff',
        userSelect: isDragging ? 'none' : 'auto',
      }
    : {
        position: 'fixed',
        bottom: '88px',
        right: '24px',
        zIndex: 9999,
        width: `${PANEL_WIDTH}px`,
        height: `${PANEL_HEIGHT}px`,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        background: '#fff',
        userSelect: isDragging ? 'none' : 'auto',
      };

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
      }
    : desktopPanelStyle;

  // BD-2c-fix — when the rescue gate hasn't tripped yet, instead of
  // rendering nothing (which left customers with no way to ask for help
  // and broke "ai chat inside quickquote" entirely), render a small
  // always-visible "Need help?" pill. Click reveals the full FAB + opens
  // the panel. This preserves BD-2c's research-driven default (the big
  // FAB doesn't auto-show) while guaranteeing an affordance at all times.
  // NOTE BD-3c — pill must remain ALWAYS-VISIBLE at z-index 9998 per P0
  // fix #473. Do not regress.
  if (!revealed) {
    const handlePillClick = () => {
      setRevealed(true);
      setIsOpen(true);
    };
    return (
      <>
        {/* BD-3d Feature 2 — proactive toast above the rescue-mode pill. */}
        {proactiveCopy && (
          <ProactiveToast
            copy={proactiveCopy}
            accentColor={accentColor}
            anchorBottom={64}
            onAccept={handleAcceptProactive}
            onDismiss={handleDismissProactive}
            reduceMotion={reduceMotionRef.current}
          />
        )}
        <button
          type="button"
          onClick={handlePillClick}
          data-theme="light"
          data-testid="button-chat-help-pill"
          aria-label="Open AI assistant"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 9998,
            padding: '8px 14px',
            borderRadius: '999px',
            background: accentColor,
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
            opacity: 0.92,
            transition: 'opacity 0.15s, transform 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.opacity = '1';
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.04)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.opacity = '0.92';
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          }}
        >
          <MessageCircle size={14} />
          Need help?
          {/* BD-3d Feature 2 — small unread dot when a proactive nudge
              hasn't been acted on. */}
          {proactiveBadge && (
            <span
              data-testid="chat-proactive-badge"
              aria-label="New message"
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#ef4444', display: 'inline-block',
                marginLeft: 2,
              }}
            />
          )}
        </button>
      </>
    );
  }

  return (
    <>
      {isOpen && (
        <div ref={panelRef} data-theme="light" style={panelStyle} data-testid="ai-chat-panel">
          <div
            style={{
              background: accentColor,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            {/* BD-3c Feature 3 — drag handle. Centered atop the panel
                header, 32px wide × 16px tall. Pointer-based drag moves
                the panel; position persists to localStorage on release.
                Hidden on mobile (full-screen mode). */}
            {!isMobile && (
              <div
                onPointerDown={handleDragStart}
                role="button"
                tabIndex={-1}
                aria-label="Drag to reposition chat"
                data-testid="chat-drag-handle"
                style={{
                  position: 'absolute',
                  top: '4px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '32px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255,255,255,0.85)',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  touchAction: 'none',
                  userSelect: 'none',
                }}
              >
                <GripHorizontal size={18} />
              </div>
            )}
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '15px', lineHeight: 1.2 }} data-testid="text-chat-business-name">
                {businessName}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px' }}>AI Assistant</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* BD-3c Feature 3 — clear conversation. Wipes localStorage
                  for this calculator + resets to the auto-greeting. */}
              <button
                onClick={handleClearConversation}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
                data-testid="button-chat-clear"
                aria-label="Clear conversation"
                title="Clear conversation"
              >
                <Trash2 size={13} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
                data-testid="button-chat-close"
                aria-label="Close chat"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div
            ref={messagesAreaRef}
            style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#f8f9fa' }}
            data-testid="chat-messages-area"
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
                data-testid={`chat-message-${msg.role}-${i}`}
              >
                <div
                  style={{
                    maxWidth: '82%',
                    padding: '9px 13px',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: msg.role === 'user' ? accentColor : '#fff',
                    color: msg.role === 'user' ? '#fff' : '#1a1a1a',
                    fontSize: '14px',
                    lineHeight: 1.5,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }} data-testid="chat-typing-indicator">
                <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#bbb', animation: 'ai-dot-bounce 1.2s infinite 0s' }} />
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#bbb', animation: 'ai-dot-bounce 1.2s infinite 0.2s' }} />
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#bbb', animation: 'ai-dot-bounce 1.2s infinite 0.4s' }} />
                </div>
                {stepStatus && (
                  <div
                    style={{ fontSize: '11px', color: '#6b7280', padding: '2px 6px', fontStyle: 'italic' }}
                    title={stepStatus}
                    data-testid="chat-step-status"
                  >
                    {stepStatus}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div style={{ background: '#fff3f3', border: '1px solid #fca5a5', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#dc2626' }} data-testid="chat-error-message">
                {error}
              </div>
            )}

            {trialExpired && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#92400e', textAlign: 'center' }} data-testid="chat-trial-expired">
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>AI Assistant paused</div>
                <div>The free trial has ended. Upgrade to reactivate.</div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: '12px', background: '#fff', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              {/* BD-3c Feature 2 — bigger default textarea (64px ≈ 3 lines)
                  that expands to 120px (~6 lines) on focus. Animated via
                  height transition with prefers-reduced-motion respected.
                  Swapped from <input type="text"> to <textarea> so multi-
                  line text actually has room to breathe. */}
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder={trialExpired ? 'AI paused' : 'Type your message...'}
                disabled={isLoading || trialExpired}
                rows={inputExpanded ? 6 : 3}
                style={{
                  flex: 1,
                  padding: '10px 13px',
                  borderRadius: '14px',
                  border: '1px solid #e5e7eb',
                  outline: 'none',
                  fontSize: '15px',
                  lineHeight: 1.45,
                  background: trialExpired ? '#f9f9f9' : '#fff',
                  color: '#1a1a1a',
                  resize: 'none',
                  height: `${inputHeight}px`,
                  minHeight: `${INPUT_MIN_H}px`,
                  transition: inputTransition,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
                data-testid="input-chat-message"
                aria-label="Chat message input"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading || trialExpired}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: (!input.trim() || isLoading || trialExpired) ? '#e5e7eb' : accentColor,
                  border: 'none',
                  cursor: (!input.trim() || isLoading || trialExpired) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  flexShrink: 0,
                  transition: 'background 0.15s',
                }}
                data-testid="button-chat-send"
                aria-label="Send message"
              >
                {isLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />}
              </button>
            </div>
            <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '11px', color: '#9ca3af' }} data-testid="text-powered-by">
              Powered by AI
            </div>
          </div>
        </div>
      )}

      {/* BD-3d Feature 2 — proactive toast above the FAB. Only rendered
          when the panel is closed (the message goes away once they engage). */}
      {!isOpen && proactiveCopy && (
        <ProactiveToast
          copy={proactiveCopy}
          accentColor={accentColor}
          anchorBottom={92}
          onAccept={handleAcceptProactive}
          onDismiss={handleDismissProactive}
          reduceMotion={reduceMotionRef.current}
        />
      )}

      <button
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9998,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: accentColor,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          color: '#fff',
          transition: 'transform 0.15s, box-shadow 0.15s',
          // BD-2c — subtle slide-up entrance the first time the bubble
          // reveals (rescue mode). `prefers-reduced-motion` zeros the
          // animation via the @media rule in the <style> block below.
          animation: 'qq-ai-bubble-rise 200ms ease-out both',
        }}
        data-testid="button-chat-bubble"
        aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.07)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
        {/* BD-3d Feature 2 — unread badge on the FAB. */}
        {!isOpen && proactiveBadge && (
          <span
            data-testid="chat-proactive-badge"
            aria-label="New message"
            style={{
              position: 'absolute',
              top: 8, right: 8,
              width: 10, height: 10, borderRadius: '50%',
              background: '#ef4444',
              border: '2px solid #fff',
            }}
          />
        )}
      </button>

      <style>{`
        @keyframes ai-dot-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes qq-ai-bubble-rise {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        /* BD-3d Feature 2 — proactive toast entrance. Small slide-up + fade.
           Disabled under prefers-reduced-motion (no bounce). */
        @keyframes qq-ai-proactive-rise {
          from { transform: translateY(8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes qq-ai-bubble-bump {
          0% { transform: scale(1); }
          50% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes qq-ai-bubble-rise {
            from { transform: none; opacity: 1; }
            to { transform: none; opacity: 1; }
          }
          @keyframes qq-ai-proactive-rise {
            from { transform: none; opacity: 1; }
            to { transform: none; opacity: 1; }
          }
          @keyframes qq-ai-bubble-bump {
            0%, 50%, 100% { transform: none; }
          }
        }
      `}</style>
    </>
  );
}

/**
 * BD-3d Feature 2 — proactive toast bubble.
 *
 * Small white speech bubble that sits just above the rescue-mode pill or the
 * full FAB. Tapping the body opens the chat panel directly; tapping the X
 * dismisses + extends the per-variant cooldown to 10 minutes. Auto-hides
 * after 4 seconds (parent owns the timer). prefers-reduced-motion skips the
 * entrance animation.
 */
interface ProactiveToastProps {
  copy: ProactiveCopy;
  accentColor: string;
  /** Distance from the bottom of the viewport for the toast's bottom edge. */
  anchorBottom: number;
  onAccept: () => void;
  onDismiss: () => void;
  reduceMotion: boolean;
}

function ProactiveToast({ copy, accentColor, anchorBottom, onAccept, onDismiss, reduceMotion }: ProactiveToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="chat-proactive-toast"
      data-variant={copy.key}
      style={{
        position: 'fixed',
        right: '24px',
        bottom: `${anchorBottom}px`,
        zIndex: 9998,
        maxWidth: '260px',
        background: '#fff',
        color: '#1a1a1a',
        borderRadius: '14px 14px 4px 14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        padding: '10px 30px 10px 14px',
        fontSize: '13px',
        lineHeight: 1.4,
        borderLeft: `3px solid ${accentColor}`,
        cursor: 'pointer',
        animation: reduceMotion ? 'none' : 'qq-ai-proactive-rise 180ms ease-out both',
      }}
      onClick={onAccept}
    >
      {copy.text}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        aria-label="Dismiss"
        data-testid="chat-proactive-dismiss"
        style={{
          position: 'absolute',
          top: '4px', right: '4px',
          width: '22px', height: '22px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          color: '#9ca3af',
          cursor: 'pointer',
          borderRadius: '50%',
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}
