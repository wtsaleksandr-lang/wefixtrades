import { useState, useRef, useEffect } from "react";
import gsap from "gsap";
import { mkt, colors, shadows, typography, radius } from "@/theme/tokens";
import {
  MapPin, Calculator, Phone, Shield,
  Star, Zap, Clock, ChevronRight, X,
  TrendingUp, Eye, MessageSquare, BarChart3,
} from "lucide-react";

/* ── Card data ──────────────────────────────────────────────────────── */

type ServiceCard = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  icon: typeof MapPin;
  color: string;
  features: string[];
};

const SERVICES: ServiceCard[] = [
  {
    id: "mapguard",
    title: "MapGuard",
    tagline: "Local Visibility",
    description:
      "Protect and boost your Google Maps ranking. Monitor your local presence, track competitors, and make sure customers find you first when they search for trades in your area.",
    icon: MapPin,
    color: mkt.accent,     // #66E8FA
    features: [
      "Real-time Maps ranking tracker",
      "Competitor position monitoring",
      "Listing health & accuracy audits",
      "Local SEO recommendations",
    ],
  },
  {
    id: "quickquote",
    title: "QuickQuote",
    tagline: "Instant Estimates",
    description:
      "Give customers instant estimates right on your website. Our smart calculator turns browsers into booked jobs — no phone tag, no delays, no missed revenue.",
    icon: Calculator,
    color: mkt.orange,     // #F7B430
    features: [
      "Embeddable quote widget",
      "Custom pricing rules per trade",
      "Automatic follow-up emails",
      "Quote-to-booking conversion tracking",
    ],
  },
  {
    id: "tradeline",
    title: "24/7 TradeLine",
    tagline: "Never Miss a Call",
    description:
      "Never miss a job call again. Our 24/7 answering service captures every enquiry, books appointments, and sends you the details — even at 3 am.",
    icon: Phone,
    color: colors.status.success, // #10B981
    features: [
      "Round-the-clock call answering",
      "SMS & email lead notifications",
      "Appointment scheduling",
      "Missed-call text-back",
    ],
  },
  {
    id: "reputationshield",
    title: "ReputationShield",
    tagline: "5-Star Reviews",
    description:
      "Automatically request reviews after every job, monitor your online reputation, and respond to feedback. Turn happy customers into 5-star advocates.",
    icon: Shield,
    color: colors.accent.blue,   // #2F6BFF
    features: [
      "Automated review request campaigns",
      "Real-time sentiment alerts",
      "One-click review responses",
      "Reputation score dashboard",
    ],
  },
];

/* ── Layout modes ───────────────────────────────────────────────────── */

type Layout = "grid" | "list" | "stripes" | "stack";

const LAYOUTS: { id: Layout; label: string }[] = [
  { id: "grid", label: "Grid" },
  { id: "list", label: "List" },
  { id: "stripes", label: "Stripes" },
  { id: "stack", label: "Stack" },
];

/* ── Mini-visual per card ───────────────────────────────────────────── */

