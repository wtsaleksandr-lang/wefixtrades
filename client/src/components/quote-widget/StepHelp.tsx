import { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { eff } from './designTokens';
import type { StepHelp as StepHelpType } from '@shared/wizardSchema';

interface StepHelpProps {
  help: StepHelpType;
}

/**
 * Contextual help panel for a wizard step.
 *
 * Desktop: popover anchored to the help icon.
 * Mobile (<640px): bottom sheet overlay.
 *
 * Renders only when the current step has help content.
 */
export default function StepHelp({ help }: StepHelpProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Help"
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          border: 'none',
          background: open ? eff.bg : 'transparent',
          cursor: 'pointer',
          transition: 'background 0.15s, color 0.15s',
          color: open ? eff.text : eff.textBody,
          padding: 0,
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = eff.bg;
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = 'transparent';
        }}
      >
        <HelpCircle style={{ width: 18, height: 18 }} />
      </button>

      {/* Panel */}
      {open && (
        <>
          {/* Mobile overlay backdrop */}
          <div
            className="eff-help-backdrop"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.2)',
              zIndex: 99,
              display: 'none',
            }}
            onClick={() => setOpen(false)}
          />

          <div
            ref={panelRef}
            className="eff-help-panel"
            style={{
              // Desktop: popover
              position: 'absolute',
              top: '40px',
              right: 0,
              zIndex: 100,
              width: '296px',
              background: '#fff',
              borderRadius: eff.radiusLg,
              border: `1px solid ${eff.buttonBorder}`,
              boxShadow: '0 12px 40px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.04)',
              overflow: 'hidden',
              fontFamily: eff.font,
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 16px 12px',
              borderBottom: `1px solid ${eff.buttonBorder}`,
            }}>
              <span style={{
                fontSize: '13px',
                fontWeight: 700,
                color: eff.text,
                letterSpacing: '0.02em',
              }}>
                {help.title || 'Help'}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close help"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: eff.textBody,
                  padding: 0,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = eff.bg; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            {/* Q&A Items */}
            <div style={{ padding: '8px 0' }}>
              {help.items.map((item, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 16px',
                  }}
                >
                  <p style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: eff.text,
                    margin: 0,
                    lineHeight: 1.4,
                  }}>
                    {item.question}
                  </p>
                  <p style={{
                    fontSize: '13px',
                    color: eff.textBody,
                    margin: '4px 0 0',
                    lineHeight: 1.5,
                  }}>
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Responsive overrides via inline <style> */}
          <style>{`
            @media (max-width: 639px) {
              .eff-help-backdrop { display: block !important; }
              .eff-help-panel {
                position: fixed !important;
                top: auto !important;
                right: 0 !important;
                bottom: 0 !important;
                left: 0 !important;
                width: 100% !important;
                max-height: 70vh !important;
                border-radius: ${eff.radiusXl} ${eff.radiusXl} 0 0 !important;
                border: none !important;
                box-shadow: 0 -8px 40px rgba(0,0,0,0.12) !important;
                overflow-y: auto !important;
              }
            }
          `}</style>
        </>
      )}
    </div>
  );
}
