/**
 * RankGridDemoLoop — a single, self-contained hero card that loops the whole
 * Local Rank Grid flow so a visitor sees the tool "work" before scanning:
 *   1. seed  — the sample business + keyword type into the form
 *   2. scan  — "scanning 25 points…" with a pulsing grid
 *   3. result — KPIs (SoLV/ARP/ATRP + High/Med/Low) and the heatmap cascade in
 * ~4s loop, crossfaded. One card (KPIs + map together), not two. Pure CSS/JS,
 * no external map dependency, reduced-motion safe (holds the result frame).
 * Colours: rgb()/rgba() only (marketing surface, hardcoded-color guard).
 *
 * Parametrized by a {@link RankGridPreset} so every marketing surface can show
 * a DIFFERENT city + demo company on the SAME real map-grid style (a Google
 * static-map image + overlaid 5×5 rank pins + SoLV/ARP/ATRP header). A compact
 * static payoff card — {@link RankGridResultCard} — is exported for tab/hero
 * mockups where the full 3-phase loop would be too busy.
 */
import * as React from "react";
import { MapPin, Search, Loader2 } from "lucide-react";
import { MONO, SANS } from "@/components/effortel-blocks";

// Effortel palette (matches the home ServiceStackTimeline): ink/muted/accent +
// brand stat-tile pills, so the demo reads in the same design language.
const INK = "rgb(34, 40, 42)";
const MUTED = "rgb(95, 111, 119)";
const ACCENT = "rgb(61, 90, 94)";
const BLUE = "rgb(13, 60, 252)";

/** Brand stat-tile pills — same green/amber/blue the home KPIs use. */
const EFF_TILE = {
  green: { bg: "rgb(209,250,229)", ink: "rgb(5,150,105)", muted: "rgba(5,150,105,0.72)" },
  amber: { bg: "rgb(254,243,199)", ink: "rgb(217,119,6)", muted: "rgba(217,119,6,0.75)" },
  blue: { bg: "rgb(224,234,255)", ink: "rgb(13,60,252)", muted: "rgba(13,60,252,0.66)" },
} as const;

const GREEN = "rgb(22, 163, 74)";
const AMBER = "rgb(234, 179, 8)";
const RED = "rgb(220, 38, 38)";

export type RankGridZone = { label: string; count: number; color: string };
export type RankGridKpis = { solv: string; arp: string; atrp: string };

/** Everything a single rank-grid surface needs: a city, a demo company, and the
 *  matching Google static-map image + sample scan data. */
export interface RankGridPreset {
  company: string;
  city: string;
  keyword: string;
  /** Google static-map PNG under /public (light, low-detail style). */
  mapSrc: string;
  /** 25 sample ranks (row-major). null = not in top 20. */
  ranks: (number | null)[];
  /** Index (0–24) of the "You" pin. Default 12 (centre). */
  center?: number;
  kpis: RankGridKpis;
  zones: [RankGridZone, RankGridZone, RankGridZone];
}

/* ── City presets — each surface passes a different one so it's never the same
      Denver everywhere. Map PNGs are generated from the WeFixTrades Google Maps
      key (see /public/marketing/rankgrid-<city>.png). ─────────────────────── */

export const DENVER_PRESET: RankGridPreset = {
  company: "Summit Plumbing Co.",
  city: "Denver, CO",
  keyword: "plumber near me",
  mapSrc: "/marketing/rankgrid-demo-map.png",
  ranks: [
    2, 1, 9, null, null,
    3, 5, 7, 15, 20,
    1, 2, null, 10, 12,
    2, 1, 3, 6, 8,
    1, 2, 3, 4, 5,
  ],
  center: 12,
  kpis: { solv: "44", arp: "5.5", atrp: "6.6" },
  zones: [
    { label: "Top 3", count: 11, color: GREEN },
    { label: "4–10", count: 8, color: AMBER },
    { label: "11+", count: 6, color: RED },
  ],
};

export const AUSTIN_PRESET: RankGridPreset = {
  company: "Lone Star HVAC",
  city: "Austin, TX",
  keyword: "hvac repair near me",
  mapSrc: "/marketing/rankgrid-austin.png",
  ranks: [
    1, 1, 3, 7, 12,
    2, 1, 4, 9, 15,
    1, 2, 1, 5, 10,
    3, 2, 4, 8, 14,
    1, 1, 2, 6, 9,
  ],
  center: 12,
  kpis: { solv: "52", arp: "4.2", atrp: "5.1" },
  zones: [
    { label: "Top 3", count: 13, color: GREEN },
    { label: "4–10", count: 9, color: AMBER },
    { label: "11+", count: 3, color: RED },
  ],
};

