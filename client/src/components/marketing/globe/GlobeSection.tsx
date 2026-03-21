import { useState, useEffect } from "react";
import { Link } from "wouter";
import { mkt, typography } from "@/theme/tokens";
import { GLOBE_MARKERS, CARD_SLOTS } from "./globeData";
import GlobeCanvas from "./GlobeCanvas";
import GlobeCard from "./GlobeCard";

const CYCLE_INTERVAL = 4000; // ms between card rotations
const VISIBLE_CARDS = 3;

export default function GlobeSection() {
  // activeStart tracks which marker index the first visible slot shows.
  // Cards cycle through markers: [activeStart, activeStart+1, activeStart+2].
  const [activeStart, setActiveStart] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStart((prev) => (prev + 1) % GLOBE_MARKERS.length);
    }, CYCLE_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // Determine which 3 markers are currently visible
  const visibleIndices = Array.from({ length: VISIBLE_CARDS }, (_, i) =>
    (activeStart + i) % GLOBE_MARKERS.length,
  );

  return (
    <section
      data-testid="globe-section"
      style={{
        background: mkt.bg,
        padding: "100px 28px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        className="globe-section-inner"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          gap: 48,
        }}
      >
        {/* Left column — text + CTA */}
        <div className="globe-text-col" style={{ flex: "0 0 40%", minWidth: 0 }}>
          <h2
            style={{
              fontSize: "clamp(28px, 3.5vw, 44px)",
              fontWeight: 800,
              color: mkt.text,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              marginBottom: 20,
              fontFamily: typography.fontFamily,
            }}
          >
            Results happening right now
          </h2>

          <p
            style={{
              fontSize: 16,
              lineHeight: 1.65,
              color: mkt.textMuted,
              marginBottom: 40,
              maxWidth: 420,
              fontFamily: typography.fontFamily,
            }}
          >
            Trades businesses across the country are getting more calls, more
            bookings, and better rankings — automatically.
          </p>

          {/* Quick stats */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 40 }}>
            {[
              { value: "2,400+", text: "quotes generated this month" },
              { value: "96%", text: "of calls answered by AI" },
              { value: "4.8★", text: "average review score" },
            ].map(({ value, text }) => (
              <div key={text} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: mkt.accent,
                    fontFamily: typography.fontFamily,
                  }}
                >
                  {value}
                </span>
                <span
                  style={{
                    fontSize: 14,
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
            className="cta-arrow-btn cta-arrow-btn--primary"
            style={{ textDecoration: "none", display: "inline-flex" }}
          >
            <span className="cta-arrow-btn__text">See what we can do for you</span>
            <span className="cta-arrow-btn__square" />
            <span className="cta-arrow-btn__arrow-out">
              <svg width="13" height="13" viewBox="0 0 31 31" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd" d="M18.9493 17.8324L3.43262 17.8324L3.43262 12.2443L18.9493 12.2443L11.2915 4.5865L15.2429 0.63509L26.4851 11.8772C28.2309 13.6231 28.2309 16.4536 26.4851 18.1995L15.1423 29.5425L11.1909 25.5911L18.9493 17.8324Z" />
              </svg>
            </span>
            <span className="cta-arrow-btn__arrow-in">
              <svg width="13" height="13" viewBox="0 0 31 31" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd" d="M18.9493 17.8324L3.43262 17.8324L3.43262 12.2443L18.9493 12.2443L11.2915 4.5865L15.2429 0.63509L26.4851 11.8772C28.2309 13.6231 28.2309 16.4536 26.4851 18.1995L15.1423 29.5425L11.1909 25.5911L18.9493 17.8324Z" />
              </svg>
            </span>
          </Link>
        </div>

        {/* Right column — globe + overlay cards */}
        <div
          className="globe-visual-col"
          style={{
            flex: "1 1 60%",
            position: "relative",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 480,
          }}
        >
          {/* Ambient glow behind globe */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "120%",
              height: "120%",
              background: "radial-gradient(circle, rgba(102,232,250,0.06) 0%, transparent 65%)",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />

          <GlobeCanvas markers={GLOBE_MARKERS} size={480} />

          {/* Floating result cards */}
          {CARD_SLOTS.map((slot, slotIdx) => {
            const markerIdx = visibleIndices[slotIdx];
            const marker = GLOBE_MARKERS[markerIdx];
            const pos: Record<string, string | undefined> = {
              top: slot.top,
              bottom: slot.bottom,
              right: slot.right,
            };
            return (
              <GlobeCard
                key={`slot-${slotIdx}`}
                stat={marker.stat}
                label={marker.label}
                visible={true}
                style={pos}
              />
            );
          })}
        </div>
      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 900px) {
          .globe-section-inner {
            flex-direction: column !important;
            text-align: center;
          }
          .globe-text-col {
            flex: none !important;
            max-width: 500px;
            margin: 0 auto;
          }
          .globe-text-col p {
            margin-left: auto;
            margin-right: auto;
          }
          .globe-visual-col {
            flex: none !important;
            width: 100%;
            min-height: 340px !important;
            max-width: 400px;
            margin: 0 auto;
          }
        }
        @media (max-width: 640px) {
          .globe-visual-col {
            min-height: 300px !important;
            max-width: 320px;
          }
        }
      `}</style>
    </section>
  );
}
