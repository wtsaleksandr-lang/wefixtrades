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
    color: mkt.accent,
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
    color: mkt.orange,
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
    color: colors.status.success,
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
    color: colors.accent.blue,
    features: [
      "Automated review request campaigns",
      "Real-time sentiment alerts",
      "One-click review responses",
      "Reputation score dashboard",
    ],
  },
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
        background: "transparent",
        overflow: "hidden",
      }}
    >
      {/* dot grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.03) 0.8px, transparent 0.8px)",
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
          background: `${card.color}0D`,
          border: `1px solid ${card.color}1A`,
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
              <Sub size={14} strokeWidth={1.5} color={`${card.color}99`} />
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
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (backdropRef.current) {
      gsap.fromTo(
        backdropRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.35, ease: "power2.out" }
      );
    }
    if (panelRef.current) {
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, y: 60, scale: 0.92 },
        { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "power2.out", delay: 0.08 }
      );
    }
  }, []);

  const close = () => {
    const tl = gsap.timeline({
      onComplete: onClose,
    });
    if (panelRef.current) {
      tl.to(panelRef.current, {
        opacity: 0,
        y: 30,
        scale: 0.96,
        duration: 0.3,
        ease: "power2.inOut",
      }, 0);
    }
    if (backdropRef.current) {
      tl.to(backdropRef.current, {
        opacity: 0,
        duration: 0.3,
        ease: "power2.inOut",
      }, 0.05);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {/* backdrop */}
      <div
        ref={backdropRef}
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />

      {/* panel */}
      <div
        ref={panelRef}
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
  const [openCard, setOpenCard] = useState<ServiceCard | null>(null);

  return (
    <section
      style={{
        width: "100%",
        maxWidth: 1200,
        margin: "0 auto",
        padding: "48px 24px 56px",
        fontFamily: typography.fontFamily,
      }}
    >
      <style>{`
        @media (max-width: 900px) {
          .svc-grid-container {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 560px) {
          .svc-grid-container {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* ── cards grid ──────────────────────────────────────────── */}
      <div
        className="svc-grid-container"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 20,
        }}
      >
        {SERVICES.map((card) => (
          <div
            key={card.id}
            className="svc-card"
            onClick={() => setOpenCard(card)}
            style={{
              position: "relative",
              cursor: "pointer",
              overflow: "hidden",
              background: mkt.surface,
              border: `1px solid ${mkt.border}`,
              borderRadius: radius.lg,
              fontFamily: typography.fontFamily,
              transition: "transform 0.2s ease, box-shadow 0.25s ease, border-color 0.25s ease",
              textDecoration: "none",
              color: mkt.text,
              display: "flex",
              flexDirection: "column",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
              (e.currentTarget as HTMLElement).style.borderColor = `${card.color}44`;
              (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 32px ${card.color}15`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = "none";
              (e.currentTarget as HTMLElement).style.borderColor = mkt.border;
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
            }}
          >
            {/* visual */}
            <div style={{ aspectRatio: "16 / 11", width: "100%" }}>
              <CardVisual card={card} />
            </div>

            {/* text */}
            <div style={{ padding: "14px 18px 18px" }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  letterSpacing: "-0.01em",
                  color: mkt.text,
                }}
              >
                {card.title}
              </h3>

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
