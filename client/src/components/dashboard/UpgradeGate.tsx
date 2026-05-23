import { Link } from "wouter";
import { Lock, ArrowRight, Sparkles } from "lucide-react";
import { canAccess, requiredPlanLabel, PLAN_BADGE_STYLES, type Feature } from "@/config/planGating";

interface Props {
  currentPlan: string;
  feature: Feature;
  featureLabel: string;
  children?: React.ReactNode;
  /* inline = small locked pill (for use inside an existing row) */
  inline?: boolean;
  /* compact = medium banner, no icon details */
  compact?: boolean;
}

export default function UpgradeGate({ currentPlan, feature, featureLabel, children, inline, compact }: Props) {
  if (canAccess(currentPlan, feature)) return <>{children}</>;

  const requiredPlan = requiredPlanLabel(feature);
  const planStyle = PLAN_BADGE_STYLES[requiredPlan.toLowerCase() as keyof typeof PLAN_BADGE_STYLES]
    || PLAN_BADGE_STYLES.pro;

  /* ── Inline pill variant (for toggle rows) ── */
  if (inline) {
    return (
      <div data-theme="light" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 40, height: 22, borderRadius: 11,
          background: "#F1F5F9", position: "relative", opacity: 0.4, cursor: "not-allowed",
        }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#CBD5E1", position: "absolute", top: 2, left: 2 }} />
        </div>
        <Link
          href="/pricing"
          data-testid={`upgrade-cta-${feature}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: 10, fontWeight: 800, textDecoration: "none",
            background: planStyle.bg, color: planStyle.color,
            border: `1px solid ${planStyle.border}`,
            padding: "2px 9px", borderRadius: 20, whiteSpace: "nowrap",
          }}
        >
          <Lock size={12} /> {requiredPlan}
        </Link>
      </div>
    );
  }

  /* ── Compact banner (for card-level gating) ── */
  if (compact) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderRadius: 10,
        background: "#F8FAFC", border: "1.5px dashed #E2E8F0",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Lock size={14} color="#94A3B8" />
          <span style={{ fontSize: 13, color: "#64748B" }}>{featureLabel}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
            background: planStyle.bg, color: planStyle.color, border: `1px solid ${planStyle.border}`,
          }}>
            {requiredPlan}
          </span>
        </div>
        <Link
          href="/pricing"
          data-testid={`upgrade-cta-${feature}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "6px 14px", borderRadius: 8,
            background: "#0d3cfc", color: "#FFFFFF",
            fontSize: 12, fontWeight: 700, textDecoration: "none",
          }}
        >
          Upgrade <ArrowRight size={12} />
        </Link>
      </div>
    );
  }

  /* ── Full banner (default) ── */
  return (
    <div
      data-testid={`locked-feature-${feature}`}
      style={{
        border: "1.5px dashed #E2E8F0", borderRadius: 14,
        padding: "20px 22px", background: "#F8FAFC",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "#FFFFFF", border: "1px solid #E2E8F0",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Lock size={16} color="#94A3B8" />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 3 }}>
            {featureLabel}
          </div>
          <div style={{ fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={12} />
            Requires{" "}
            <span style={{
              fontWeight: 700, padding: "1px 7px", borderRadius: 12,
              background: planStyle.bg, color: planStyle.color, border: `1px solid ${planStyle.border}`,
            }}>
              {requiredPlan}
            </span>{" "}
            plan
          </div>
        </div>
      </div>
      <Link
        href="/pricing"
        data-testid={`upgrade-cta-${feature}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "10px 18px", borderRadius: 9,
          background: "#0d3cfc", color: "#FFFFFF",
          fontSize: 13, fontWeight: 700, textDecoration: "none",
          whiteSpace: "nowrap", flexShrink: 0,
        }}
      >
        Upgrade to {requiredPlan} <ArrowRight size={12} />
      </Link>
    </div>
  );
}

/* ─── Plan tier display badge (used in Overview) ─── */
export function PlanBadge({ plan }: { plan: string }) {
  const styles = PLAN_BADGE_STYLES[plan as keyof typeof PLAN_BADGE_STYLES] || PLAN_BADGE_STYLES.free;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 800, letterSpacing: "0.04em",
      padding: "3px 10px", borderRadius: 20,
      background: styles.bg, color: styles.color, border: `1px solid ${styles.border}`,
      textTransform: "uppercase",
    }}>
      {plan === "free" && <Lock size={12} />}
      {plan === "pro" && <Sparkles size={12} />}
      {plan === "elite" && <Sparkles size={12} />}
      {(plan || "free").toUpperCase()}
    </span>
  );
}
