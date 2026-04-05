import { Link } from "wouter";
import { trackEvent } from "@/lib/trackEvent";
import { ArrowRight, Search, Calculator, PhoneOff, BarChart3 } from "lucide-react";

type ToolContext = "audit" | "calculator" | "demo" | "mapguard";
type Theme = "light" | "dark" | "widget";

interface NextStepSuggestionsProps {
  context: ToolContext;
  theme?: Theme;
  issues?: string[];
  trade?: string;
  estimatedLoss?: number;
}

interface Suggestion {
  title: string;
  description: string;
  href: string;
  icon: typeof Search;
}

function getSuggestions(
  context: ToolContext,
  _issues?: string[],
  _trade?: string,
  _estimatedLoss?: number,
): Suggestion[] {
  switch (context) {
    case "audit":
      return [
        {
          title: "See how much missed calls cost you",
          description: "Calculate your lost revenue from unanswered calls",
          href: "/tools/missed-call-calculator",
          icon: PhoneOff,
        },
        {
          title: "Try instant quotes on your website",
          description: "Give customers prices in seconds and capture every lead",
          href: "/tools/quote-demo",
          icon: Calculator,
        },
      ];
    case "calculator":
      return [
        {
          title: "Get a full business audit",
          description: "See your Google Maps health, website speed, and competitor analysis",
          href: "/tools/free-audit",
          icon: BarChart3,
        },
        {
          title: "Let customers get instant quotes",
          description: "Try the live quote calculator demo for your trade",
          href: "/tools/quote-demo",
          icon: Calculator,
        },
      ];
    case "demo":
      return [
        {
          title: "Check your Google visibility",
          description: "Free audit of your Google Maps profile and website",
          href: "/tools/free-audit",
          icon: Search,
        },
        {
          title: "Calculate your missed call cost",
          description: "See how much unanswered calls are costing your business",
          href: "/tools/missed-call-calculator",
          icon: PhoneOff,
        },
      ];
    case "mapguard":
      return [
        {
          title: "Get your full detailed audit",
          description: "Deep analysis of your Google presence, website, and competitors",
          href: "/tools/free-audit",
          icon: BarChart3,
        },
        {
          title: "Calculate lost revenue from missed calls",
          description: "See what unanswered calls are costing your business",
          href: "/tools/missed-call-calculator",
          icon: PhoneOff,
        },
      ];
    default:
      return [];
  }
}

/* ─── Theme Tokens ─── */

const THEMES = {
  light: {
    bg: "#FFFFFF",
    border: "#E5E7EB",
    title: "#111827",
    desc: "#6B7280",
    cardBg: "#F9FAFB",
    cardBorder: "#E5E7EB",
    cardHover: "#F3F4F6",
    iconBg: "rgba(0,212,200,0.08)",
    iconColor: "#00D4C8",
    arrow: "#9CA3AF",
  },
  dark: {
    bg: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.08)",
    title: "rgba(255,255,255,0.85)",
    desc: "rgba(255,255,255,0.5)",
    cardBg: "rgba(255,255,255,0.03)",
    cardBorder: "rgba(255,255,255,0.06)",
    cardHover: "rgba(255,255,255,0.06)",
    iconBg: "rgba(102,232,250,0.10)",
    iconColor: "#66E8FA",
    arrow: "rgba(255,255,255,0.3)",
  },
  widget: {
    bg: "#f5fcff",
    border: "#d5e1e7",
    title: "#22282a",
    desc: "#5f6f77",
    cardBg: "#ffffff",
    cardBorder: "#d5e1e7",
    cardHover: "#f0f5f8",
    iconBg: "rgba(57,66,71,0.06)",
    iconColor: "#394247",
    arrow: "#5f6f77",
  },
} as const;

export default function NextStepSuggestions({
  context,
  theme = "dark",
  issues,
  trade,
  estimatedLoss,
}: NextStepSuggestionsProps) {
  const suggestions = getSuggestions(context, issues, trade, estimatedLoss);
  if (suggestions.length === 0) return null;

  const t = THEMES[theme];

  return (
    <div
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: 16,
        padding: "20px",
        marginTop: 16,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: t.title,
          marginBottom: 14,
        }}
      >
        What should you do next?
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {suggestions.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href} onClick={() => trackEvent("cross_tool_clicked", { source: context, target: s.href })} style={{ textDecoration: "none", display: "block" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: `1px solid ${t.cardBorder}`,
                  background: t.cardBg,
                  cursor: "pointer",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = t.cardHover;
                  e.currentTarget.style.borderColor = t.iconColor + "44";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = t.cardBg;
                  e.currentTarget.style.borderColor = t.cardBorder;
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: t.iconBg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={16} color={t.iconColor} strokeWidth={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 650,
                      color: t.title,
                      lineHeight: 1.2,
                      marginBottom: 2,
                    }}
                  >
                    {s.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: t.desc,
                      lineHeight: 1.4,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {s.description}
                  </div>
                </div>
                <ArrowRight size={14} color={t.arrow} style={{ flexShrink: 0 }} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