export const SEATTLE_PRESET: RankGridPreset = {
  company: "Emerald Electric",
  city: "Seattle, WA",
  keyword: "electrician near me",
  mapSrc: "/marketing/rankgrid-seattle.png",
  ranks: [
    2, 1, 5, null, null,
    1, 3, 8, 12, 18,
    2, 1, 4, 7, 11,
    1, 2, 6, 10, 16,
    1, 3, 9, 14, null,
  ],
  center: 12,
  kpis: { solv: "40", arp: "5.4", atrp: "7.2" },
  zones: [
    { label: "Top 3", count: 10, color: GREEN },
    { label: "4–10", count: 7, color: AMBER },
    { label: "11+", count: 8, color: RED },
  ],
};

export const PHOENIX_PRESET: RankGridPreset = {
  company: "Desert Roofing Co.",
  city: "Phoenix, AZ",
  keyword: "roofer near me",
  mapSrc: "/marketing/rankgrid-phoenix.png",
  ranks: [
    1, 2, 4, 8, 13,
    2, 1, 3, 6, 11,
    1, 3, 1, 5, 9,
    2, 1, 4, 7, 12,
    1, 2, 3, 10, 17,
  ],
  center: 12,
  kpis: { solv: "48", arp: "4.6", atrp: "5.4" },
  zones: [
    { label: "Top 3", count: 12, color: GREEN },
    { label: "4–10", count: 9, color: AMBER },
    { label: "11+", count: 4, color: RED },
  ],
};

export const CHICAGO_PRESET: RankGridPreset = {
  company: "Windy City Garage Doors",
  city: "Chicago, IL",
  keyword: "garage door repair",
  mapSrc: "/marketing/rankgrid-chicago.png",
  ranks: [
    3, 1, 6, 11, null,
    1, 2, 4, 8, 14,
    2, 1, 2, 5, 10,
    1, 4, 7, 12, 19,
    2, 1, 3, 9, 15,
  ],
  center: 12,
  kpis: { solv: "44", arp: "5.0", atrp: "6.3" },
  zones: [
    { label: "Top 3", count: 11, color: GREEN },
    { label: "4–10", count: 8, color: AMBER },
    { label: "11+", count: 6, color: RED },
  ],
};

function pinColor(r: number | null): string {
  if (r == null || r > 20) return RED;
  if (r <= 3) return GREEN;
  if (r <= 10) return AMBER;
  return "rgb(249, 115, 22)";
}

const PHASES = 3;
const DURATIONS = [1700, 1500, 2800]; // seed, scan, result

export function RankGridDemoLoop({ preset = DENVER_PRESET }: { preset?: RankGridPreset }) {
  const [phase, setPhase] = React.useState(2); // start on the result so SSR/no-JS shows the payoff
  const reduce = React.useRef(false);

  React.useEffect(() => {
    reduce.current =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce.current) return; // hold the result frame
    const t = setTimeout(() => setPhase((p) => (p + 1) % PHASES), DURATIONS[phase]);
    return () => clearTimeout(t);
  }, [phase]);

  return (
    <div
      aria-label={`Local Rank Grid — sample scan for ${preset.company} in ${preset.city}`}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "rgb(255, 255, 255)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 20,
        boxShadow: "0 18px 50px rgba(0,0,0,0.08)",
        overflow: "hidden",
      }}
    >
      <RankGridKeyframes />

      {/* Browser chrome cue */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderBottom: "1px solid rgba(0,0,0,0.06)", background: "rgba(0,0,0,0.015)" }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: "rgb(226,232,240)" }} />
        <span style={{ width: 9, height: 9, borderRadius: 999, background: "rgb(226,232,240)" }} />
        <span style={{ width: 9, height: 9, borderRadius: 999, background: "rgb(226,232,240)" }} />
        <span style={{ marginLeft: 8, fontSize: 11, color: MUTED, fontWeight: 600, fontFamily: MONO, letterSpacing: "0.03em" }}>wefixtrades.com · Local Rank Grid</span>
      </div>

      {/* Stage — fills the column (so the card matches the left column's height,
          tops + bottoms aligned) and crossfades phases so it never jumps. */}
      <div style={{ position: "relative", flex: 1, minHeight: 408, padding: 18 }}>
        {/* Phase 0 — seed the form */}
        <PhaseWrap active={phase === 0}>
          <SeedForm preset={preset} run={phase === 0} />
        </PhaseWrap>

        {/* Phase 1 — scanning */}
        <PhaseWrap active={phase === 1}>
          <Scanning preset={preset} run={phase === 1} />
        </PhaseWrap>

        {/* Phase 2 — result */}
        <PhaseWrap active={phase === 2}>
          <MapGrid preset={preset} animate={phase === 2} withFootnote />
        </PhaseWrap>
      </div>
    </div>
  );
}

