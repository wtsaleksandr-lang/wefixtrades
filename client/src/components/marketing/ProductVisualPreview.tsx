import { useRef, useState } from "react";
import { mkt, shadows } from "@/theme/tokens";

export type VisualPreviewVariant =
  | "calculator"
  | "chat"
  | "voice"
  | "dashboard"
  | "website"
  | "social"
  | "reviews";

interface ProductVisualPreviewProps {
  variant: VisualPreviewVariant;
}

function BrowserDots() {
  return (
    <div style={{ display: "flex", gap: 6, padding: "12px 16px" }}>
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.12)",
        }}
      />
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.08)",
        }}
      />
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.06)",
        }}
      />
    </div>
  );
}

function CalculatorPreview() {
  return (
    <div style={{ padding: "0 20px 20px" }}>
      {/* Title bar */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: mkt.text,
          marginBottom: 16,
        }}
      >
        Get an Instant Estimate
      </div>

      {/* Service selector */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: mkt.textMuted,
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Service Type
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
          }}
        >
          {["Repair", "Install", "Maintenance"].map((s, i) => (
            <div
              key={s}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                background: i === 0 ? mkt.accentTint : "rgba(255,255,255,0.04)",
                color: i === 0 ? mkt.accent : mkt.textMuted,
                border: `1px solid ${i === 0 ? mkt.accent : mkt.border}`,
              }}
            >
              {s}
            </div>
          ))}
        </div>
      </div>

      {/* Input fields */}
      {["Number of rooms", "Square footage"].map((label) => (
        <div key={label} style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: mkt.textMuted,
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {label}
          </div>
          <div
            style={{
              height: 36,
              borderRadius: 8,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${mkt.border}`,
            }}
          />
        </div>
      ))}

      {/* Price display */}
      <div
        style={{
          marginTop: 16,
          padding: "14px 16px",
          borderRadius: 12,
          background: mkt.accentTint,
          border: `1px solid ${mkt.accent}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{ fontSize: 13, fontWeight: 600, color: mkt.textMuted }}
        >
          Estimated Price
        </span>
        <span style={{ fontSize: 24, fontWeight: 700, color: mkt.accent }}>
          $285
        </span>
      </div>

      {/* CTA button */}
      <div
        style={{
          marginTop: 12,
          padding: "10px 0",
          borderRadius: 10,
          background: mkt.accent,
          color: mkt.buttonText,
          fontSize: 13,
          fontWeight: 700,
          textAlign: "center",
        }}
      >
        Get Started
      </div>
    </div>
  );
}

function ChatPreview() {
  const messages = [
    {
      from: "bot",
      text: "Hi! I'm your 24/7 assistant. How can I help today?",
    },
    { from: "user", text: "I need a quote for drain cleaning" },
    {
      from: "bot",
      text: "Sure! For standard drain cleaning, our rate is $150–$220 depending on location. Want me to book a time?",
    },
  ];

  return (
    <div style={{ padding: "0 20px 20px" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.from === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "78%",
                padding: "10px 14px",
                borderRadius: 12,
                fontSize: 13,
                lineHeight: 1.5,
                fontWeight: 500,
                background:
                  msg.from === "user" ? mkt.accent : "rgba(255,255,255,0.06)",
                color:
                  msg.from === "user" ? mkt.buttonText : mkt.text,
                border:
                  msg.from === "user"
                    ? "none"
                    : `1px solid ${mkt.border}`,
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        <div style={{ display: "flex" }}>
          <div
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.06)",
              border: `1px solid ${mkt.border}`,
              display: "flex",
              gap: 4,
              alignItems: "center",
            }}
          >
            {[0, 1, 2].map((d) => (
              <div
                key={d}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: mkt.textMuted,
                  opacity: 0.5,
                  animation: `typingDot 1.2s ease-in-out ${d * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div
        style={{
          marginTop: 14,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <div
          style={{
            flex: 1,
            height: 36,
            borderRadius: 10,
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${mkt.border}`,
            padding: "0 12px",
            display: "flex",
            alignItems: "center",
            fontSize: 12,
            color: mkt.textFaint,
          }}
        >
          Type a message...
        </div>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: mkt.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke={mkt.buttonText}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function VoicePreview() {
  return (
    <div style={{ padding: "0 20px 20px" }}>
      {/* Active call header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          padding: "12px 14px",
          borderRadius: 12,
          background: "rgba(16,185,129,0.08)",
          border: "1px solid rgba(16,185,129,0.2)",
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: mkt.success,
            animation: "pulse-soft 2s ease-in-out infinite",
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: mkt.success }}>
          Call in progress
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            color: mkt.textMuted,
            fontFamily: "monospace",
          }}
        >
          02:34
        </span>
      </div>

      {/* Transcript */}
      <div style={{ fontSize: 11, fontWeight: 600, color: mkt.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Live transcript
      </div>
      {[
        { speaker: "Caller", text: "Hi, I need emergency plumbing help" },
        { speaker: "AI", text: "I can help! What's the issue?" },
        { speaker: "Caller", text: "Burst pipe in the kitchen" },
        { speaker: "AI", text: "I'll get someone out within the hour. Can I grab your address?" },
      ].map((line, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700, color: line.speaker === "AI" ? mkt.accent : mkt.orange, minWidth: 36 }}>
            {line.speaker}:
          </span>
          <span style={{ color: mkt.textMuted }}>{line.text}</span>
        </div>
      ))}
    </div>
  );
}

function DashboardPreview() {
  const metrics = [
    { label: "Rankings", value: "#3", change: "+2", up: true },
    { label: "Traffic", value: "1.2k", change: "+18%", up: true },
    { label: "Speed", value: "94", change: "+12", up: true },
  ];

  return (
    <div style={{ padding: "0 20px 20px" }}>
      {/* Metric cards */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {metrics.map((m) => (
          <div
            key={m.label}
            style={{
              flex: 1,
              padding: "12px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${mkt.border}`,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: mkt.textFaint,
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {m.label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                style={{ fontSize: 20, fontWeight: 700, color: mkt.text }}
              >
                {m.value}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: m.up ? mkt.success : mkt.danger,
                }}
              >
                {m.change}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart placeholder */}
      <div
        style={{
          height: 80,
          borderRadius: 10,
          background: "rgba(255,255,255,0.02)",
          border: `1px solid ${mkt.border}`,
          display: "flex",
          alignItems: "flex-end",
          gap: 6,
          padding: "10px 12px 8px",
        }}
      >
        {[35, 48, 42, 60, 55, 72, 68, 80, 75, 90, 85, 95].map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h}%`,
              borderRadius: 3,
              background:
                i >= 10
                  ? mkt.accent
                  : `rgba(102,232,250,${0.12 + i * 0.03})`,
            }}
          />
        ))}
      </div>

      {/* Status row */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 16,
          fontSize: 11,
          color: mkt.textMuted,
        }}
      >
        {[
          { label: "Core Web Vitals", status: "Pass", color: mkt.success },
          { label: "SSL", status: "Active", color: mkt.success },
          { label: "Uptime", status: "99.9%", color: mkt.accent },
        ].map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: s.color,
              }}
            />
            <span style={{ fontWeight: 500 }}>{s.label}:</span>
            <span style={{ fontWeight: 700, color: s.color }}>{s.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WebsitePreview() {
  return (
    <div style={{ padding: "0 20px 20px" }}>
      {/* Nav bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 0",
          marginBottom: 14,
          borderBottom: `1px solid ${mkt.border}`,
        }}
      >
        <div
          style={{
            width: 60,
            height: 14,
            borderRadius: 4,
            background: mkt.accent,
            opacity: 0.6,
          }}
        />
        <div style={{ display: "flex", gap: 12 }}>
          {[40, 35, 45].map((w, i) => (
            <div
              key={i}
              style={{
                width: w,
                height: 8,
                borderRadius: 3,
                background: "rgba(255,255,255,0.08)",
              }}
            />
          ))}
        </div>
      </div>

      {/* Hero area */}
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div
          style={{
            width: "70%",
            height: 14,
            borderRadius: 4,
            background: "rgba(255,255,255,0.12)",
            margin: "0 auto 8px",
          }}
        />
        <div
          style={{
            width: "50%",
            height: 10,
            borderRadius: 3,
            background: "rgba(255,255,255,0.06)",
            margin: "0 auto 12px",
          }}
        />
        <div
          style={{
            width: 80,
            height: 26,
            borderRadius: 6,
            background: mkt.accent,
            margin: "0 auto",
          }}
        />
      </div>

      {/* 3-col feature cards */}
      <div style={{ display: "flex", gap: 8 }}>
        {[1, 2, 3].map((c) => (
          <div
            key={c}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 8,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${mkt.border}`,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                background: mkt.accentTint,
                marginBottom: 6,
              }}
            />
            <div
              style={{
                height: 8,
                borderRadius: 3,
                background: "rgba(255,255,255,0.10)",
                marginBottom: 4,
              }}
            />
            <div
              style={{
                height: 6,
                width: "70%",
                borderRadius: 3,
                background: "rgba(255,255,255,0.05)",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SocialPreview() {
  return (
    <div style={{ padding: "0 20px 20px" }}>
      {/* Post card */}
      <div
        style={{
          borderRadius: 12,
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${mkt.border}`,
          overflow: "hidden",
          marginBottom: 10,
        }}
      >
        {/* Post image placeholder */}
        <div
          style={{
            height: 80,
            background: `linear-gradient(135deg, ${mkt.accentTint} 0%, ${mkt.orangeTint} 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={mkt.textFaint} strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </div>

        <div style={{ padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", gap: 12, fontSize: 11, color: mkt.textMuted }}>
              <span>142 likes</span>
              <span>8 comments</span>
            </div>
          </div>
          <div style={{ height: 8, width: "85%", borderRadius: 3, background: "rgba(255,255,255,0.08)", marginBottom: 4 }} />
          <div style={{ height: 6, width: "60%", borderRadius: 3, background: "rgba(255,255,255,0.05)" }} />
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { label: "Posts", value: "16" },
          { label: "Reach", value: "4.2k" },
          { label: "Leads", value: "12" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              flex: 1,
              padding: "10px 8px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${mkt.border}`,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: mkt.text }}>{s.value}</div>
            <div style={{ fontSize: 10, fontWeight: 500, color: mkt.textFaint }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewsPreview() {
  return (
    <div style={{ padding: "0 20px 20px" }}>
      {/* Overall rating */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
          padding: "12px 14px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${mkt.border}`,
        }}
      >
        <span style={{ fontSize: 28, fontWeight: 700, color: mkt.text }}>
          4.9
        </span>
        <div>
          <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <svg key={s} width="14" height="14" viewBox="0 0 24 24" fill={mkt.orange}>
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            ))}
          </div>
          <span style={{ fontSize: 11, color: mkt.textMuted }}>
            128 reviews
          </span>
        </div>
      </div>

      {/* Sample reviews */}
      {[
        { name: "Mike R.", text: "Fixed our leak same day. Great price.", stars: 5 },
        { name: "Sarah L.", text: "Professional and on time. Highly recommend!", stars: 5 },
      ].map((r, i) => (
        <div
          key={i}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${mkt.border}`,
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: mkt.text }}>{r.name}</span>
            <div style={{ display: "flex", gap: 1 }}>
              {Array.from({ length: r.stars }).map((_, s) => (
                <svg key={s} width="10" height="10" viewBox="0 0 24 24" fill={mkt.orange}>
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 12, color: mkt.textMuted, lineHeight: 1.5, margin: 0 }}>
            {r.text}
          </p>
        </div>
      ))}
    </div>
  );
}

const VARIANT_COMPONENTS: Record<VisualPreviewVariant, () => JSX.Element> = {
  calculator: CalculatorPreview,
  chat: ChatPreview,
  voice: VoicePreview,
  dashboard: DashboardPreview,
  website: WebsitePreview,
  social: SocialPreview,
  reviews: ReviewsPreview,
};

export default function ProductVisualPreview({
  variant,
}: ProductVisualPreviewProps) {
  const PreviewContent = VARIANT_COMPONENTS[variant];
  const frameRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ rotateX: -y * 6, rotateY: x * 6 });
  };

  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => {
    setIsHovering(false);
    setTilt({ rotateX: 0, rotateY: 0 });
  };

  const tiltTransform = isHovering
    ? `perspective(600px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) translateY(-4px)`
    : "perspective(600px) rotateX(0deg) rotateY(0deg) translateY(0px)";

  return (
    <>
      <style>{`
        @keyframes typingDot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        .product-visual-frame {
          transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.35s ease;
          will-change: transform;
        }
        @media (max-width: 640px) {
          .product-visual-frame {
            max-width: 320px;
            margin: 0 auto;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .product-visual-frame {
            transition: none !important;
          }
        }
      `}</style>

      <div
        ref={frameRef}
        className="product-visual-frame hero-enter"
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          background: mkt.bg,
          borderRadius: 16,
          border: `1px solid ${mkt.border}`,
          boxShadow: isHovering
            ? `0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(102,232,250,0.12)`
            : shadows.mega,
          overflow: "hidden",
          maxWidth: 420,
          margin: "0 auto",
          transform: tiltTransform,
        }}
      >
        <BrowserDots />
        <PreviewContent />
      </div>
    </>
  );
}
