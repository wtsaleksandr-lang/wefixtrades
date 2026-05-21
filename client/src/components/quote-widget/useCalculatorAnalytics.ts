/**
 * Wave W-BB-4 — client-side conversion tracking for the customer-facing
 * advanced calculator widget.
 *
 * Instruments five lifecycle events that drive the portal "Calculator
 * Analytics" dashboard:
 *
 *   view          — fired 2s after mount (debounced to filter bot crawls)
 *   start         — first time the user interacts with any field
 *   field_change  — debounced 1s per field
 *   submit        — when "Get my quote" is clicked
 *   abandon       — when the page is hidden/closed after start but before submit
 *
 * Events POST to /api/calculator-analytics/event using `navigator.sendBeacon`
 * (or `fetch` with `keepalive`) so they don't block the UI and reliably flush
 * on tab-close. Session id is a random uuid in localStorage so we can
 * compute per-session conversion deltas without tracking PII.
 */
import { useEffect, useRef, useCallback } from 'react';

const SESSION_STORAGE_KEY = 'qq_analytics_session_id';
const ENDPOINT = '/api/calculator-analytics/event';

type EventType = 'view' | 'start' | 'field_change' | 'submit' | 'abandon';

interface VisitorMeta {
  user_agent?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

function randomUuid(): string {
  // crypto.randomUUID is available in all modern browsers; fall back if not.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'qq-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const fresh = randomUuid();
    window.localStorage.setItem(SESSION_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // localStorage can throw in private modes — fall back to a per-mount id.
    return randomUuid();
  }
}

function readVisitorMeta(): VisitorMeta {
  if (typeof window === 'undefined') return {};
  const meta: VisitorMeta = {
    user_agent: window.navigator.userAgent?.slice(0, 400),
    referrer: window.document.referrer?.slice(0, 400) || undefined,
  };
  try {
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get('utm_source');
    const utmMedium = params.get('utm_medium');
    const utmCampaign = params.get('utm_campaign');
    if (utmSource) meta.utm_source = utmSource.slice(0, 120);
    if (utmMedium) meta.utm_medium = utmMedium.slice(0, 120);
    if (utmCampaign) meta.utm_campaign = utmCampaign.slice(0, 120);
  } catch {
    /* ignore */
  }
  return meta;
}

interface EventBody {
  calculator_id: number;
  session_id: string;
  event_type: EventType;
  field_id?: string;
  value_meta?: Record<string, unknown>;
  visitor_meta?: VisitorMeta;
}

function postEvent(body: EventBody): void {
  if (typeof window === 'undefined') return;
  try {
    const payload = JSON.stringify(body);
    // sendBeacon is the right tool for "fire-and-forget on tab close" but
    // every browser ships a slightly different content-type quirk. Use a
    // Blob with explicit type so the server can `req.body` parse it.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      const ok = navigator.sendBeacon(ENDPOINT, blob);
      if (ok) return;
    }
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {
      /* swallow — tracking is best-effort */
    });
  } catch {
    /* swallow */
  }
}

interface UseCalculatorAnalyticsOptions {
  /** Numeric calculator id from the calculators table. Tracking is a no-op
   *  when undefined (preview / unsaved drafts). */
  calculatorId?: number;
  /** Optional override — defaults to true. Disables ALL event firing. */
  enabled?: boolean;
}

interface CalculatorAnalyticsHandle {
  trackStart: () => void;
  trackFieldChange: (fieldId: string, value?: unknown) => void;
  trackSubmit: () => void;
}

/**
 * Returns three callbacks the widget invokes at the right moments. The hook
 * itself handles the mount-debounced view event and the abandon event on
 * page hide / unload.
 */
export function useCalculatorAnalytics(
  opts: UseCalculatorAnalyticsOptions,
): CalculatorAnalyticsHandle {
  const { calculatorId, enabled = true } = opts;
  const active = enabled && typeof calculatorId === 'number' && calculatorId > 0;

  // Track lifecycle phase: 'viewing' (haven't started yet), 'started'
  // (start fired, no submit yet), 'submitted' (terminal — no abandon).
  const phaseRef = useRef<'viewing' | 'started' | 'submitted'>('viewing');
  const sessionIdRef = useRef<string>('');
  const visitorMetaRef = useRef<VisitorMeta>({});
  const fieldChangeTimersRef = useRef<Record<string, number>>({});

  // Session id + visitor meta are stable for the mount.
  if (active && sessionIdRef.current === '') {
    sessionIdRef.current = getSessionId();
    visitorMetaRef.current = readVisitorMeta();
  }

  const fire = useCallback(
    (event_type: EventType, extra: Partial<EventBody> = {}) => {
      if (!active) return;
      postEvent({
        calculator_id: calculatorId as number,
        session_id: sessionIdRef.current,
        event_type,
        visitor_meta: visitorMetaRef.current,
        ...extra,
      });
    },
    [active, calculatorId],
  );

  /* ── 'view' — 2s debounce after mount ── */
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => {
      fire('view');
    }, 2000);
    return () => {
      window.clearTimeout(t);
    };
  }, [active, fire]);

  /* ── 'abandon' — page hide / unload after start but before submit ── */
  useEffect(() => {
    if (!active) return;
    const flushAbandon = () => {
      if (phaseRef.current === 'started') {
        fire('abandon');
        // Mark as submitted so a subsequent visibilitychange doesn't double-fire.
        phaseRef.current = 'submitted';
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushAbandon();
    };
    window.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushAbandon);
    window.addEventListener('beforeunload', flushAbandon);
    return () => {
      window.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushAbandon);
      window.removeEventListener('beforeunload', flushAbandon);
    };
  }, [active, fire]);

  /* Clean up any debounced field-change timers on unmount. */
  useEffect(() => {
    return () => {
      for (const t of Object.values(fieldChangeTimersRef.current)) {
        window.clearTimeout(t);
      }
      fieldChangeTimersRef.current = {};
    };
  }, []);

  const trackStart = useCallback(() => {
    if (!active) return;
    if (phaseRef.current !== 'viewing') return;
    phaseRef.current = 'started';
    fire('start');
  }, [active, fire]);

  const trackFieldChange = useCallback(
    (fieldId: string, value?: unknown) => {
      if (!active) return;
      // start fires implicitly on the first field interaction.
      if (phaseRef.current === 'viewing') {
        phaseRef.current = 'started';
        fire('start');
      }
      const existing = fieldChangeTimersRef.current[fieldId];
      if (existing) window.clearTimeout(existing);
      fieldChangeTimersRef.current[fieldId] = window.setTimeout(() => {
        fire('field_change', {
          field_id: fieldId,
          value_meta:
            value !== undefined
              ? { to: typeof value === 'object' ? JSON.stringify(value).slice(0, 200) : String(value).slice(0, 200) }
              : undefined,
        });
        delete fieldChangeTimersRef.current[fieldId];
      }, 1000);
    },
    [active, fire],
  );

  const trackSubmit = useCallback(() => {
    if (!active) return;
    if (phaseRef.current === 'submitted') return;
    phaseRef.current = 'submitted';
    fire('submit');
  }, [active, fire]);

  return { trackStart, trackFieldChange, trackSubmit };
}