/**
 * RankGridResultCard — the static payoff card (real map + pins + SoLV/ARP/ATRP
 * + company/city label) in its own white shell. Used on marketing surfaces
 * (home "four tools" MapGuard tab, MapGuard product hero) where the full 3-phase
 * loop would be too busy. Fills its parent (width/height 100%) so it adapts to a
 * spacious desktop slot or a compact 280px mobile slot.
 */
export function RankGridResultCard({ preset = DENVER_PRESET }: { preset?: RankGridPreset }) {
  return (
    <div
      aria-label={`Local Rank Grid result — ${preset.company} in ${preset.city}`}
      style={{
        width: "100%",
        height: "100%",
        maxWidth: 460,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        background: "rgb(255, 255, 255)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 18,
        boxShadow: "0 18px 50px rgba(0,0,0,0.10)",
        overflow: "hidden",
      }}
    >
      {/* Header — company + city on the left, Local Rank Grid tag on the right */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK, fontFamily: SANS, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{preset.company}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: MUTED, fontFamily: MONO, marginTop: 1 }}>
            <MapPin size={11} aria-hidden="true" /> {preset.city}
          </div>
        </div>
        <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: ACCENT, fontFamily: MONO, background: "rgba(61,90,94,0.08)", borderRadius: 999, padding: "4px 9px" }}>
          Local Rank Grid
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 16 }}>
        <MapGrid preset={preset} animate={false} />
      </div>
    </div>
  );
}

function PhaseWrap({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!active}
      style={{
        position: "absolute",
        inset: 18,
        opacity: active ? 1 : 0,
        transition: "opacity 0.45s ease",
        pointerEvents: "none",
      }}
    >
      {children}
    </div>
  );
}

/** Shared keyframes for the loop's entrance animations. */
function RankGridKeyframes() {
  return (
    <style>{`
      @keyframes rgd-type { from { width: 0; } to { width: var(--w, 100%); } }
      @keyframes rgd-spin { to { transform: rotate(360deg); } }
      @keyframes rgd-pin { 0% { opacity: 0; transform: scale(0.4); } 60% { opacity: 1; transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
      @keyframes rgd-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes rgd-pulse { 0%,100% { opacity: 0.35; } 50% { opacity: 0.7; } }
      .rgd-caret { animation: rgd-blink 0.9s steps(1) infinite; }
      @keyframes rgd-blink { 0%,50% { opacity: 1; } 51%,100% { opacity: 0; } }
      @media (prefers-reduced-motion: reduce) {
        .rgd-anim { animation: none !important; }
        .rgd-caret { display: none; }
      }
    `}</style>
  );
}

function Field({ label, value, typed, run }: { label: string; value: string; typed?: boolean; run: boolean }) {
  return (
    <div style={{ position: "relative", border: "1px solid rgba(0,0,0,0.10)", borderRadius: 12, padding: "10px 14px", background: "rgb(255,255,255)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: ACCENT, fontFamily: MONO }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 15, fontWeight: 600, color: INK, fontFamily: SANS, whiteSpace: "nowrap", overflow: "hidden", display: "inline-flex", alignItems: "center" }}>
        {typed && run ? (
          <span className="rgd-anim" style={{ display: "inline-block", overflow: "hidden", whiteSpace: "nowrap", animation: "rgd-type 0.9s steps(24) both", ["--w" as any]: `${value.length}ch` }}>{value}</span>
        ) : (
          <span>{value}</span>
        )}
        {typed && run && <span className="rgd-caret" style={{ marginLeft: 1, width: 2, height: 16, background: BLUE, display: "inline-block" }} />}
      </div>
    </div>
  );
}

function SeedForm({ preset, run }: { preset: RankGridPreset; run: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%", justifyContent: "center" }}>
      <Field label="Business name" value={preset.company} typed run={run} />
      <Field label="City" value={preset.city} run={run} />
      <Field label="Target keyword" value={preset.keyword} run={run} />
      <button
        type="button"
        tabIndex={-1}
        style={{ marginTop: 4, width: "100%", padding: "13px 16px", borderRadius: 12, background: BLUE, color: "rgb(255,255,255)", fontSize: 12, fontWeight: 700, border: "none", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase" }}
      >
        Scan rank across 5×5 grid
      </button>
    </div>
  );
}

function Scanning({ preset, run }: { preset: RankGridPreset; run: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, height: "100%" }}>
      <Loader2 className={run ? "rgd-anim" : undefined} size={24} color={BLUE} style={{ animation: run ? "rgd-spin 0.9s linear infinite" : undefined }} aria-hidden="true" />
      <div style={{ fontSize: 14, fontWeight: 700, color: INK, fontFamily: SANS, textAlign: "center" }}>Scanning 25 grid points across {preset.city.split(",")[0]}…</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, width: 220 }}>
        {preset.ranks.map((_, i) => (
          <span key={i} className={run ? "rgd-anim" : undefined} style={{ width: 18, height: 18, borderRadius: 999, background: "rgb(203,213,225)", margin: "0 auto", animation: run ? `rgd-pulse 1.1s ease ${(i % 5) * 0.08}s infinite` : undefined }} />
        ))}
      </div>
    </div>
  );
}

