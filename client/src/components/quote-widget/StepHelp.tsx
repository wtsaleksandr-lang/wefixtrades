import { useState, useRef, useEffect, useCallback } from 'react';
import { HelpCircle, X, ArrowRight } from 'lucide-react';
import { eff } from './designTokens';
import type { StepHelp as StepHelpType } from '@shared/wizardSchema';

interface StepHelpProps {
  help: StepHelpType;
}

/**
 * Contextual help panel for a wizard step.
 *
 * Desktop: animated popover anchored to the help icon.
 * Mobile (<640px): bottom sheet with backdrop.
 */
export default function StepHelp({ help }: StepHelpProps) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Animate open: mount → next frame set visible for CSS transition
  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    } else {
      setVisible(false);
    }
  }, [open]);

  const close = useCallback(() => {
    setVisible(false);
    // Wait for animation to finish before unmounting
    setTimeout(() => setOpen(false), 180);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, close]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, close]);

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? close() : setOpen(true)}
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
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = eff.bg; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        <HelpCircle style={{ width: 18, height: 18 }} />
      </button>

      {/* Panel + backdrop */}
      {open && (
        <>
          {/* Backdrop (mobile only via CSS) */}
          <div
            className="eff-help-backdrop"
            onClick={close}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(34,40,42,0.25)',
              zIndex: 99,
              display: 'none',
              opacity: visible ? 1 : 0,
              transition: 'opacity 0.18s ease',
            }}
          />

          {/* Panel */}
          <div
            ref={panelRef}
            className="eff-help-panel"
            style={{
              position: 'absolute',
              top: '40px',
              right: 0,
              zIndex: 100,
              width: '304px',
              background: '#fff',
              borderRadius: eff.radiusLg,
              border: `1px solid ${eff.buttonBorder}`,
              boxShadow: '0 16px 48px rgba(0,0,0,0.10), 0 4px 16px rgba(0,0,0,0.04)',
              fontFamily: eff.font,
              // Animation
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0) scale(1)' : 'translateY(-4px) scale(0.98)',
              transition: 'opacity 0.18s ease, transform 0.18s ease',
              transformOrigin: 'top right',
            }}
          >
            {/* Mobile drag handle (visible only on mobile via CSS) */}
            <div
              className="eff-help-handle"
              style={{
                display: 'none',
                justifyContent: 'center',
                padding: '10px 0 2px',
              }}
            >
              <div style={{
                width: '32px',
                height: '4px',
                borderRadius: '2px',
                background: eff.buttonBorder,
              }} />
            </div>

            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px 12px',
              borderBottom: `1px solid ${eff.buttonBorder}`,
            }}>
              <span style={{
                fontSize: '14px',
                fontWeight: 700,
                color: eff.text,
              }}>
                {help.title || 'Help'}
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Close help"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: eff.textBody,
                  padding: 0,
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = eff.bg; e.currentTarget.style.color = eff.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = eff.textBody; }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            {/* Q&A Items */}
            <div style={{ padding: '4px 0' }}>
              {help.items.map((item, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px 20px',
                    borderBottom: i < help.items.length - 1 ? `1px solid ${eff.bg}` : 'none',
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
                    lineHeight: 1.55,
                  }}>
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>

            {/* Soft upsell CTA */}
            {help.cta && (
              <div style={{
                padding: '12px 20px 16px',
                borderTop: `1px solid ${eff.buttonBorder}`,
              }}>
                <p style={{
                  fontSize: '12px',
                  color: eff.textBody,
                  margin: 0,
                  lineHeight: 1.5,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                }}>
                  <ArrowRight style={{ width: 12, height: 12, flexShrink: 0, marginTop: '2px', color: eff.accent }} />
                  <span>{help.cta}</span>
                </p>
              </div>
            )}
          </div>

          {/* Responsive overrides */}
          <style>{`
            @media (max-width: 639px) {
              .eff-help-backdrop { display: block !important; }
              .eff-help-handle { display: flex !important; }
              .eff-help-panel {
                position: fixed !important;
                top: auto !important;
                right: 0 !important;
                bottom: 0 !important;
                left: 0 !important;
                width: 100% !important;
                max-height: 75vh !important;
                border-radius: ${eff.radiusXl} ${eff.radiusXl} 0 0 !important;
                border: none !important;
                border-top: 1px solid ${eff.buttonBorder} !important;
                box-shadow: 0 -12px 48px rgba(0,0,0,0.12) !important;
                overflow-y: auto !important;
                transform-origin: bottom center !important;
                transform: ${visible ? 'translateY(0)' : 'translateY(16px)'} !important;
              }
            }
          `}</style>
        </>
      )}
    </div>
  );
}
