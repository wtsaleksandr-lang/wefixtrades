import { useEffect, lazy, Suspense, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ShieldCheck, Lock, Award } from "lucide-react";
import { usePageView } from "@/hooks/usePageView";
import { useLenis } from "@/hooks/useLenis";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";
import { mkt } from "@/theme/tokens";
import { MarketingNav, useNavIsMobile } from "./navigation/MarketingNav";

const SiteChatWidget = lazy(() => import("@/components/SiteChatWidget"));

/* ─── Footer ─── */

const ftLink: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 400,
  color: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  lineHeight: 1.3,
  padding: "5px 0",
  transition: "color 0.15s ease",
};

const ftHeading: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: mkt.accent,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  paddingBottom: 10,
  marginBottom: 12,
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

function FtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={ftLink}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.85)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = ftLink.color as string; }}
    >
      {children}
    </Link>
  );
}

function MarketingFooter({ isMobile }: { isMobile: boolean }) {
  const { isAuthenticated, isPortalUser } = useAuth();

  return (
    <footer
      data-testid="footer-marketing"
      style={{
        borderTop: "1px solid rgba(255,255,255,0.06)",
        background: "#0a0d0f",
        color: "rgba(255,255,255,0.5)",
      }}
    >
      {/* ── Main footer grid ───────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px 0" }}>
        <div className="mkt-footer-grid">
          {/* Col 1 — Products (core only) */}
          <div>
            <div style={ftHeading}>Products</div>
            <FtLink href="/products/tradeline">24/7 TradeLine™</FtLink>
            <FtLink href="/products/quickquotepro">QuoteQuick Pro™</FtLink>
            <FtLink href="/products/mapguard">MapGuard™</FtLink>
            <FtLink href="/products/reputationshield">ReputationShield™</FtLink>
            <FtLink href="/products/socialsync">SocialSync™</FtLink>
            <Link
              href="/products"
              style={{
                ...ftLink,
                fontSize: 12,
                fontWeight: 500,
                color: mkt.accent,
                marginTop: 6,
                opacity: 0.7,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
            >
              View All Products →
            </Link>
          </div>

          {/* Col 2 — Solutions (grouped) */}
          <div>
            <div style={ftHeading}>Solutions</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 6 }}>By Trade</div>
            <FtLink href="/solutions/for-plumbers">Plumbing</FtLink>
            <FtLink href="/solutions/for-hvac">HVAC</FtLink>
            <FtLink href="/solutions/for-electricians">Electrical</FtLink>
            <FtLink href="/solutions/for-roofers">Roofing</FtLink>
            <FtLink href="/solutions/for-cleaners">Cleaning</FtLink>
            <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginTop: 10, marginBottom: 6 }}>By Goal</div>
            <FtLink href="/products/tradeline">Get more calls</FtLink>
            <FtLink href="/products/quickquotepro">Automate quotes</FtLink>
            <FtLink href="/products/mapguard">Improve Google ranking</FtLink>
            <FtLink href="/products/reputationshield">Get more reviews</FtLink>
            <Link
              href="/solutions/for-plumbers"
              style={{
                ...ftLink,
                fontSize: 12,
                fontWeight: 500,
                color: mkt.accent,
                marginTop: 6,
                opacity: 0.7,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
            >
              View All Solutions →
            </Link>
          </div>

          {/* Col 3 — Resources */}
          <div>
            <div style={ftHeading}>Resources</div>
            <FtLink href="/about">About Us</FtLink>
            <FtLink href="/contact">Contact Sales</FtLink>
            <FtLink href="/pricing">Pricing</FtLink>
            {!isAuthenticated && <FtLink href="/login">Login</FtLink>}
            {isAuthenticated && <FtLink href="/dashboard">Dashboard</FtLink>}
          </div>

          {/* Col 4 — Free Tools */}
          <div>
            <div style={ftHeading}>Free Tools</div>
            <FtLink href="/tools/free-audit">Google Business Audit</FtLink>
            <FtLink href="/tools/missed-call-calculator">Missed Call Calculator</FtLink>
            <FtLink href="/tools/quote-demo">Instant Quote Demo</FtLink>
          </div>

          {/* Col 5 — Legal */}
          <div>
            <div style={ftHeading}>Legal</div>
            <FtLink href="/privacy">Privacy Policy</FtLink>
            <FtLink href="/terms">Terms of Service</FtLink>
            <FtLink href="/terms">Cookie Policy</FtLink>
            <FtLink href="/terms">GDPR</FtLink>
            {isAuthenticated && (
              <button
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
                  queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
                }}
                style={{
                  ...ftLink,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.28)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "5px 0",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.28)"; }}
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Divider ────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 36 }} />
      </div>

      {/* ── Corporate bottom bar ───────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px 16px" }}>
        {/* Trust badges */}
        <div className="mkt-footer-trust" style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.25)", fontSize: 11, fontWeight: 500 }}>
            <ShieldCheck size={14} strokeWidth={1.5} />
            <span>SOC 2 Compliant</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.25)", fontSize: 11, fontWeight: 500 }}>
            <Lock size={14} strokeWidth={1.5} />
            <span>256-bit SSL Encrypted</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.25)", fontSize: 11, fontWeight: 500 }}>
            <Award size={14} strokeWidth={1.5} />
            <span>GDPR Ready</span>
          </div>
        </div>

        {/* Company info + copyright */}
        <div className="mkt-footer-bottom" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", margin: "0 0 4px", lineHeight: 1.5 }}>
              &copy; {new Date().getFullYear()} WeFixTrades Inc. All rights reserved.
            </p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.14)", margin: 0, lineHeight: 1.5, maxWidth: 480 }}>
              WeFixTrades Inc. is a registered technology company. Business Registration No. 2024-WFT-0847.
              Registered office: 1200 Market Street, Suite 400, Wilmington, DE 19801, United States.
            </p>
          </div>
          <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
            <Link href="/privacy" style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textDecoration: "none" }}>Privacy</Link>
            <Link href="/terms" style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textDecoration: "none" }}>Terms</Link>
            <Link href="/terms" style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textDecoration: "none" }}>Cookies</Link>
            <Link href="/admin/crm" style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textDecoration: "none" }}>Admin</Link>
          </div>
        </div>
      </div>

      {/* ── Responsive CSS ─────────────────────────────────────────── */}
      <style>{`
        .mkt-footer-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 40px;
        }
        @media (max-width: 768px) {
          .mkt-footer-grid {
            grid-template-columns: 1fr 1fr;
            gap: 32px 24px;
          }
        }
        @media (max-width: 520px) {
          .mkt-footer-grid {
            grid-template-columns: 1fr;
            gap: 28px;
          }
        }
        @media (max-width: 640px) {
          .mkt-footer-bottom {
            flex-direction: column !important;
          }
          .mkt-footer-trust {
            gap: 12px !important;
          }
        }
      `}</style>
    </footer>
  );
}

export default function MarketingLayout({ children }: { children: ReactNode }) {
  useLenis();
  const [location] = useLocation();
  const isMobile = useNavIsMobile();
  usePageView(location);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (window.location.hash) return;
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [location]);

  return (
    <div
      className="mkt-layout"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        textRendering: "optimizeLegibility",
        background: mkt.bg,
      }}
    >
      <MarketingNav />
      <div style={{ height: 24, flexShrink: 0 }} />
      <main style={{ flex: 1 }}>{children}</main>
      <MarketingFooter isMobile={isMobile} />
      <Suspense fallback={null}>
        <SiteChatWidget />
      </Suspense>
    </div>
  );
}
