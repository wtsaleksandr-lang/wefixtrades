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
      startCycle(); // reset timer so it doesn't immediately switch
    },
    [startCycle],
  );

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
      {/* Centered header text */}
      <div
        className="globe-header"
        style={{
          textAlign: "center",
          padding: "clamp(48px, 8vw, 100px) clamp(16px, 4vw, 28px) 0",
          maxWidth: 800,
          margin: "0 auto",
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
          bookings, and better rankings — automatically.
        </p>
      </div>

      {/* Globe viewport — oversized globe, cropped at bottom */}
      <div
        className="globe-viewport"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 1200,
          margin: "40px auto 0",
          overflow: "hidden",
          /* Show only top ~55% of the globe */
          height: "clamp(340px, 42vw, 520px)",
        }}
      >
        {/* Globe container — centered, extends below viewport */}
        <div
          className="globe-center"
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            width: "100%",
          }}
        >
          <GlobeCanvas
            markers={GLOBE_MARKERS}
            size={900}
            activeMarkerIndex={activeIndex}
            onMarkerClick={handleMarkerClick}
          />
        </div>

        {/* Bottom fade — blends globe into section background */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "35%",
            background: `linear-gradient(to top, ${mkt.bg} 0%, ${mkt.bg}cc 30%, transparent 100%)`,
            pointerEvents: "none",
            zIndex: 5,
          }}
        />

        {/* Subtle ambient glow */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "120%",
            height: "120%",
            background:
              "radial-gradient(circle, rgba(102,232,250,0.06) 0%, transparent 65%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      </div>

      {/* CTA below globe */}
      <div
        className="globe-cta-section"
        style={{
          textAlign: "center",
          padding: "32px clamp(16px, 4vw, 28px) clamp(48px, 8vw, 80px)",
        }}
      >
        {/* Quick stats row */}
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
            { value: "2,400+", text: "quotes generated" },
            { value: "96%", text: "calls answered by AI" },
            { value: "4.8★", text: "avg review score" },
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

      {/* Responsive CSS */}
      <style>{`
        .globe-viewport canvas {
          display: block;
          margin: 0 auto;
        }
        @media (max-width: 900px) {
          .globe-viewport {
            height: clamp(280px, 55vw, 400px) !important;
          }
          .globe-card {
            min-width: 140px !important;
            max-width: 180px !important;
            padding: 8px 12px !important;
          }
          .globe-card .globe-card-stat {
            font-size: 12px !important;
          }
          .globe-card .globe-card-label {
            font-size: 10px !important;
          }
          .globe-cta-wrap .cta-arrow-btn {
            width: 100% !important;
            max-width: 340px;
            justify-content: center;
          }
        }
        @media (max-width: 640px) {
          .globe-viewport {
            height: clamp(220px, 60vw, 300px) !important;
          }
          .globe-card {
            min-width: 120px !important;
            max-width: 160px !important;
            padding: 6px 10px !important;
          }
          .globe-card .globe-card-stat {
            font-size: 11px !important;
          }
          .globe-card .globe-card-label {
            font-size: 9px !important;
          }
          .globe-stats-row {
            gap: 20px !important;
          }
        }
      `}</style>
    </section>
  );
}