/** The payoff content: KPI row + zone bar + real map with overlaid rank pins.
 *  `animate` gates the entrance animations (used by the loop; off for the
 *  static card). `withFootnote` shows the hover hint line. */
function MapGrid({ preset, animate, withFootnote }: { preset: RankGridPreset; animate: boolean; withFootnote?: boolean }) {
  const center = preset.center ?? 12;
  const kpis = [
    { label: "SoLV", value: preset.kpis.solv, unit: "%", tone: "green" as const, big: true, cap: "Cells where you're Top 3" },
    { label: "ARP", value: preset.kpis.arp, tone: "amber" as const, cap: "Avg rank where you appear" },
    { label: "ATRP", value: preset.kpis.atrp, tone: "blue" as const, cap: "Avg rank across every cell" },
  ];
  const totalZone = preset.zones.reduce((s, z) => s + z.count, 0) || 25;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
      <div style={{ display: "flex", gap: 8 }}>
        {kpis.map((k, i) => {
          const t = EFF_TILE[k.tone];
          return (
            <div key={k.label} className={animate ? "rgd-anim" : undefined} style={{ flex: 1, minWidth: 0, borderRadius: 14, padding: "8px 10px", background: t.bg, animation: animate ? `rgd-rise 0.45s ease ${i * 0.08}s both` : undefined }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.muted, fontFamily: MONO }}>{k.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                <span style={{ fontSize: k.big ? 26 : 22, fontWeight: 800, color: t.ink, lineHeight: 1, fontFamily: SANS }}>{k.value}</span>
                {k.unit && <span style={{ fontSize: 13, fontWeight: 800, color: t.ink, fontFamily: SANS }}>{k.unit}</span>}
              </div>
              <div style={{ fontSize: 9.5, color: t.muted, lineHeight: 1.3, marginTop: 2, fontFamily: MONO }}>{k.cap}</div>
            </div>
          );
        })}
      </div>

      {/* Zone breakdown — how the 25 grid points split across rank bands (part
          of the real report: the High/Med/Low bar). */}
      <div className={animate ? "rgd-anim" : undefined} style={{ display: "flex", alignItems: "center", gap: 10, animation: animate ? "rgd-rise 0.45s ease 0.24s both" : undefined }}>
        <div style={{ display: "flex", height: 8, flex: 1, borderRadius: 999, overflow: "hidden" }}>
          {preset.zones.map((z) => (
            <span key={z.label} style={{ width: `${(z.count / totalZone) * 100}%`, background: z.color }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {preset.zones.map((z) => (
            <span key={z.label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: MUTED, fontFamily: MONO }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: z.color }} />
              {z.label} {z.count}
            </span>
          ))}
        </div>
      </div>

      {/* Heatmap on the real city map */}
      <div style={{ position: "relative", flex: 1, minHeight: 104, borderRadius: 14, overflow: "hidden", background: "rgb(238,242,247)", border: "1px solid rgba(0,0,0,0.06)" }}>
        <img src={preset.mapSrc} alt="" aria-hidden="true" loading="lazy" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.16)" }} />
        <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gridTemplateRows: "repeat(5, 1fr)", padding: 16, placeItems: "center" }}>
          {preset.ranks.map((r, i) => {
            const isYou = i === center;
            return (
              <div
                key={i}
                className={animate ? "rgd-anim" : undefined}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: isYou ? BLUE : pinColor(r),
                  color: "rgb(255,255,255)",
                  border: "2px solid rgba(255,255,255,0.9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 800,
                  boxShadow: "0 2px 6px rgba(15,23,42,0.35)",
                  animation: animate ? `rgd-pin 0.4s ease ${Math.min(i * 0.04, 0.9)}s both` : undefined,
                }}
              >
                {isYou ? <MapPin size={16} aria-hidden="true" /> : r == null ? "–" : r}
              </div>
            );
          })}
        </div>
      </div>
      {withFootnote && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: MUTED, fontFamily: MONO, letterSpacing: "0.02em" }}>
          <Search size={12} aria-hidden="true" /> Sample scan · hover any point for the top 3 competitors ranking there
        </div>
      )}
    </div>
  );
}

export default RankGridDemoLoop;
