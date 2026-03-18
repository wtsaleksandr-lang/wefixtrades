/**
 * /dev/canvas — Full-page component canvas for section-level testing.
 * NOT wrapped in MarketingLayout — clean cascade, no parent overrides.
 */
import PillarAnimation from "@/components/sections/PillarAnimation";

export default function DemoCanvas() {
  return (
    <div style={{ minHeight: "100vh", background: "#0d1514" }}>
      {/* ── SECTION — PILLAR ANIMATION ─────────────────────────────────── */}
      <PillarAnimation />
    </div>
  );
}
