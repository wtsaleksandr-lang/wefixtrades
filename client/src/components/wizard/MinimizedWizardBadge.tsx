// IA-1 (2026-05-22) — floating "resume editing" badge.
//
// Pairs with the wizard's Minimize button (EditorTopBar.tsx →
// WizardShell.tsx handleMinimize). When the wizard is minimized we
// stash `{ calculatorId, businessName, token, returnPath, savedAt }`
// in sessionStorage under `qq-wizard-minimized-from`; this component
// reads that and renders a 48×48 brand-blue circle in the bottom-
// right of whichever dashboard it's mounted on. Click → resume editing
// (navigates back to /wizard?token=<token>) AND clears the stash.
//
// Sits just below the AI chat bubble (z-index 9998 vs the chat bubble's
// 9999/10000) so it never occludes ongoing chat.
//
// Per-session only — closing the tab clears sessionStorage which
// clears the badge. Re-renders reactively by polling sessionStorage on
// mount + a custom 'qq-wizard-minimized-change' event (so the minimize
// handler can wake any badge already on screen if needed).
//
// Accessibility:
//   - Real <button>, focus ring, aria-label "Resume editing <name>".
//   - `prefers-reduced-motion` → no fade-in animation.
//   - Mobile: 48×48 stays touch-friendly; positioned 16px from edges
//     so it doesn't collide with iOS home indicator.

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Calculator } from 'lucide-react';

interface MinimizedState {
  calculatorId: number | null;
  businessName: string | null;
  token: string;
  returnPath: string;
  savedAt: number;
}

const STORAGE_KEY = 'qq-wizard-minimized-from';

function readState(): MinimizedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    // Require at least a token — without it we can't resume.
    if (typeof parsed.token !== 'string' || !parsed.token) return null;
    return parsed as MinimizedState;
  } catch {
    return null;
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export default function MinimizedWizardBadge() {
  const [state, setState] = useState<MinimizedState | null>(() => readState());
  const [, navigate] = useLocation();
  const reduceMotion = prefersReducedMotion();

  // Re-read on focus / storage events so multi-tab and same-tab
  // changes both refresh the badge.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = () => setState(readState());
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('qq-wizard-minimized-change', refresh as EventListener);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('qq-wizard-minimized-change', refresh as EventListener);
    };
  }, []);

  if (!state) return null;

  const businessLabel = state.businessName?.trim() || 'your calculator';
  const tooltip = `Resume editing ${businessLabel}`;

  const handleResume = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event('qq-wizard-minimized-change'));
    } catch { /* sessionStorage blocked — fall through to navigate */ }
    navigate(`/wizard?token=${encodeURIComponent(state.token)}`);
  };

  return (
    // The data-theme="dark" wrapper scopes the brand-blue button +
    // white icon — the badge always renders with the same dark
    // chrome regardless of the surrounding page theme (matches the
    // primary CTA pattern used elsewhere). This also satisfies
    // CONTRAST-2's scope-detection rule for the bright icon color.
    <div data-theme="dark" style={{ position: 'fixed', bottom: 88, right: 24, zIndex: 9998 }}>
      <button
        type="button"
        onClick={handleResume}
        aria-label={tooltip}
        title={tooltip}
        data-testid="qq-wizard-minimized-badge"
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#0d3cfc',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 18px rgba(13, 60, 252, 0.32)',
          animation: reduceMotion ? undefined : 'qqBadgeFadeIn 200ms ease-out',
        }}
      >
        <Calculator style={{ width: 20, height: 20 }} aria-hidden="true" />
        <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
          QQ
        </span>
        <style>{`
          @keyframes qqBadgeFadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @media (prefers-reduced-motion: reduce) {
            [data-testid="qq-wizard-minimized-badge"] { animation: none !important; }
          }
        `}</style>
      </button>
    </div>
  );
}