function CardVisual({ card, compact }: { card: ServiceCard; compact?: boolean }) {
  const Icon = card.icon;
  const size = compact ? 32 : 48;
  const subIcons = card.id === "mapguard"
    ? [Eye, TrendingUp, BarChart3]
    : card.id === "quickquote"
    ? [Zap, ChevronRight, Star]
    : card.id === "tradeline"
    ? [Clock, MessageSquare, Phone]
    : [Star, MessageSquare, TrendingUp];

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `radial-gradient(circle at 50% 60%, ${card.color}18 0%, transparent 70%)`,
        overflow: "hidden",
      }}
    >
      {/* dot grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.04) 0.8px, transparent 0.8px)",
          backgroundSize: "14px 14px",
          pointerEvents: "none",
        }}
      />

      {/* main icon */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: size * 1.8,
          height: size * 1.8,
          borderRadius: "50%",
          background: `${card.color}1A`,
          border: `1px solid ${card.color}33`,
          position: "relative",
          zIndex: 1,
        }}
      >
        <Icon size={size} strokeWidth={1.5} color={card.color} />
      </div>

      {/* orbiting sub-icons */}
      {!compact &&
        subIcons.map((Sub, i) => {
          const angle = -60 + i * 60;
          const r = 68;
          const x = Math.cos((angle * Math.PI) / 180) * r;
          const y = Math.sin((angle * Math.PI) / 180) * r;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `calc(50% + ${x}px - 14px)`,
                top: `calc(50% + ${y}px - 14px)`,
                width: 28,
                height: 28,
                borderRadius: 8,
                background: mkt.surface,
                border: `1px solid ${mkt.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1,
              }}
            >
              <Sub size={14} strokeWidth={1.5} color={card.color} />
            </div>
          );
        })}
    </div>
  );
}

/* ── Overlay / modal ────────────────────────────────────────────────── */

function CardOverlay({
  card,
  onClose,
}: {
  card: ServiceCard;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(
        ref.current,
        { opacity: 0, y: 40, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "power3.out" }
      );
    }
  }, []);

  const close = () => {
    if (ref.current) {
      gsap.to(ref.current, {
        opacity: 0,
        y: 30,
        scale: 0.97,
        duration: 0.25,
        ease: "power2.in",
        onComplete: onClose,
      });
    } else {
      onClose();
    }
  };

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
        padding: 24,
      }}
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 560,
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          background: mkt.surface,
          border: `1px solid ${card.color}44`,
          borderRadius: radius["2xl"],
          boxShadow: `0 24px 64px rgba(0,0,0,0.35), 0 0 0 1px ${card.color}22`,
        }}
      >
        {/* close */}
        <button
          onClick={close}
          style={{
            position: "sticky",
            top: 16,
            float: "right",
            marginRight: 16,
            marginTop: 16,
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: `1px solid ${mkt.border}`,
            background: mkt.surfaceAlt,
            color: mkt.text,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 2,
            fontSize: 18,
          }}
        >
          <X size={16} />
        </button>

        {/* image area */}
        <div style={{ aspectRatio: "2 / 1", width: "100%" }}>
          <CardVisual card={card} />
        </div>

        {/* text */}
        <div style={{ padding: "28px 32px 36px" }}>
          <span
            style={{
              display: "inline-block",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: card.color,
              background: `${card.color}1A`,
              padding: "3px 10px",
              borderRadius: 4,
              marginBottom: 12,
            }}
          >
            {card.tagline}
          </span>
          <h2
            style={{
              fontFamily: typography.fontFamily,
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: "-0.01em",
              color: mkt.text,
              margin: "0 0 12px",
            }}
          >
            {card.title}
          </h2>
          <p
            style={{
              fontFamily: typography.fontFamily,
              fontSize: 15,
              lineHeight: 1.6,
              color: mkt.textMuted,
              margin: "0 0 24px",
            }}
          >
            {card.description}
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {card.features.map((f, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderTop: i === 0 ? `1px solid ${mkt.border}` : undefined,
                  borderBottom: `1px solid ${mkt.border}`,
                  fontSize: 14,
                  color: mkt.text,
                  fontFamily: typography.fontFamily,
                }}
              >
                <Zap size={14} color={card.color} />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */

export default function ServiceCards() {
  const [layout, setLayout] = useState<Layout>("grid");
  const [openCard, setOpenCard] = useState<ServiceCard | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /* animate layout transitions */
  useEffect(() => {
    if (!rootRef.current) return;
    const cards = rootRef.current.querySelectorAll<HTMLElement>(".svc-card");
    if (!cards.length) return;

    if (layout === "stack") {
      cards.forEach((el, i) => {
        gsap.to(el, {
          y: -(cards.length - 1 - i) * 10,
          scale: 1 - (cards.length - 1 - i) * 0.03,
          rotateZ: (i % 2 === 0 ? 1 : -1) * (cards.length - 1 - i) * 1.5,
          duration: 0.45,
          ease: "power3.out",
          delay: i * 0.05,
        });
      });
    } else {
      cards.forEach((el, i) => {
        gsap.to(el, {
          y: 0,
          scale: 1,
          rotateZ: 0,
          duration: 0.35,
          ease: "power3.out",
          delay: i * 0.04,
        });
      });
    }
  }, [layout]);

  /* ── layout styles ─────────────────────────────────────────────── */

  const containerStyle: React.CSSProperties =
    layout === "grid"
      ? {
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 20,
        }
      : layout === "list"
      ? {
          display: "flex",
          flexDirection: "column",
          gap: 14,
          maxWidth: 640,
        }
      : layout === "stripes"
      ? {
          display: "flex",
          flexDirection: "row",
          gap: 0,
          height: 420,
        }
      : /* stack */ {
          display: "grid",
          placeContent: "center",
          height: 420,
        };

  const cardStyle = (card: ServiceCard, i: number): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "relative",
      cursor: "pointer",
      overflow: "hidden",
      background: mkt.surface,
      border: `1px solid ${mkt.border}`,
      borderRadius: radius.lg,
      fontFamily: typography.fontFamily,
      transition: "transform 0.15s ease-out, box-shadow 0.2s ease, border-color 0.2s ease",
      textDecoration: "none",
      color: mkt.text,
    };

    if (layout === "grid") {
      return {
        ...base,
        display: "flex",
        flexDirection: "column",
      };
    }
    if (layout === "list") {
      return {
        ...base,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
      };
    }
    if (layout === "stripes") {
      return {
        ...base,
        flex: 1,
        borderRadius: 0,
        borderLeft: i > 0 ? `1px solid ${mkt.border}` : undefined,
        display: "flex",
        flexDirection: "column",
        height: "100%",
      };
    }
    /* stack */
    return {
      ...base,
      gridArea: "1/1",
      width: 300,
      height: 320,
      display: "flex",
      flexDirection: "column",
    };
  };

  return (
    <section
      style={{
        width: "100%",
        padding: "0",
        fontFamily: typography.fontFamily,
      }}
    >
      <style>{`
        @media (max-width: 900px) {
          .svc-grid-container[data-layout="grid"] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .svc-grid-container[data-layout="stripes"] {
            flex-direction: column !important;
            height: auto !important;
          }
        }
        @media (max-width: 560px) {
          .svc-grid-container[data-layout="grid"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      {/* ── controls ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 28,
        }}
      >
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            onClick={() => setLayout(l.id)}
            style={{
              padding: "7px 16px",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: typography.fontFamily,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              border: `1px solid ${layout === l.id ? mkt.accent : mkt.border}`,
              borderRadius: radius.sm,
              background: layout === l.id ? `${mkt.accent}1A` : mkt.surface,
              color: layout === l.id ? mkt.accent : mkt.textMuted,
              cursor: "pointer",
              transition: "all 0.15s ease-out",
            }}
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* ── cards ─────────────────────────────────────────────────── */}
      <div ref={rootRef} className="svc-grid-container" data-layout={layout} style={containerStyle}>
        {SERVICES.map((card, i) => (
          <div
            key={card.id}
            className="svc-card"
            onClick={() => setOpenCard(card)}
            style={cardStyle(card, i)}
            onMouseEnter={(e) => {
              if (layout !== "stripes") {
                (e.currentTarget as HTMLElement).style.transform = layout === "stack" ? "" : "scale(1.025)";
              } else {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-8px)";
              }
              (e.currentTarget as HTMLElement).style.borderColor = `${card.color}66`;
              (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 32px ${card.color}22`;
            }}
            onMouseLeave={(e) => {
              if (layout !== "stack") {
                (e.currentTarget as HTMLElement).style.transform = "none";
              }
              (e.currentTarget as HTMLElement).style.borderColor = mkt.border;
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
            }}
          >
            {/* visual */}
            <div
              style={
                layout === "list"
                  ? { width: 80, height: 80, flexShrink: 0 }
                  : layout === "stripes"
                  ? { flex: 1, width: "100%" }
                  : { aspectRatio: "16 / 11", width: "100%" }
              }
            >
              <CardVisual card={card} compact={layout === "list"} />
            </div>

            {/* text */}
            <div
              style={{
                padding:
                  layout === "list"
                    ? "12px 16px"
                    : layout === "stripes"
                    ? "12px 14px"
                    : "14px 18px 18px",
                flex: layout === "list" ? 1 : undefined,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: layout === "stripes" ? 14 : 18,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  letterSpacing: "-0.01em",
                  color: mkt.text,
                }}
              >
                {card.title}
              </h3>

              {layout !== "stripes" && (
                <span
                  style={{
                    display: "inline-block",
                    marginTop: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: card.color,
                    background: `${card.color}1A`,
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  {card.tagline}
                </span>
              )}

              {(layout === "list" || layout === "grid") && (
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: mkt.textMuted,
                    display: layout === "grid" ? "none" : undefined,
                  }}
                >
                  {card.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── overlay ───────────────────────────────────────────────── */}
      {openCard && (
        <CardOverlay card={openCard} onClose={() => setOpenCard(null)} />
      )}
    </section>
  );
}
