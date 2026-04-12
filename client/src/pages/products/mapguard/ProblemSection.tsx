import { mkt } from "@/theme/tokens";
import { HEADING_FONT, BODY_FONT, GLASS, sectionHeading, SECTION_PAD, MAX_W } from "./styles";

export default function ProblemSection() {
  return (
    <section style={{ ...SECTION_PAD, background: mkt.bg }}>
      <div style={{ ...MAX_W, maxWidth: 720, textAlign: "center" }}>
        <div data-reveal="fade-up">
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: mkt.accent,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            The problem
          </div>
          <h2 style={{ ...sectionHeading, marginBottom: 24 }}>
            If you're not showing up on Google Maps,{" "}
            <span style={{ color: mkt.accent }}>you're losing jobs.</span>
          </h2>
          <p
            style={{
              fontFamily: BODY_FONT,
              fontSize: 16,
              color: mkt.textMuted,
              lineHeight: 1.7,
              maxWidth: 560,
              margin: "0 auto 32px",
            }}
          >
            When someone searches "plumber near me" or "electrician in [city]",
            they call the first few businesses they see.
            <br /><br />
            If you're not there — you don't exist.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 14,
              marginBottom: 32,
            }}
            className="mg-problem-stats"
          >
            {[
              "have incomplete Google profiles",
              "rank too low to get calls",
              "don't appear in Maps at all",
            ].map((stat) => (
              <div
                key={stat}
                style={{
                  ...GLASS,
                  padding: "18px 14px",
                  textAlign: "center",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 500, color: mkt.textMuted, lineHeight: 1.5 }}>
                  Most trades businesses {stat}
                </span>
              </div>
            ))}
          </div>

          <p
            style={{
              fontFamily: BODY_FONT,
              fontSize: 17,
              fontWeight: 600,
              color: mkt.onDark,
              lineHeight: 1.5,
            }}
          >
            That means your competitors are getting your calls.
          </p>
          <p
            style={{
              fontFamily: BODY_FONT,
              fontSize: 15,
              color: mkt.textMuted,
              lineHeight: 1.6,
              marginTop: 16,
            }}
          >
            Every day your profile stays weak, nearby competitors keep getting the calls that should have gone to you.
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .mg-problem-stats { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
