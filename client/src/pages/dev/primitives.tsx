/**
 * /dev/primitives — isolated component canvas for primitive testing.
 * NOT wrapped in MarketingLayout — clean cascade, no parent overrides.
 */
import { NavButtonDemo } from "@/components/primitives/NavButton";

export default function PrimitivesPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#181d1f",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: 48,
        gap: 64,
      }}
    >
      <div>
        <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 24 }}>
          NavButton — Services (dark)
        </p>
        <NavButtonDemo />
      </div>
    </div>
  );
}
