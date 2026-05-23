import { useState, useRef, useEffect, useCallback } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { eff } from './designTokens';

/**
 * Lightweight inline help tooltip. Shows a small "?" icon that
 * reveals an explanation on click. Auto-closes on outside click
 * or Escape. Designed for non-technical trade users who may not
 * understand a label or concept.
 *
 * Usage:
 *   <HelpTip text="Email is enough. Phone is optional but helps us reach you faster." />
 */
export default function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <span ref={ref} data-theme="light" style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle', marginLeft: '4px' }}>
      <button
        type="button"
        onClick={() => {
          setOpen(o => !o);
          // BD-2c — any explicit Help click reveals the AI chat bubble in
          // 'rescue' visibility mode. Listener lives in AIChatBubble.tsx.
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('quotequick:help'));
          }
        }}
        aria-label="More info"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '16px', height: '16px', borderRadius: '50%',
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: eff.textBody, padding: 0, opacity: 0.5,
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; }}
      >
        <HelpCircle style={{ width: 13, height: 13 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: '6px', width: '220px', padding: '10px 12px',
          borderRadius: eff.radiusMd, background: eff.text, color: '#fff',
          fontSize: '12px', lineHeight: 1.5, fontWeight: 400, fontFamily: eff.font,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          zIndex: 50,
        }}>
          {text}
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent', borderTop: `6px solid ${eff.text}`,
          }} />
        </div>
      )}
    </span>
  );
}
