import { useState, useRef, useEffect } from "react";

interface InfoTooltipProps {
  text: string;
  title?: string;
  /** "dark" for dark-bg pages (default), "light" for light-bg pages like the audit report */
  theme?: "dark" | "light";
}

/**
 * Reusable "?" info tooltip with blur-background overlay.
 * On desktop: positioned tooltip above trigger.
 * On mobile (<480px): centered modal with visible close button.
 *
 * Design matches the premium SaaS pattern from ReportView.
 */
export default function InfoTooltip({ text, title, theme = "dark" }: InfoTooltipProps) {
  const isLight = theme === "light";
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 480);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!show) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [show]);

  // Lock body scroll when modal open on mobile
  useEffect(() => {
    if (show && isMobile) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [show, isMobile]);

  return (
    <span
      ref={ref}
      style={{
        position: "relative",
        display: "inline-block",
        verticalAlign: "middle",
      }}
    >
      {/* Trigger */}
      <span
        role="button"
        aria-label="More info"
        tabIndex={0}
        onClick={() => setShow((s) => !s)}
        onMouseEnter={() => { if (!isMobile) setShow(true); }}
        onMouseLeave={() => { if (!isMobile) setShow(false); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShow((s) => !s); } }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: isLight ? "#E5E7EB" : "rgba(255,255,255,0.10)",
          color: isLight ? "#6B7280" : "rgba(255,255,255,0.5)",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          marginLeft: 6,
          userSelect: "none",
          flexShrink: 0,
          transition: "background 0.15s ease",
          border: "none",
          lineHeight: 1,
        }}
      >
        ?
      </span>

      {show && (
        <>
          {/* Blur overlay */}
          <div
            onClick={() => setShow(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 98,
              backdropFilter: "blur(3px)",
              WebkitBackdropFilter: "blur(3px)",
              background: "rgba(0,0,0,0.15)",
              pointerEvents: isMobile ? "auto" : "none",
            }}
          />

          {isMobile ? (
            /* Mobile: centered modal */
            <div
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 99,
                width: "min(320px, calc(100vw - 40px))",
                background: "rgba(13,21,20,0.95)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.12)",
                padding: "20px 20px 18px",
                boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
              }}
            >
              {/* Close button */}
              <button
                onClick={() => setShow(false)}
                aria-label="Close"
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.6)",
                  fontSize: 16,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
              {title && (
                <p
                  style={{
                    margin: "0 0 6px",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.95)",
                    lineHeight: 1.3,
                    paddingRight: 28,
                  }}
                >
                  {title}
                </p>
              )}
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.75)",
                  lineHeight: 1.6,
                }}
              >
                {text}
              </p>
            </div>
          ) : (
            /* Desktop: positioned tooltip above trigger */
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 10px)",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 99,
                width: 260,
                background: "rgba(13,21,20,0.92)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                padding: "14px 16px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                pointerEvents: "none",
              }}
            >
              {/* Arrow */}
              <div
                style={{
                  position: "absolute",
                  bottom: -6,
                  left: "50%",
                  transform: "translateX(-50%) rotate(45deg)",
                  width: 10,
                  height: 10,
                  background: "rgba(13,21,20,0.92)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderTop: "none",
                  borderLeft: "none",
                }}
              />
              {title && (
                <p
                  style={{
                    margin: "0 0 4px",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.95)",
                    lineHeight: 1.3,
                  }}
                >
                  {title}
                </p>
              )}
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.9)",
                  lineHeight: 1.55,
                  fontWeight: 400,
                }}
              >
                {text}
              </p>
            </div>
          )}
        </>
      )}
    </span>
  );
}
