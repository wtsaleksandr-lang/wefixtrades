import { Check } from "lucide-react";
import { mkt, shadows } from "@/theme/tokens";

interface CapabilitiesGridProps {
  items: string[];
  heading?: string;
  sectionId?: string;
}

/**
 * Richer "What you get" grid replacing flat bullet lists.
 * Uses surface cards with check icons, matching homepage card patterns.
 */
export default function CapabilitiesGrid({ items, heading, sectionId }: CapabilitiesGridProps) {
  return (
    <section
      id={sectionId}
      style={{ background: mkt.sectionLight, padding: "72px 28px" }}
      data-testid="product-capabilities"
    >
      <div
        style={{ maxWidth: 900, margin: "0 auto" }}
        data-reveal="fade-up"
      >
        <div style={{ textAlign: "center", marginBottom: 40 }}>
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
            What&rsquo;s included
          </div>
          <h2
            style={{
              fontSize: "clamp(24px, 3vw, 36px)",
              fontWeight: 700,
              color: mkt.text,
              letterSpacing: "-0.025em",
              margin: 0,
            }}
          >
            {heading || "Everything you need"}
          </h2>
        </div>

        <style>{`
          .cap-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 12px;
          }
          .cap-card {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 16px 18px;
            background: ${mkt.surface};
            border: 1px solid ${mkt.border};
            border-radius: 14px;
            transition: border-color 0.2s ease, transform 0.2s ease;
          }
          .cap-card:hover {
            border-color: rgba(102,232,250,0.18);
            transform: translateY(-1px);
          }
        `}</style>

        <div className="cap-grid">
          {items.map((item, i) => (
            <div
              key={item}
              className="cap-card"
              data-reveal="fade-up"
              data-delay={String((i % 3) * 80)}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: mkt.accentTint,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Check
                  size={14}
                  color={mkt.accent}
                  strokeWidth={2.5}
                />
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: mkt.textMuted,
                  lineHeight: 1.55,
                }}
              >
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
