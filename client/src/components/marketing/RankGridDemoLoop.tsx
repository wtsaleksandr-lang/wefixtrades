/**
 * RankGridDemoLoop — a single, self-contained hero card that loops the whole
 * Local Rank Grid flow so a visitor sees the tool "work" before scanning:
 *   1. seed  — the sample business + keyword type into the form
 *   2. scan  — "scanning 25 points…" with a pulsing grid
 *   3. result — KPIs (SoLV/ARP/ATRP + High/Med/Low) and the heatmap cascade in
 * ~4s loop, crossfaded. One card (KPIs + map together), not two. Pure CSS/JS,
 * no external map dependency, reduced-motion safe (holds the result frame).
 * Colours: rgb()/rgba() only (marketing surface, hardcoded-color guard).
 */
import * as React from "react";
import { MapPin, Search, Loader2 } from "lucide-react";

const INK = "rgb(17, 24, 39)";
const MUTED = "rgb(100, 116, 139)";
const BLUE = "rgb(13, 60, 252)";

/** 5×5 sample ranks (row-major). null = not in top 20. */
const RANKS: (number | null)[] = [
  2, 1, 9, null, null,
  3, 5, 7, 15, 20,
  1, 2, null, 10, 12,
  2, 1, 3, 6, 8,
  1, 2, 3, 4, 5,
];
const CENTER = 12; // the "You" pin (row 2, col 2)

function pinColor(r: number | null): string {
  if (r == null || r > 20) return "rgb(220, 38, 38)";
  if (r <= 3) return "rgb(22, 163, 74)";
  if (r <= 10) return "rgb(234, 179, 8)";
  return "rgb(249, 115, 22)";
}

const PHASES = 3;
const DURATIONS = [1700, 1500, 2800]; // seed, scan, result

export function RankGridDemoLoop() {
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
      aria-label="Local Rank Grid — sample scan from business name to heatmap"
      style={{
        width: "100%",
        background: "rgb(255, 255, 255)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 20,
        boxShadow: "0 18px 50px rgba(0,0,0,0.08)",
        overflow: "hidden",
      }}
    >
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

      {/* Browser chrome cue */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderBottom: "1px solid rgba(0,0,0,0.06)", background: "rgba(0,0,0,0.015)" }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: "rgb(226,232,240)" }} />
        <span style={{ width: 9, height: 9, borderRadius: 999, background: "rgb(226,232,240)" }} />
        <span style={{ width: 9, height: 9, borderRadius: 999, background: "rgb(226,232,240)" }} />
        <span style={{ marginLeft: 8, fontSize: 11, color: MUTED, fontWeight: 600 }}>wefixtrades.com · Local Rank Grid</span>
      </div>

      {/* Stage — fixed height, phases crossfade so the card never jumps. */}
      <div style={{ position: "relative", minHeight: 384, padding: 18 }}>
        {/* Phase 0 — seed the form */}
        <PhaseWrap active={phase === 0}>
          <SeedForm run={phase === 0} />
        </PhaseWrap>

        {/* Phase 1 — scanning */}
        <PhaseWrap active={phase === 1}>
          <Scanning run={phase === 1} />
        </PhaseWrap>

        {/* Phase 2 — result */}
        <PhaseWrap active={phase === 2}>
          <Result run={phase === 2} />
        </PhaseWrap>
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

function Field({ label, value, typed, run }: { label: string; value: string; typed?: boolean; run: boolean }) {
  return (
    <div style={{ position: "relative", border: "1px solid rgba(0,0,0,0.10)", borderRadius: 12, padding: "10px 14px", background: "rgb(255,255,255)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: BLUE }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 15, fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", display: "inline-flex", alignItems: "center" }}>
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

function SeedForm({ run }: { run: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%", justifyContent: "center" }}>
      <Field label="Business name" value="Summit Plumbing Co." typed run={run} />
      <Field label="City" value="Denver, CO" run={run} />
      <Field label="Target keyword" value="plumber near me" run={run} />
      <button
        type="button"
        tabIndex={-1}
        style={{ marginTop: 4, width: "100%", padding: "13px 16px", borderRadius: 12, background: BLUE, color: "rgb(255,255,255)", fontSize: 14, fontWeight: 700, border: "none" }}
      >
        Scan rank across 5×5 grid
      </button>
    </div>
  );
}

function Scanning({ run }: { run: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, height: "100%" }}>
      <Loader2 className={run ? "rgd-anim" : undefined} size={24} color={BLUE} style={{ animation: run ? "rgd-spin 0.9s linear infinite" : undefined }} aria-hidden="true" />
      <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>Scanning 25 grid points across Denver…</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, width: 220 }}>
        {RANKS.map((_, i) => (
          <span key={i} className={run ? "rgd-anim" : undefined} style={{ width: 18, height: 18, borderRadius: 999, background: "rgb(203,213,225)", margin: "0 auto", animation: run ? `rgd-pulse 1.1s ease ${(i % 5) * 0.08}s infinite` : undefined }} />
        ))}
      </div>
    </div>
  );
}

function Result({ run }: { run: boolean }) {
  const kpis = [
    { label: "SoLV", value: "44", unit: "%", big: true, cap: "Cells where you're Top 3" },
    { label: "ARP", value: "5.5", cap: "Avg rank where you appear" },
    { label: "ATRP", value: "6.6", cap: "Avg rank across every cell" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", gap: 8 }}>
        {kpis.map((k, i) => (
          <div key={k.label} className={run ? "rgd-anim" : undefined} style={{ flex: 1, minWidth: 0, borderRadius: 12, padding: "8px 10px", background: k.big ? "rgba(234,179,8,0.10)" : "rgb(248,250,252)", border: k.big ? "1px solid rgba(234,179,8,0.28)" : "1px solid rgb(238,242,247)", animation: run ? `rgd-rise 0.45s ease ${i * 0.08}s both` : undefined }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTED }}>{k.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
              <span style={{ fontSize: k.big ? 26 : 22, fontWeight: 900, color: INK, lineHeight: 1 }}>{k.value}</span>
              {k.unit && <span style={{ fontSize: 13, fontWeight: 800, color: MUTED }}>{k.unit}</span>}
            </div>
            <div style={{ fontSize: 9.5, color: MUTED, lineHeight: 1.3, marginTop: 2 }}>{k.cap}</div>
          </div>
        ))}
      </div>

      {/* Heatmap on a faint "city" backdrop */}
      <div style={{ position: "relative", flex: 1, borderRadius: 14, overflow: "hidden", background: "rgb(238,242,247)", border: "1px solid rgba(0,0,0,0.06)" }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.18) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gridTemplateRows: "repeat(5, 1fr)", padding: 14, placeItems: "center" }}>
          {RANKS.map((r, i) => {
            const isYou = i === CENTER;
            return (
              <div
                key={i}
                className={run ? "rgd-anim" : undefined}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: isYou ? BLUE : pinColor(r),
                  color: "rgb(255,255,255)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 800,
                  boxShadow: "0 2px 5px rgba(15,23,42,0.25)",
                  animation: run ? `rgd-pin 0.4s ease ${Math.min(i * 0.04, 0.9)}s both` : undefined,
                }}
              >
                {isYou ? <MapPin size={16} aria-hidden="true" /> : r == null ? "–" : r}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: MUTED }}>
        <Search size={12} aria-hidden="true" /> Sample scan · your service area
      </div>
    </div>
  );
}

export default RankGridDemoLoop;
