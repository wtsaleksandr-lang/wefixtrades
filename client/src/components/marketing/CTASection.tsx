import { Link } from "wouter";

const DARK = "#0d1514";
const CYAN = "#00D4C8";

interface CTASectionProps {
  heading?: string;
  subtext?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export default function CTASection({ heading, subtext, ctaLabel, ctaHref }: CTASectionProps = {}) {
  return (
    <>
      <style>{`
        .cta-inner-wrap {
          background: ${CYAN};
          border-radius: 20px;
          border: 2px solid transparent;
          padding: 40px 40px 0 40px;
          max-width: 900px;
          margin: 0 auto;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }
        .cta-inner-wrap:hover {
          border-color: rgba(0,0,0,0.45);
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        }
        .cta-btn-text {
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .cta-inner-wrap:hover .cta-btn-text {
          transform: translateX(8px);
        }
        .cta-btn-arrow {
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .cta-inner-wrap:hover .cta-btn-arrow {
          transform: translateX(-8px);
        }
        .arrow-track {
          display: flex;
          width: 200%;
          transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .cta-inner-wrap:hover .arrow-track {
          transform: translateX(-52px);
        }
      `}</style>

      <section
        data-testid="cta-section"
        style={{
          background: DARK,
          borderRadius: "28px 28px 0 0",
          marginTop: -28,
          position: "relative",
          zIndex: 10,
          padding: "clamp(48px, 8vw, 80px) clamp(16px, 5vw, 40px)",
        }}
      >
        <Link href={ctaHref ?? "/demo"} style={{ textDecoration: "none", display: "block" }}>
          <div className="cta-inner-wrap">
            {/* Content */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{
                fontSize: "clamp(28px, 3.5vw, 36px)",
                fontWeight: 800,
                color: DARK,
                lineHeight: 1.15,
                letterSpacing: "-0.025em",
                maxWidth: "14ch",
                marginBottom: 14,
              }}>
                {heading ?? "Ready to grow your trades business?"}
              </h2>
              <p style={{
                fontSize: 14,
                color: "rgba(13,21,20,0.65)",
                maxWidth: 360,
                lineHeight: 1.6,
                margin: 0,
              }}>
                {subtext ?? "Book a demo and see how WeFixTrades helps you win more jobs, get paid faster, and grow without the admin overhead."}
              </p>
            </div>

            {/* Button row */}
            <div style={{
              margin: "0 -40px",
              background: "rgba(0,0,0,0.12)",
              borderTop: "1.5px solid rgba(0,0,0,0.12)",
              padding: "20px 24px",
              display: "flex",
              alignItems: "center",
              borderRadius: "0 0 18px 18px",
            }}>
              <span className="cta-btn-text" style={{
                flex: 1,
                fontSize: 16,
                fontWeight: 600,
                color: DARK,
              }}>
                {ctaLabel ?? "Book a Free Demo"}
              </span>
              <div className="cta-btn-arrow" style={{
                width: 52,
                height: 52,
                background: DARK,
                borderRadius: 10,
                overflow: "hidden",
                flexShrink: 0,
                position: "relative",
              }}>
                {/* Conveyor belt: two arrows side by side, each exactly 52px wide */}
                <div className="arrow-track" style={{ display: "flex", width: 104, height: 52 }}>
                  {[0, 1].map((i) => (
                    <div key={i} style={{
                      width: 52,
                      height: 52,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Link>
      </section>
    </>
  );
}
