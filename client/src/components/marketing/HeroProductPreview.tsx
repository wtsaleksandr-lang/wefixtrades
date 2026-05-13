/**
 * HeroProductPreview — animated "your AI back-office is working" panel
 * that sits to the right of the hero copy. Shows what the user would
 * actually see in their portal once they sign up: an activity feed of
 * AI events (calls answered, leads captured, reviews requested) +
 * a few live-counter KPIs.
 *
 * Pure visual / decorative — no real data. Animation loops every ~12s
 * so visitors who scroll past quickly still see motion. Respects
 * prefers-reduced-motion: shows a static snapshot instead.
 *
 * Sized to fit a 2-column hero grid alongside the copy. Falls back
 * gracefully on narrow viewports — parent should stack vertically.
 */

import { useEffect, useState } from "react";
import { Phone, Star, MessageSquare, MapPin, FileText, TrendingUp, Check } from "lucide-react";
import { mkt, typography } from "@/theme/tokens";

interface ActivityEvent {
  icon: typeof Phone;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  /** Seconds-ago when the event "happened". The component re-stamps
   *  this against the current time so it always looks fresh. */
  agoSec: number;
}

const EVENTS: ActivityEvent[] = [
  {
    icon: Phone,
    iconColor: "#10B981",
    iconBg: "rgba(16,185,129,0.15)",
    title: "TradeLine answered a call",
    subtitle: "Booked Mike R. — kitchen tap leak",
    agoSec: 12,
  },
  {
    icon: Star,
    iconColor: "#F59E0B",
    iconBg: "rgba(245,158,11,0.15)",
    title: "Review request sent",
    subtitle: "Jenny K. — bathroom reno",
    agoSec: 42,
  },
  {
    icon: FileText,
    iconColor: "#3B82F6",
    iconBg: "rgba(59,130,246,0.15)",
    title: "Quote generated",
    subtitle: "$1,840 — hot water replacement",
    agoSec: 68,
  },
  {
    icon: MapPin,
    iconColor: "#8B5CF6",
    iconBg: "rgba(139,92,246,0.15)",
    title: "Google Business updated",
    subtitle: "Service area expanded — 3 new suburbs",
    agoSec: 134,
  },
  {
    icon: MessageSquare,
    iconColor: "#06B6D4",
    iconBg: "rgba(6,182,212,0.15)",
    title: "Missed call recovered",
    subtitle: "SMS sent to +61 4** *** 219",
    agoSec: 198,
  },
];

const KPIS = [
  { label: "Calls answered today", end: 14, suffix: "" },
  { label: "Reviews requested", end: 8, suffix: "" },
  { label: "Pipeline added", end: 4280, suffix: "", prefix: "$" },
];

function formatAgo(sec: number): string {
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  return `${m}m ago`;
}

export default function HeroProductPreview() {
  // Respect prefers-reduced-motion: skip the animation loop, show the final state.
  const reduceMotion = typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // KPI counters animate from 0 → end over ~1.4s on mount.
  const [kpiValues, setKpiValues] = useState(() => KPIS.map(() => 0));
  useEffect(() => {
    if (reduceMotion) {
      setKpiValues(KPIS.map((k) => k.end));
      return;
    }
    const start = Date.now();
    const DURATION = 1400;
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / DURATION);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setKpiValues(KPIS.map((k) => Math.floor(k.end * eased)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  // Activity feed cycles which event is "newest" every 4s. The feed
  // always shows 4 events; we rotate the start index.
  const [feedOffset, setFeedOffset] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => {
      setFeedOffset((o) => (o + 1) % EVENTS.length);
    }, 4000);
    return () => clearInterval(id);
  }, [reduceMotion]);

  const visible = Array.from({ length: 4 }, (_, i) => EVENTS[(feedOffset + i) % EVENTS.length]);

  return (
    <div
      data-testid="hero-product-preview"
      style={{
        width: "100%",
        maxWidth: 480,
        background: "rgba(13,18,22,0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 20,
        padding: 20,
        boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
        fontFamily: typography.fontFamily,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8, height: 8, borderRadius: 999,
              background: "#10B981",
              boxShadow: "0 0 0 4px rgba(16,185,129,0.15)",
            }}
            aria-hidden="true"
          />
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Your AI back-office · live
          </span>
        </div>
        <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.35)" }}>
          today
        </span>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
        {KPIS.map((kpi, i) => (
          <div
            key={kpi.label}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: "10px 12px",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 800, color: mkt.accent, lineHeight: 1, letterSpacing: "-0.02em" }}>
              {kpi.prefix ?? ""}{kpiValues[i].toLocaleString()}{kpi.suffix ?? ""}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 4, lineHeight: 1.3 }}>
              {kpi.label}
            </div>
          </div>
        ))}
      </div>

      {/* Activity feed */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((ev, i) => {
          const Icon = ev.icon;
          // Newest event highlights briefly when it rotates in.
          const isNewest = i === 0;
          return (
            <div
              key={`${feedOffset}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${isNewest ? "rgba(102,232,250,0.25)" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 10,
                opacity: 1 - i * 0.1,
                animation: !reduceMotion && isNewest ? "preview-slide-in 0.5s ease-out" : undefined,
              }}
            >
              <span
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: ev.iconBg, color: ev.iconColor,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={15} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.92)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {ev.title}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {ev.subtitle}
                </div>
              </div>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                {formatAgo(ev.agoSec)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
        <Check size={12} color="#10B981" strokeWidth={3} />
        <span>Running 24/7 while you're on the tools</span>
      </div>

      <style>{`
        @keyframes preview-slide-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
