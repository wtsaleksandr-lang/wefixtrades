import { useState } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, colors, shadows } from "@/theme/tokens";
import { PhoneOff, DollarSign, TrendingUp, ArrowRight, Zap, Calculator } from "lucide-react";

const DARK = "#0d1514";
const CYAN = "#00D4C8";

function formatCurrencyFull(value: number): string {
  return `$${value.toLocaleString()}`;
}

export default function MissedCallCalculator() {
  const [missedCalls, setMissedCalls] = useState(10);
  const [closeRate, setCloseRate] = useState(30);
  const [avgJobValue, setAvgJobValue] = useState(500);

  const lostJobsPerWeek = missedCalls * (closeRate / 100);
  const lostRevenueMonth = Math.round(lostJobsPerWeek * avgJobValue * 4.33);
  const lostRevenueYear = Math.round(lostRevenueMonth * 12);
  const recoveredRevenue = Math.round(lostRevenueYear * 0.8);

  return (
    <MarketingLayout>
      <style>{`
        .calc-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: ${mkt.accent};
          cursor: pointer;
          border: 3px solid ${mkt.bg};
          box-shadow: 0 0 0 2px ${mkt.accent}, 0 2px 8px rgba(102,232,250,0.3);
          transition: box-shadow 0.2s ease;
        }
        .calc-slider::-webkit-slider-thumb:hover {
          box-shadow: 0 0 0 2px ${mkt.accentHover}, 0 2px 16px rgba(102,232,250,0.5);
        }
        .calc-slider::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: ${mkt.accent};
          cursor: pointer;
          border: 3px solid ${mkt.bg};
          box-shadow: 0 0 0 2px ${mkt.accent}, 0 2px 8px rgba(102,232,250,0.3);
        }
        .calc-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 3px;
          outline: none;
          cursor: pointer;
        }
        .calc-slider::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 3px;
        }
        .calc-slider::-moz-range-track {
          height: 6px;
          border-radius: 3px;
          background: rgba(255,255,255,0.08);
        }
        .calc-cta-wrap {
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }
        .calc-cta-wrap:hover {
          border-color: rgba(0,0,0,0.45);
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        }
        .calc-cta-text {
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .calc-cta-wrap:hover .calc-cta-text {
          transform: translateX(8px);
        }
        .calc-arrow-track {
          display: flex;
          width: 104px;
          transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .calc-cta-wrap:hover .calc-arrow-track {
          transform: translateX(-52px);
        }
        .calc-crosslink:hover {
          border-color: rgba(255,255,255,0.12) !important;
          background: rgba(255,255,255,0.06) !important;
        }
      `}</style>

      <section style={{
        background: mkt.bg,
        minHeight: "100vh",
        padding: "clamp(100px, 12vw, 140px) clamp(16px, 5vw, 40px) clamp(48px, 8vw, 80px)",
      }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "clamp(32px, 5vw, 48px)" }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 100,
              padding: "6px 16px",
              marginBottom: 20,
            }}>
              <PhoneOff size={14} color="#EF4444" strokeWidth={2} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#EF4444", letterSpacing: "0.02em" }}>
                Revenue Calculator
              </span>
            </div>

            <h1 style={{
              fontSize: "clamp(28px, 5vw, 40px)",
              fontWeight: 700,
              color: colors.effortel.n300,
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
              margin: "0 0 14px",
            }}>
              How much money are you losing from{" "}
              <span style={{ color: "#EF4444" }}>missed calls</span>?
            </h1>

            <p style={{
              fontSize: "clamp(15px, 2vw, 17px)",
              color: mkt.textMuted,
              lineHeight: 1.55,
              margin: "0 auto 10px",
              maxWidth: 480,
            }}>
              Most service businesses lose 20–40% of leads just by not responding instantly.
            </p>
            <p style={{
              fontSize: 14,
              color: mkt.textFaint,
              lineHeight: 1.5,
              margin: 0,
            }}>
              Customers don't wait. They call the next business.
            </p>
          </div>

          {/* Input Card */}
          <div style={{
            background: mkt.cardBg,
            border: `1px solid ${mkt.cardBorder}`,
            borderRadius: 20,
            padding: "clamp(24px, 4vw, 36px)",
            boxShadow: shadows.card,
            marginBottom: 20,
          }}>
            <SliderInput
              label="Missed calls per week"
              value={missedCalls}
              onChange={setMissedCalls}
              min={1}
              max={50}
              suffix=" calls"
            />
            <SliderInput
              label="Close rate"
              value={closeRate}
              onChange={setCloseRate}
              min={5}
              max={80}
              step={5}
              suffix="%"
            />
            <SliderInput
              label="Average job value"
              value={avgJobValue}
              onChange={setAvgJobValue}
              min={50}
              max={5000}
              step={50}
              prefix="$"
              isLast
            />
          </div>

          {/* Results */}
          <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <ResultCard
                label="Lost per month"
                value={formatCurrencyFull(lostRevenueMonth)}
                icon={<DollarSign size={18} />}
                color="#EF4444"
                colorTint="rgba(239,68,68,0.12)"
              />
              <ResultCard
                label="Lost per year"
                value={formatCurrencyFull(lostRevenueYear)}
                icon={<TrendingUp size={18} />}
                color="#EF4444"
                colorTint="rgba(239,68,68,0.12)"
                bold
              />
            </div>

            {/* Recovered Revenue */}
            <div style={{
              background: "rgba(102,232,250,0.06)",
              border: "1px solid rgba(102,232,250,0.15)",
              borderRadius: 16,
              padding: "clamp(20px, 3vw, 28px)",
              textAlign: "center",
            }}>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 8,
              }}>
                <Zap size={14} color={mkt.accent} strokeWidth={2} />
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: mkt.accent,
                  letterSpacing: "0.02em",
                }}>
                  Recoverable with instant response
                </span>
              </div>
              <div style={{
                fontSize: "clamp(32px, 6vw, 44px)",
                fontWeight: 700,
                color: colors.effortel.n100,
                letterSpacing: "-0.025em",
                lineHeight: 1.1,
                marginBottom: 4,
              }}>
                {formatCurrencyFull(recoveredRevenue)}
                <span style={{ fontSize: "0.5em", color: mkt.textMuted, fontWeight: 500 }}>/yr</span>
              </div>
              <p style={{
                fontSize: 14,
                color: mkt.textMuted,
                margin: 0,
                lineHeight: 1.4,
              }}>
                Based on 80% recovery rate with AI-powered instant response
              </p>
            </div>
          </div>

          {/* CTA */}
          <Link href="/demo" style={{ textDecoration: "none", display: "block", marginBottom: 32 }}>
            <div className="calc-cta-wrap" style={{
              background: CYAN,
              borderRadius: 16,
              border: "2px solid transparent",
              padding: "20px 24px",
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}>
              <div className="calc-cta-text" style={{ flex: 1 }}>
                <div style={{
                  fontSize: "clamp(17px, 2.5vw, 20px)",
                  fontWeight: 700,
                  color: DARK,
                  lineHeight: 1.2,
                  marginBottom: 4,
                }}>
                  Stop missing leads
                </div>
                <div style={{
                  fontSize: 14,
                  color: "rgba(13,21,20,0.6)",
                  fontWeight: 500,
                }}>
                  Get your AI assistant today
                </div>
              </div>
              <div style={{
                width: 52,
                height: 52,
                background: DARK,
                borderRadius: 10,
                overflow: "hidden",
                flexShrink: 0,
              }}>
                <div className="calc-arrow-track" style={{ height: 52 }}>
                  {[0, 1].map((i) => (
                    <div key={i} style={{
                      width: 52,
                      height: 52,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      <ArrowRight size={18} color="white" strokeWidth={2.2} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Link>

          {/* Cross-link */}
          <Link href="/tools/quote-demo" style={{ textDecoration: "none", display: "block" }}>
            <div className="calc-crosslink" style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 20px",
              borderRadius: 14,
              border: `1px solid ${mkt.border}`,
              background: mkt.cardBg,
              cursor: "pointer",
              transition: "border-color 0.2s, background 0.2s",
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: mkt.accentTint,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <Calculator size={18} color={mkt.accent} strokeWidth={1.8} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 650, color: mkt.text }}>
                  Try the Quote Calculator Demo
                </div>
                <div style={{ fontSize: 13, color: mkt.textMuted }}>
                  See how instant quotes work for your trade
                </div>
              </div>
              <ArrowRight size={16} color={mkt.textFaint} />
            </div>
          </Link>

        </div>
      </section>
    </MarketingLayout>
  );
}

/* ─── Slider Input ─── */
function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix = "",
  suffix = "",
  isLast = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  isLast?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ marginBottom: isLast ? 0 : 28 }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: 12,
      }}>
        <label style={{ fontSize: 14, fontWeight: 500, color: mkt.textMuted }}>
          {label}
        </label>
        <span style={{
          fontSize: 20,
          fontWeight: 700,
          color: colors.effortel.n100,
          letterSpacing: "-0.01em",
        }}>
          {prefix}{value.toLocaleString()}{suffix}
        </span>
      </div>
      <input
        type="range"
        className="calc-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, ${mkt.accent} 0%, ${mkt.accent} ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`,
        }}
      />
    </div>
  );
}

/* ─── Result Card ─── */
function ResultCard({
  label,
  value,
  icon,
  color,
  colorTint,
  bold = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  colorTint: string;
  bold?: boolean;
}) {
  return (
    <div style={{
      background: colorTint,
      border: `1px solid ${color}22`,
      borderRadius: 14,
      padding: "clamp(16px, 3vw, 20px)",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 8,
        color,
        opacity: 0.8,
      }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.02em" }}>
          {label}
        </span>
      </div>
      <div style={{
        fontSize: bold ? "clamp(22px, 4vw, 28px)" : "clamp(20px, 3.5vw, 24px)",
        fontWeight: 700,
        color: colors.effortel.n100,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      }}>
        {value}
      </div>
    </div>
  );
}
