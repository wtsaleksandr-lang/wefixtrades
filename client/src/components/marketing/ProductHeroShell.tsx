import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import HeroGridGlow from "./HeroGridGlow";
import TrustMarquee from "./TrustMarquee";
import { mkt } from "@/theme/tokens";

interface ProductHeroShellProps {
  children: ReactNode;
  visual?: ReactNode;
  showTrustMarquee?: boolean;
}

/**
 * Rounded hero shell matching homepage pattern:
 * mkt.bg backdrop → rounded surface container → grid glow + content + optional visual + trust marquee.
 */
export default function ProductHeroShell({
  children,
  visual,
  showTrustMarquee = true,
}: ProductHeroShellProps) {
  const heroRef = useRef<HTMLDivElement>(null);

  // Hero entrance stagger — same as homepage
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = heroRef.current;
    if (!el) return;
    const targets = el.querySelectorAll(".hero-enter");
    if (targets.length === 0) return;
    gsap.fromTo(
      targets,
      { y: 36, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.78,
        stagger: 0.13,
        ease: "cubic-bezier(0.526, 0.007, 0, 0.989)",
        delay: 0.1,
      },
    );
  }, []);

  return (
    <>
      <style>{`
        .product-hero-shell {
          min-height: 640px;
        }
        @media (min-width: 768px) {
          .product-hero-shell { min-height: 720px; }
        }
        @media (max-width: 768px) {
          .product-hero-backdrop { padding: 10px 8px 0 !important; }
          .product-hero-shell { border-radius: 20px !important; }
        }
        @media (max-width: 430px) {
          .product-hero-backdrop { padding: 8px 6px 0 !important; }
          .product-hero-shell { border-radius: 18px !important; }
        }
      `}</style>

      <div
        className="product-hero-backdrop"
        style={{
          background: mkt.bg,
          padding: "16px 16px 0",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          className="product-hero-shell"
          style={{
            position: "relative",
            background: mkt.surface,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            width: "100%",
            borderRadius: 24,
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow:
              "0 20px 60px rgba(0,0,0,0.25), 0 4px 20px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {/* Inner lighting overlay */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to bottom, rgba(255,255,255,0.02), rgba(0,0,0,0.2))",
              pointerEvents: "none",
              zIndex: 0,
              borderRadius: "inherit",
            }}
          />

          <HeroGridGlow showCrosshairs />

          {/* Hero content area */}
          <section
            ref={heroRef}
            style={{
              background: "transparent",
              padding: "120px 28px 48px",
              position: "relative",
            }}
          >
            {/* Readability vignette */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "50%",
                top: "40%",
                transform: "translate(-50%, -50%)",
                width: "70%",
                maxWidth: 1000,
                height: "60%",
                background:
                  "radial-gradient(ellipse at center, rgba(34,40,42,0.95) 0%, rgba(34,40,42,0.82) 20%, rgba(34,40,42,0.58) 38%, rgba(34,40,42,0.22) 58%, rgba(34,40,42,0.06) 74%, transparent 90%)",
                pointerEvents: "none",
                zIndex: 1,
              }}
            />

            {/* Accent glow */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: "30%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 800,
                height: 500,
                background:
                  "radial-gradient(ellipse at center, rgba(102,232,250,0.08) 0%, rgba(102,232,250,0.03) 40%, transparent 70%)",
                pointerEvents: "none",
                zIndex: 1,
              }}
            />

            <div
              style={{
                maxWidth: 720,
                margin: "0 auto",
                textAlign: "center",
                position: "relative",
                zIndex: 2,
              }}
            >
              {children}
            </div>
          </section>

          {/* Visual preview area — below hero text, inside the shell */}
          {visual && (
            <div
              style={{
                position: "relative",
                zIndex: 2,
                padding: "0 28px 40px",
                maxWidth: 900,
                margin: "0 auto",
                width: "100%",
              }}
            >
              {visual}
            </div>
          )}

          {/* Trust marquee at bottom of shell */}
          {showTrustMarquee && (
            <div style={{ marginTop: "auto", paddingTop: 20 }}>
              <TrustMarquee />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
