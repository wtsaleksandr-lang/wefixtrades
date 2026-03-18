/**
 * PillarAnimation — Tabbed product showcase with auto-advancing pillar tabs.
 * Pure React + CSS animations. No Rive, no GSAP.
 */
import { useState, useEffect, useRef } from "react";
import {
  MapPinned,
  Calculator,
  Workflow,
  ShieldCheck,
  MapPin,
  Zap,
  Phone,
  Star,
} from "lucide-react";
import Logo from "@/components/primitives/Logo";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Pillar {
  id: string;
  name: string;
  accent: string;
  TabIcon: React.ElementType;
  ContentIcon: React.ElementType;
  title: string;
  pitch: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const PILLARS: Pillar[] = [
  {
    id: "mapguard",
    name: "MapGuard",
    accent: "#9bf7ff",
    TabIcon: MapPinned,
    ContentIcon: MapPin,
    title: "MapGuard™",
    pitch:
      "Your business appears first when local customers search for your trade on Google Maps. We keep you ahead — even when competitors try to take your spot.",
  },
  {
    id: "quickquote",
    name: "QuickQuote",
    accent: "#fee09f",
    TabIcon: Calculator,
    ContentIcon: Zap,
    title: "QuickQuote Pro™",
    pitch:
      "Customers get an instant price the moment they reach out. The lead lands on your phone automatically — with a follow-up sent if they don't respond.",
  },
  {
    id: "tradeline",
    name: "TradeLine",
    accent: "#fbcdcd",
    TabIcon: Workflow,
    ContentIcon: Phone,
    title: "TradeLine™",
    pitch:
      "A 24/7 assistant answers calls, responds to texts, and books jobs — trained on your rates, your area, and your hours. Never miss a job because you were busy.",
  },
  {
    id: "reputationshield",
    name: "ReputationShield",
    accent: "#e3ffd1",
    TabIcon: ShieldCheck,
    ContentIcon: Star,
    title: "ReputationShield™",
    pitch:
      "After every completed job, your customer gets a friendly message asking for a review. Your Google rating grows while you focus on the work.",
  },
];

const INTERVAL_MS = 5000;

// ─── Injected CSS ─────────────────────────────────────────────────────────────

const PILLAR_CSS = `
  @keyframes pillar-progress {
    from { width: 0%; }
    to   { width: 100%; }
  }
  @keyframes pillar-content-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .pillar-tabs-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }

  .pillar-tab {
    border-radius: 14px;
    padding: 16px;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 80px;
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
  }

  .pillar-tab-icon-wrap {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.3s ease;
  }

  .pillar-tab-name {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #22282a;
    font-family: 'Satoshi', sans-serif;
    line-height: 1.2;
  }

  .pillar-progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    border-radius: 0 3px 3px 0;
    animation: pillar-progress 5s linear forwards;
  }

  .pillar-headline {
    font-size: 22px;
    font-weight: 800;
    color: #22282a;
    letter-spacing: -0.02em;
    margin: 16px 0 0;
    line-height: 1.25;
    font-family: 'Satoshi', sans-serif;
  }

  .pillar-subtext {
    font-size: 14px;
    color: rgba(34, 40, 42, 0.65);
    line-height: 1.6;
    margin: 10px 0 0;
    font-family: 'Satoshi', sans-serif;
  }

  .pillar-content-anim {
    display: flex;
    align-items: flex-start;
    gap: 20px;
    animation: pillar-content-in 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  .pillar-content-icon-wrap {
    width: 64px;
    height: 64px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .pillar-content-name {
    font-size: 18px;
    font-weight: 800;
    color: #22282a;
    margin: 0 0 8px;
    font-family: 'Satoshi', sans-serif;
  }

  .pillar-content-pitch {
    font-size: 14px;
    color: rgba(34, 40, 42, 0.7);
    line-height: 1.65;
    margin: 0;
    font-family: 'Satoshi', sans-serif;
  }

  @media (max-width: 768px) {
    .pillar-tabs-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .pillar-headline {
      font-size: 18px !important;
    }
    .pillar-content-anim {
      flex-direction: column;
    }
    .pillar-content-icon-wrap {
      width: 56px;
      height: 56px;
    }
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function PillarAnimation() {
  const [active, setActive] = useState(0);
  const [animKey, setAnimKey] = useState(0); // remounts content + progress bar
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const advance = (next: number) => {
    setActive(next);
    setAnimKey((k) => k + 1);
  };

  const startTimer = (current: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const next = (current + 1) % PILLARS.length;
      advance(next);
      // restart timer pointing at new index — we handle this via the effect dependency chain
    }, INTERVAL_MS);
  };

  // Auto-advance: restart timer whenever `active` changes
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % PILLARS.length;
        setAnimKey((k) => k + 1);
        return next;
      });
    }, INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTabClick = (index: number) => {
    if (index === active) return;
    // Clear existing timer
    if (timerRef.current) clearInterval(timerRef.current);
    advance(index);
    // Restart timer from new index
    timerRef.current = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % PILLARS.length;
        setAnimKey((k) => k + 1);
        return next;
      });
    }, INTERVAL_MS);
  };

  const pillar = PILLARS[active];
  const ContentIcon = pillar.ContentIcon;

  return (
    <section
      style={{
        background: "#0d1514",
        padding: "80px 24px",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <style>{PILLAR_CSS}</style>

      {/* Unified card wrapper with single outer shadow */}
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        {/* ── Container 1: Top card ────────────────────────────────────────── */}
        <div
          style={{
            background: "#92a6b0",
            borderRadius: "20px 20px 0 0",
            padding: 32,
          }}
        >
          <div
            style={{
              background: "#b1c5ce",
              borderRadius: 14,
              padding: 28,
            }}
          >
            <Logo showWordmark={true} animate={false} size="md" />
            <h2 className="pillar-headline">
              Stop losing jobs to missed calls and slow replies.
            </h2>
            <p className="pillar-subtext">
              WeFixTrades runs in the background — handling enquiries, sending
              quotes, and booking jobs while you're on the tools.
            </p>
          </div>
        </div>

        {/* ── Container 2: Pillar tabs ─────────────────────────────────────── */}
        <div
          style={{
            background: "#92a6b0",
            marginTop: 3,
            padding: 16,
          }}
        >
          <div className="pillar-tabs-grid">
            {PILLARS.map((p, i) => {
              const isActive = i === active;
              const TabIcon = p.TabIcon;
              return (
                <div
                  key={p.id}
                  className="pillar-tab"
                  style={{
                    background: isActive
                      ? "#b1c5ce"
                      : "rgba(255,255,255,0.25)",
                    border: `2px solid ${isActive ? p.accent : "transparent"}`,
                    transform: isActive ? "translateY(-3px)" : "translateY(0)",
                    boxShadow: isActive
                      ? "0 8px 24px rgba(0,0,0,0.12)"
                      : "none",
                    opacity: isActive ? 1 : 0.7,
                  }}
                  onClick={() => handleTabClick(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleTabClick(i);
                  }}
                  aria-pressed={isActive}
                  aria-label={p.name}
                >
                  <div
                    className="pillar-tab-icon-wrap"
                    style={{
                      background: isActive
                        ? `${p.accent}26`
                        : "rgba(255,255,255,0.2)",
                    }}
                  >
                    <TabIcon
                      size={22}
                      color={isActive ? p.accent : "#22282a"}
                      strokeWidth={1.6}
                    />
                  </div>
                  <span className="pillar-tab-name">{p.name}</span>

                  {/* Progress bar — remounts on animKey change to restart animation */}
                  {isActive && (
                    <div
                      key={`progress-${animKey}`}
                      className="pillar-progress-bar"
                      style={{ background: p.accent }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Container 3: Bottom content card ────────────────────────────── */}
        <div
          style={{
            background: "#92a6b0",
            marginTop: 3,
            borderRadius: "0 0 20px 20px",
            padding: 32,
          }}
        >
          <div
            style={{
              background: "#b1c5ce",
              borderRadius: 14,
              padding: 28,
            }}
          >
            {/* key remount triggers entrance animation on each pillar change */}
            <div key={`content-${animKey}`} className="pillar-content-anim">
              <div
                className="pillar-content-icon-wrap"
                style={{ background: `${pillar.accent}26` }}
              >
                <ContentIcon
                  size={36}
                  color={pillar.accent}
                  strokeWidth={1.5}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pillar-content-name">{pillar.title}</div>
                <p className="pillar-content-pitch">{pillar.pitch}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
