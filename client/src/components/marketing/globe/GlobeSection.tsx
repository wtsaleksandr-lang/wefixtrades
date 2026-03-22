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

  const activeMarker =
    activeIndex >= 0 && activeIndex < GLOBE_MARKERS.length
      ? GLOBE_MARKERS[activeIndex]
      : null;

  return (
    <section
      data-testid="globe-section"
      style={{
        background: mkt.bg,
        position: "relative",
        overflow: "hidden",
        paddingBottom: 0,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        className="globe-header"
        style={{
          textAlign: "center",
          padding: "clamp(48px, 8vw, 100px) clamp(16px, 4vw, 28px) 0",
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
          margin: "-8px auto 0",
          overflow: "hidden",
          height: "clamp(380px, 50vw, 620px)",
        }}
      >
        {/* Globe container — pulled up to minimize dead space */}
        <div
          className="globe-center"
          style={{
            position: "absolute",
            left: "50%",
            top: "clamp(-180px, -18vw, -80px)",
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

        {/* ── Stats callout (frosted glass, bottom-left) ─────────── */}
        <div
          className="globe-stats-callout"
          style={{
            position: "absolute",
            bottom: "14%",
            left: "6%",
            border: `1px solid rgba(255,255,255,0.06)`,
            borderRadius: 14,
            padding: "14px 16px",
            width: 155,
            zIndex: 10,
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(24px) saturate(1.2)",
            WebkitBackdropFilter: "blur(24px) saturate(1.2)",
            boxShadow:
              "0 4px 24px rgba(0,0,0,0.15), inset 0 0.5px 0 rgba(255,255,255,0.04)",
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 500,
              color: "rgba(255,255,255,0.8)",
              lineHeight: 1.2,
              marginBottom: 6,
              fontFamily: typography.fontFamily,
              letterSpacing: "-0.01em",
            }}
          >
            2,400+
          </div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.35)",
              lineHeight: 1.4,
              fontWeight: 400,
              fontFamily: typography.fontFamily,
              letterSpacing: "0.01em",
            }}
          >
            Quotes generated this month.{" "}
            <span style={{ color: "rgba(102,232,250,0.6)" }}>+42%</span>
          </div>
        </div>

        {/* ── Active marker card (right side, frosted glass) ────────── */}
        {activeMarker && (
          <div
            className="globe-active-card"
            key={activeMarker.id}
            style={{
              position: "absolute",
              bottom: "18%",
              right: "6%",
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(24px) saturate(1.2)",
              WebkitBackdropFilter: "blur(24px) saturate(1.2)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14,
              padding: "14px 16px",
              width: 170,
              boxShadow:
                "0 4px 24px rgba(0,0,0,0.15), inset 0 0.5px 0 rgba(255,255,255,0.04)",
              zIndex: 10,
              animation: "globeCardIn 0.4s ease both",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 400,
                color: "rgba(255,255,255,0.75)",
                lineHeight: 1.35,
                marginBottom: 5,
                letterSpacing: "0.01em",
              }}
            >
              {activeMarker.stat}
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 400,
                color: "rgba(255,255,255,0.3)",
                lineHeight: 1.3,
                letterSpacing: "0.02em",
              }}
            >
              {activeMarker.label}
            </div>
          </div>
        )}

        {/* Bottom fade */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "30%",
            background: `linear-gradient(to top, ${mkt.bg} 0%, ${mkt.bg}cc 25%, transparent 100%)`,
            pointerEvents: "none",
            zIndex: 5,
          }}
        />

        {/* Subtle ambient glow behind globe */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "40%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "80%",
            height: "80%",
            background:
              "radial-gradient(circle, rgba(102,232,250,0.05) 0%, transparent 65%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      </div>

      {/* ── Bottom stats + CTA ─────────────────────────────────────── */}
      <div
        className="globe-cta-section"
        style={{
          textAlign: "center",
          padding: "32px clamp(16px, 4vw, 28px) clamp(48px, 8vw, 80px)",
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

        <div className="globe-cta-wrap">
          <Link
            href="/Wizard"
            className="cta-arrow-btn cta-arrow-btn--primary"
            style={{ textDecoration: "none", display: "inline-flex" }}
          >
            <span className="cta-arrow-btn__text">
              See what we can do for you
            </span>
            <span className="cta-arrow-btn__square" />
            <span className="cta-arrow-btn__arrow-out">
              <svg
                width="13"
                height="13"
                viewBox="0 0 31 31"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M18.9493 17.8324L3.43262 17.8324L3.43262 12.2443L18.9493 12.2443L11.2915 4.5865L15.2429 0.63509L26.4851 11.8772C28.2309 13.6231 28.2309 16.4536 26.4851 18.1995L15.1423 29.5425L11.1909 25.5911L18.9493 17.8324Z"
                />
              </svg>
            </span>
            <span className="cta-arrow-btn__arrow-in">
              <svg
                width="13"
                height="13"
                viewBox="0 0 31 31"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M18.9493 17.8324L3.43262 17.8324L3.43262 12.2443L18.9493 12.2443L11.2915 4.5865L15.2429 0.63509L26.4851 11.8772C28.2309 13.6231 28.2309 16.4536 26.4851 18.1995L15.1423 29.5425L11.1909 25.5911L18.9493 17.8324Z"
                />
              </svg>
            </span>
          </Link>
        </div>
      </div>

      {/* ── Responsive CSS ─────────────────────────────────────────── */}
      <style>{`
        @keyframes globeCardIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .globe-viewport canvas {
          display: block;
          margin: 0 auto;
        }
        @media (max-width: 900px) {
          .globe-viewport {
            height: clamp(340px, 70vw, 500px) !important;
          }
          .globe-stats-callout {
            bottom: 8% !important;
            left: 4% !important;
            width: 135px !important;
            padding: 10px 12px !important;
            border-radius: 12px !important;
          }
          .globe-stats-callout > div:first-child {
            font-size: 17px !important;
          }
          .globe-stats-callout > div:last-child {
            font-size: 9.5px !important;
          }
          .globe-active-card {
            right: 4% !important;
            bottom: 12% !important;
            width: 150px !important;
            padding: 10px 12px !important;
            border-radius: 12px !important;
          }
          .globe-active-card > div:first-child {
            font-size: 11px !important;
          }
          .globe-active-card > div:last-child {
            font-size: 9.5px !important;
          }
          .globe-cta-wrap .cta-arrow-btn {
            width: 100% !important;
            max-width: 340px;
            justify-content: center;
          }
        }
        @media (max-width: 640px) {
          .globe-viewport {
            height: clamp(300px, 80vw, 400px) !important;
          }
          .globe-stats-callout {
            display: none !important;
          }
          .globe-active-card {
            right: auto !important;
            left: 50% !important;
            transform: translateX(-50%);
            bottom: 6% !important;
            width: 155px !important;
          }
          .globe-stats-row {
            gap: 20px !important;
          }
        }
      `}</style>
    </section>
  );
}
