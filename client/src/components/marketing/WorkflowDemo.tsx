import { useState } from "react";
import { Check, ArrowRight, Zap, Phone, RefreshCw, Star } from "lucide-react";
import { Link } from "wouter";

import { mkt, shadows } from "@/theme/tokens";

const C = {
  heading: mkt.text,
  body: mkt.textMuted,
  muted: mkt.textFaint,
  border: mkt.border,
  borderLight: mkt.borderLight,
  green: mkt.accent,
  greenDark: mkt.accentHover,
  bg: mkt.surface,
  bgGray: mkt.surfaceAlt,
  bgGrayAlt: 'rgba(255,255,255,0.06)',
  sageTint: mkt.accentTint,
  sageAccent: mkt.accentTint,
  warmGray: mkt.surfaceAlt,
};

const SHADOW = {
  card: shadows.card,
};

interface WorkflowStep {
  id: string;
  icon: typeof Zap;
  label: string;
  title: string;
  description: string;
  outcomes: string[];
  lottieId: string;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: "estimate",
    icon: Zap,
    label: "Instant Estimate",
    title: "Customer gets a quote in seconds",
    description: "Embed a calculator on your website. Visitors select their service, answer a few questions, and get an instant price range — no phone call needed.",
    outcomes: [
      "Captures lead info automatically",
      "Works 24/7 on your website",
      "Trade-specific pricing logic",
    ],
    lottieId: "wf-estimate",
  },
  {
    id: "answering",
    icon: Phone,
    label: "24/7 Answering",
    title: "Never miss a call or chat again",
    description: "Your assistant answers calls and chats around the clock. It handles common questions, provides quotes, and captures lead details — even at 2am.",
    outcomes: [
      "Handles calls and live chat",
      "Provides instant estimates",
      "Escalates urgent jobs to you",
    ],
    lottieId: "wf-answering",
  },
  {
    id: "followups",
    icon: RefreshCw,
    label: "Auto Follow-ups + Booking",
    title: "Quotes convert into booked jobs",
    description: "Automated follow-up sequences remind customers about their quote, offer booking slots, and collect deposits — all without you lifting a finger.",
    outcomes: [
      "SMS & email follow-up sequences",
      "Calendar booking with deposits",
      "Automated confirmation & reminders",
    ],
    lottieId: "wf-followups",
  },
  {
    id: "reviews",
    icon: Star,
    label: "Review Requests",
    title: "Build your reputation automatically",
    description: "After each completed job, your system sends a friendly review request. Monitor your ratings, respond to feedback, and build trust with future customers.",
    outcomes: [
      "Automated review request after jobs",
      "Monitor ratings across platforms",
      "Respond to reviews from one dashboard",
    ],
    lottieId: "wf-reviews",
  },
];

export default function WorkflowDemo({ expanded = false }: { expanded?: boolean }) {
  const [activeStep, setActiveStep] = useState(0);
  const step = WORKFLOW_STEPS[activeStep];

  return (
    <div data-testid="workflow-demo">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: expanded ? "280px 1fr" : "240px 1fr",
          gap: expanded ? 32 : 24,
          alignItems: "start",
        }}
        className="workflow-grid"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {WORKFLOW_STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === activeStep;
            return (
              <button
                key={s.id}
                data-testid={`workflow-step-${s.id}`}
                onClick={() => setActiveStep(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: isActive ? `1.5px solid ${C.green}` : `1px solid ${C.border}`,
                  background: isActive ? C.sageTint : C.bg,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: isActive ? C.green : C.bgGrayAlt,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={18} color={isActive ? mkt.buttonText : C.muted} strokeWidth={1.5} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: isActive ? C.green : C.muted,
                      letterSpacing: "0.02em",
                      marginBottom: 2,
                    }}
                  >
                    Step {i + 1}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isActive ? mkt.onDark : C.body,
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div
          data-testid="workflow-panel"
          style={{
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 20,
            padding: expanded ? "36px 32px" : "28px 24px",
            boxShadow: SHADOW.card,
            minHeight: expanded ? 380 : 320,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3
              style={{
                fontSize: expanded ? 24 : 20,
                fontWeight: 700,
                color: mkt.onDark,
                marginBottom: 12,
                letterSpacing: "-0.01em",
              }}
            >
              {step.title}
            </h3>
            <p
              style={{
                fontSize: 15,
                color: C.body,
                lineHeight: 1.65,
                marginBottom: 24,
              }}
            >
              {step.description}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {step.outcomes.map((o) => (
                <div key={o} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Check size={16} strokeWidth={2} color={C.green} />
                  <span style={{ fontSize: 14, color: C.body, fontWeight: 500 }}>{o}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            data-lottie={step.lottieId}
            style={{
              background: C.bgGray,
              border: `1px solid ${C.borderLight}`,
              borderRadius: 14,
              padding: "32px 24px",
              textAlign: "center",
              color: C.muted,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <div style={{ marginBottom: 8, opacity: 0.5 }}>
              {step.icon && <step.icon size={32} strokeWidth={1} />}
            </div>
            Animation placeholder
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 700px) {
          .workflow-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
