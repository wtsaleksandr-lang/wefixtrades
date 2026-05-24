import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { mkt, typography } from "@/theme/tokens";
import { GLOBE_MARKERS } from "./globeData";
import GlobeCanvas from "./GlobeCanvas";

const CYCLE_INTERVAL = 4000;

export default function GlobeSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCycle = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => {
        let next: number;
        do {
          next = Math.floor(Math.random() * GLOBE_MARKERS.length);
        } while (next === prev && GLOBE_MARKERS.length > 1);
        return next;
      });
    }, CYCLE_INTERVAL);
  }, []);

  useEffect(() => {
    startCycle();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCycle]);

  const handleMarkerClick = useCallback(
    (index: number) => {
      setActiveIndex(index);
      startCycle();
    },
    [startCycle],
  );

  return (
    <section
      data-testid="globe-section"
      style={{
        background: mkt.darkBg,
        position: "relative",
        overflow: "hidden",
        paddingBottom: 0,
        borderRadius: "28px 28px 0 0",
        marginTop: -28,
        zIndex: 5,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        className="globe-header"
        style={{
          textAlign: "center",
          /* compression: top header padding trimmed (was 48-100). */
          padding: "clamp(36px, 5vw, 64px) clamp(16px, 4vw, 28px) 0",
          maxWidth: 800,
          margin: "0 auto",
          position: "relative",
          zIndex: 10,
        }}
      >
        <h2
          style={{
            fontSize: "clamp(32px, 4vw, 52px)",
            fontWeight: 800,
            color: mkt.text,
            lineHeight: 1.08,
            letterSpacing: "-0.03em",
            marginBottom: 16,
            fontFamily: typography.fontFamily,
          }}
        >
          Results happening right now
        </h2>

        <p
          style={{
            fontSize: "clamp(15px, 1.2vw, 18px)",
            lineHeight: 1.65,
            color: mkt.textMuted,
            marginBottom: 0,
            maxWidth: 560,
            margin: "0 auto",
            fontFamily: typography.fontFamily,
          }}
        >
          Trades businesses across the country are getting more calls, more
          bookings, and better rankings &mdash; automatically.
        </p>
      </div>

      {/* ── Globe viewport ─────────────────────────────────────────── */}
      <div
        className="globe-viewport"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 1200,
          margin: "0 auto",
          overflow: "hidden",
          height: 560,
        }}
      >
        {/* Globe container — centered */}
        <div
          className="globe-center"
          style={{
            position: "absolute",
            left: "50%",
            top: -60,
            transform: "translateX(-50%)",
          }}
        >
          <GlobeCanvas
            markers={GLOBE_MARKERS}
            size={900}
            activeMarkerIndex={activeIndex}
            onMarkerClick={handleMarkerClick}
          />
        </div>

        {/* Bottom fade */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "30%",
            background: `linear-gradient(to top, ${mkt.darkBg} 0%, ${mkt.darkBg}cc 25%, transparent 100%)`,
            pointerEvents: "none",
            zIndex: 5,
          }}
        />

      </div>

      {/* ── Bottom stats + CTA ─────────────────────────────────────── */}
      <div
        className="globe-cta-section"
        style={{
          textAlign: "center",
          /* compression: bottom padding trimmed (was 48-80). */
          padding: "24px clamp(16px, 4vw, 28px) clamp(32px, 5vw, 56px)",
        }}
      >
        <div
          className="globe-stats-row"
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "clamp(24px, 4vw, 56px)",
            marginBottom: 36,
            flexWrap: "wrap",
          }}
        >
          {[
            { value: "96%", text: "calls answered by AI" },
            { value: "4.8\u2605", text: "avg review score" },
            { value: "3x", text: "more leads in 30 days" },
          ].map(({ value, text }) => (
            <div
              key={text}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: "clamp(20px, 2vw, 28px)",
                  fontWeight: 800,
                  color: mkt.accent,
                  fontFamily: typography.fontFamily,
                }}
              >
                {value}
              </span>
              <span
                style={{
                  fontSize: "clamp(11px, 1vw, 14px)",
                  fontWeight: 500,
                  color: mkt.textMuted,
                }}
              >
                {text}
              </span>
            </div>
          ))}
        </div>

        <Link
          href="/Wizard"
          className="mkt-btn-primary"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            height: 48,
            padding: "0 32px",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
            textTransform: "uppercase" as const,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap" as const,
          }}
        >
          See what we can do for you
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {/* ── Responsive CSS ─────────────────────────────────────────── */}
      <style>{`
        .globe-viewport canvas {
          display: block;
          margin: 0 auto;
        }
        @media (max-width: 900px) {
          .globe-viewport {
            height: 480px !important;
          }
          .globe-center {
            top: -120px !important;
          }
        }
        @media (max-width: 640px) {
          .globe-viewport {
            height: 400px !important;
          }
          .globe-center {
            top: -160px !important;
          }
          .globe-stats-row {
            gap: 20px !important;
          }
        }
      `}</style>
    </section>
  );
}
