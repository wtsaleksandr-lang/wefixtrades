import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Sparkles, Send, Lock, Facebook, Instagram, MapPin, ThumbsUp, Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Globe } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { mkt } from "@/theme/tokens";

/* ─── Types ─── */
interface GeneratedPost {
  platform: string;
  content: string;
  hashtags: string[];
}

/* ─── Trade options ─── */
const TRADE_OPTIONS = [
  "Plumber",
  "Electrician",
  "Roofer",
  "HVAC Technician",
  "Cleaner",
  "Landscaper",
  "Painter",
  "General Contractor",
  "Handyman",
  "Tiler",
  "Carpenter",
  "Locksmith",
];

/* ─── Platform config ─── */
const PLATFORM_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  facebook: { label: "Facebook", color: "#1877F2", bg: "rgba(24,119,242,0.12)" },
  instagram: { label: "Instagram", color: "#E4405F", bg: "rgba(228,64,95,0.12)" },
  google_business: { label: "Google Business", color: "#4285F4", bg: "rgba(66,133,244,0.12)" },
};

function PlatformIcon({ platform, size = 16 }: { platform: string; size?: number }) {
  if (platform === "facebook") return <Facebook size={size} />;
  if (platform === "instagram") return <Instagram size={size} />;
  return <Globe size={size} />;
}

/* ─── Skeleton card for loading state ─── */
function SkeletonCard({ delay }: { delay: number }) {
  return (
    <div
      data-theme="dark"
      style={{
        background: mkt.surface,
        border: `1px solid ${mkt.border}`,
        borderRadius: 16,
        padding: 24,
        animation: `skeletonPulse 1.8s ease-in-out infinite`,
        animationDelay: `${delay}ms`,
        opacity: 0,
        animationFillMode: "forwards",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: mkt.surfaceAlt }} />
        <div>
          <div style={{ width: 120, height: 12, borderRadius: 6, background: mkt.surfaceAlt, marginBottom: 6 }} />
          <div style={{ width: 80, height: 10, borderRadius: 6, background: mkt.surfaceAlt }} />
        </div>
      </div>
      <div style={{ width: "100%", height: 10, borderRadius: 6, background: mkt.surfaceAlt, marginBottom: 8 }} />
      <div style={{ width: "85%", height: 10, borderRadius: 6, background: mkt.surfaceAlt, marginBottom: 8 }} />
      <div style={{ width: "60%", height: 10, borderRadius: 6, background: mkt.surfaceAlt }} />
    </div>
  );
}

/* ─── Social post card ─── */
function PostCard({ post, index, bizName }: { post: GeneratedPost; index: number; bizName: string }) {
  const config = PLATFORM_CONFIG[post.platform] || PLATFORM_CONFIG.facebook;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), index * 180);
    return () => clearTimeout(timer);
  }, [index]);

  return (
    <div
      style={{
        background: mkt.surface,
        border: `1px solid ${mkt.border}`,
        borderRadius: 16,
        overflow: "hidden",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}
    >
      {/* Platform header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: `1px solid ${mkt.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${config.color}, ${mkt.accent})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {bizName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: mkt.text, lineHeight: 1.3 }}>
              {bizName}
            </div>
            <div style={{ fontSize: 11, color: mkt.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
              <PlatformIcon platform={post.platform} size={12} />
              {config.label}
            </div>
          </div>
        </div>
        <MoreHorizontal size={16} color={mkt.textMuted} />
      </div>

      {/* Post content */}
      <div style={{ padding: "16px 18px" }}>
        <p style={{ fontSize: 14, color: mkt.text, lineHeight: 1.65, margin: 0, whiteSpace: "pre-wrap" }}>
          {post.content}
        </p>
        {post.hashtags.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {post.hashtags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 12,
                  color: mkt.accent,
                  fontWeight: 500,
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Engagement bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 18px",
          borderTop: `1px solid ${mkt.border}`,
        }}
      >
        {post.platform === "instagram" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Heart size={20} color={mkt.textMuted} />
            <MessageCircle size={20} color={mkt.textMuted} />
            <Send size={20} color={mkt.textMuted} />
            <div style={{ flex: 1 }} />
            <Bookmark size={20} color={mkt.textMuted} />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: mkt.textMuted, fontSize: 13 }}>
              <ThumbsUp size={16} /> Like
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: mkt.textMuted, fontSize: 13 }}>
              <MessageCircle size={16} /> Comment
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: mkt.textMuted, fontSize: 13 }}>
              <Share2 size={16} /> Share
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Email gate overlay ─── */
function EmailGate({ onSubmit }: { onSubmit: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await fetch("/api/demo-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          trade: "social-media",
          source_tool: "socialsync-demo",
          source_page: "/demos/socialsync",
        }),
      });
    } catch {
      // Non-blocking — continue even if lead capture fails
    }
    setSubmitting(false);
    onSubmit(trimmed);
  };

  return (
    <div
      style={{
        position: "relative",
        background: `linear-gradient(135deg, rgba(13,60,252,0.08) 0%, rgba(13,60,252,0.02) 100%)`,
        border: `1px solid ${mkt.accent}`,
        borderRadius: 20,
        padding: "36px 28px",
        textAlign: "center",
        maxWidth: 480,
        margin: "32px auto 0",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: "rgba(13,60,252,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px",
        }}
      >
        <Lock size={24} color={mkt.accent} />
      </div>
      <h3
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: mkt.text,
          marginBottom: 8,
          letterSpacing: "-0.02em",
        }}
      >
        Save these posts & generate more
      </h3>
      <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.55, marginBottom: 20 }}>
        Enter your email to unlock unlimited post generation and save your favorites.
      </p>
      <div style={{ display: "flex", gap: 10, maxWidth: 360, margin: "0 auto" }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="you@business.com"
          style={{
            flex: 1,
            padding: "12px 16px",
            borderRadius: 10,
            border: `1px solid ${error ? "rgba(239,68,68,0.5)" : mkt.border}`,
            background: mkt.bg,
            color: mkt.text,
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="wft-hover-border-white"
          style={{
            padding: "12px 20px",
            borderRadius: 10,
            border: "none",
            background: mkt.accent,
            color: "#FFFFFF",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            opacity: submitting ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {submitting ? "..." : "Unlock"}
        </button>
      </div>
      {error && (
        <p style={{ fontSize: 12, color: "#EF4444", marginTop: 8 }}>{error}</p>
      )}
    </div>
  );
}

/* ─── Main component ─── */
export default function SocialSyncDemo() {
  const [tradeType, setTradeType] = useState("");
  const [city, setCity] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [posts, setPosts] = useState<GeneratedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewedCount, setViewedCount] = useState(0);
  const [emailUnlocked, setEmailUnlocked] = useState(false);
  const [generated, setGenerated] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Track post views
  useEffect(() => {
    if (posts.length > 0) {
      const timer = setTimeout(() => setViewedCount(3), 3000);
      return () => clearTimeout(timer);
    }
  }, [posts]);

  const showEmailGate = viewedCount >= 3 && !emailUnlocked && posts.length > 0;

  const handleGenerate = async () => {
    if (!tradeType || !city) {
      setError("Please select your trade and enter your city.");
      return;
    }
    setError("");
    setLoading(true);
    setPosts([]);
    setGenerated(false);

    try {
      const resp = await fetch("/api/demos/socialsync/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade_type: tradeType,
          city,
          business_name: businessName || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Generation failed");
      setPosts(data.posts || []);
      setGenerated(true);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const displayName = businessName || (city && tradeType ? `${city} ${tradeType}` : "Your Business");

  return (
    <MarketingLayout>
      <PageMeta
        title="SocialSync Demo — generate trade-specific social posts in seconds"
        description="Try the SocialSync demo. Pick your trade and city, and watch AI draft Facebook, Instagram, and Google Business posts in your voice — ready to schedule."
        canonical="/demos/socialsync"
      />
      <style>{`
        @keyframes skeletonPulse {
          0% { opacity: 0.3; }
          50% { opacity: 0.6; }
          100% { opacity: 0.3; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .socialsync-input:focus {
          border-color: ${mkt.accent} !important;
          box-shadow: 0 0 0 3px rgba(13,60,252,0.15) !important;
        }
        .socialsync-select:focus {
          border-color: ${mkt.accent} !important;
          box-shadow: 0 0 0 3px rgba(13,60,252,0.15) !important;
        }
        .gen-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(13,60,252,0.25);
        }
      `}</style>

      <div data-testid="socialsync-demo-page">
        {/* Hero */}
        <section
          style={{
            background: `linear-gradient(160deg, ${mkt.dark} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "100px 28px 72px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Ambient glow */}
          <div
            style={{
              position: "absolute",
              top: -120,
              right: -60,
              width: 500,
              height: 500,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(13,60,252,0.12) 0%, transparent 70%)",
              pointerEvents: "none",
              animation: "float 6s ease-in-out infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -80,
              left: -100,
              width: 350,
              height: 350,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(228,64,95,0.08) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
            <Link
              href="/demos"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                color: mkt.onDarkFaint,
                textDecoration: "none",
                marginBottom: 28,
              }}
            >
              <ArrowLeft size={14} />
              Back to Demo Center
            </Link>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(13,60,252,0.10)",
                border: `1px solid rgba(13,60,252,0.25)`,
                borderRadius: 20,
                padding: "5px 14px",
                marginBottom: 20,
              }}
            >
              <Sparkles size={12} color={mkt.accent} />
              <span style={{ fontSize: 12, fontWeight: 700, color: mkt.accent, letterSpacing: "0.04em" }}>
                AI-POWERED DEMO
              </span>
            </div>

            <h1
              data-testid="text-socialsync-demo-title"
              style={{
                fontSize: "clamp(32px, 4.5vw, 52px)",
                fontWeight: 700,
                color: mkt.onDark,
                lineHeight: 1.08,
                letterSpacing: "-0.035em",
                marginBottom: 16,
              }}
            >
              SocialSync Post Generator
            </h1>
            <p
              style={{
                fontSize: "clamp(15px, 1.7vw, 18px)",
                color: mkt.onDarkFaint,
                lineHeight: 1.65,
                maxWidth: 540,
                marginBottom: 0,
              }}
            >
              See what AI-generated social media posts look like for your trade.
              Enter your details and get 5 ready-to-post samples in seconds.
            </p>
          </div>
        </section>

        {/* Generator form */}
        <section style={{ background: mkt.bg, padding: "56px 28px 40px" }}>
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <div
              style={{
                background: mkt.surface,
                border: `1px solid ${mkt.border}`,
                borderRadius: 20,
                padding: "32px 28px",
              }}
            >
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: mkt.text,
                  marginBottom: 6,
                  letterSpacing: "-0.02em",
                }}
              >
                Generate your posts
              </h2>
              <p style={{ fontSize: 14, color: mkt.textMuted, marginBottom: 24, lineHeight: 1.5 }}>
                Tell us about your business and we will create 5 platform-specific posts.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Trade type */}
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: mkt.textMuted, marginBottom: 6 }}>
                    Your trade *
                  </label>
                  <select
                    className="socialsync-select"
                    value={tradeType}
                    onChange={(e) => setTradeType(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: `1px solid ${mkt.border}`,
                      background: mkt.bg,
                      color: tradeType ? mkt.text : mkt.textMuted,
                      fontSize: 14,
                      outline: "none",
                      cursor: "pointer",
                      appearance: "none",
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2392A6B0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 14px center",
                    }}
                  >
                    <option value="" disabled>Select your trade...</option>
                    {TRADE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* City */}
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: mkt.textMuted, marginBottom: 6 }}>
                    City / Area *
                  </label>
                  <div style={{ position: "relative" }}>
                    <MapPin
                      size={16}
                      color={mkt.textMuted}
                      style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}
                    />
                    <input
                      className="socialsync-input"
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Manchester, Denver, Toronto"
                      style={{
                        width: "100%",
                        padding: "12px 16px 12px 38px",
                        borderRadius: 10,
                        border: `1px solid ${mkt.border}`,
                        background: mkt.bg,
                        color: mkt.text,
                        fontSize: 14,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                {/* Business name (optional) */}
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: mkt.textMuted, marginBottom: 6 }}>
                    Business name <span style={{ fontWeight: 400, color: mkt.textFaint }}>(optional)</span>
                  </label>
                  <input
                    className="socialsync-input"
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Smith Plumbing"
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 10,
                      border: `1px solid ${mkt.border}`,
                      background: mkt.bg,
                      color: mkt.text,
                      fontSize: 14,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {error && (
                  <p style={{ fontSize: 13, color: "#EF4444", margin: 0 }}>{error}</p>
                )}

                <button
                  className="gen-btn"
                  onClick={handleGenerate}
                  disabled={loading}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    width: "100%",
                    padding: "14px 24px",
                    borderRadius: 12,
                    border: "none",
                    background: loading
                      ? `linear-gradient(90deg, ${mkt.accent}, ${mkt.accentHover}, ${mkt.accent})`
                      : mkt.accent,
                    backgroundSize: loading ? "200% 100%" : undefined,
                    animation: loading ? "gradientShift 1.5s ease infinite" : undefined,
                    color: mkt.onDark,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: loading ? "wait" : "pointer",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  }}
                >
                  {loading ? (
                    <>
                      <Sparkles size={16} style={{ animation: "float 1s ease-in-out infinite" }} />
                      Generating posts...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Generate Sample Posts
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Loading state */}
        {loading && (
          <section style={{ background: mkt.bg, padding: "0 28px 56px" }}>
            <div style={{ maxWidth: 600, margin: "0 auto" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[0, 1, 2].map((i) => (
                  <SkeletonCard key={i} delay={i * 200} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Results */}
        {generated && posts.length > 0 && !loading && (
          <section ref={resultsRef} style={{ background: mkt.bg, padding: "0 28px 64px" }}>
            <div style={{ maxWidth: 600, margin: "0 auto" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <h2
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: mkt.text,
                    letterSpacing: "-0.02em",
                    margin: 0,
                  }}
                >
                  Your posts for {displayName}
                </h2>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: mkt.accent,
                    background: "rgba(13,60,252,0.10)",
                    padding: "4px 10px",
                    borderRadius: 8,
                  }}
                >
                  {posts.length} posts
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Show first 3 posts always */}
                {posts.slice(0, 3).map((post, i) => (
                  <PostCard key={i} post={post} index={i} bizName={displayName} />
                ))}

                {/* Email gate after 3 posts */}
                {showEmailGate && <EmailGate onSubmit={() => setEmailUnlocked(true)} />}

                {/* Show remaining posts if unlocked */}
                {emailUnlocked && posts.slice(3).map((post, i) => (
                  <PostCard key={i + 3} post={post} index={i} bizName={displayName} />
                ))}

                {/* After unlock — show remaining posts were hidden */}
                {!emailUnlocked && posts.length > 3 && !showEmailGate && (
                  <div style={{ textAlign: "center", padding: 20 }}>
                    <p style={{ fontSize: 14, color: mkt.textMuted }}>
                      {posts.length - 3} more posts available after unlocking
                    </p>
                  </div>
                )}
              </div>

              {/* CTA after posts */}
              {emailUnlocked && (
                <div
                  style={{
                    marginTop: 32,
                    padding: "28px 24px",
                    background: `linear-gradient(135deg, rgba(13,60,252,0.06) 0%, rgba(13,60,252,0.02) 100%)`,
                    border: `1px solid ${mkt.border}`,
                    borderRadius: 16,
                    textAlign: "center",
                  }}
                >
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: mkt.text, marginBottom: 8 }}>
                    Want posts like these every week?
                  </h3>
                  <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.55, marginBottom: 20 }}>
                    SocialSync creates and publishes AI-powered posts across Facebook, Instagram,
                    and Google Business Profile automatically.
                  </p>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                    <Link
                      href="/wizard"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "12px 24px",
                        borderRadius: 10,
                        background: mkt.accent,
                        color: mkt.onDark,
                        fontSize: 14,
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Start SocialSync <ArrowRight size={14} />
                    </Link>
                    <Link
                      href="/products/socialsync"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "12px 24px",
                        borderRadius: 10,
                        background: "transparent",
                        color: mkt.text,
                        fontSize: 14,
                        fontWeight: 600,
                        textDecoration: "none",
                        border: `1px solid ${mkt.border}`,
                      }}
                    >
                      Learn More
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Bottom CTA */}
        <section
          style={{
            background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`,
            padding: "64px 28px",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 520, margin: "0 auto" }}>
            <h2
              style={{
                fontSize: "clamp(22px, 3vw, 34px)",
                fontWeight: 700,
                color: mkt.dark,
                letterSpacing: "-0.025em",
                marginBottom: 12,
                lineHeight: 1.12,
              }}
            >
              Ready for consistent social posting?
            </h2>
            <p
              style={{
                fontSize: 15,
                color: "rgba(23,24,24,0.7)",
                lineHeight: 1.55,
                marginBottom: 28,
              }}
            >
              SocialSync handles everything — content creation, scheduling, and publishing
              across all your platforms.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/wizard"
                style={{
                  display: "inline-block",
                  padding: "14px 32px",
                  borderRadius: 9999,
                  background: mkt.dark,
                  color: mkt.accent,
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Start Free Trial
              </Link>
              <Link
                href="/pricing"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "14px 24px",
                  borderRadius: 9999,
                  background: "transparent",
                  color: mkt.dark,
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: "none",
                  border: "1.5px solid rgba(23,24,24,0.2)",
                }}
              >
                View Pricing
              </Link>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
