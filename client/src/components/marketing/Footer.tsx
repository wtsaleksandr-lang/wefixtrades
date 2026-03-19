import { type CSSProperties } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { mkt } from "@/theme/tokens";

const ftLink: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 400,
  color: "rgba(255,255,255,0.5)",
  textDecoration: "none",
  lineHeight: 1.4,
  padding: "7px 0",
  transition: "color 0.15s ease",
};

const ftHeading: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "rgba(255,255,255,0.3)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: 16,
};

function FtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      data-testid={`footer-link-${String(children).toLowerCase().replace(/[\s&()]+/g, "-")}`}
      style={ftLink}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.85)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = ftLink.color as string; }}
    >
      {children}
    </Link>
  );
}

export default function Footer() {
  const { isAuthenticated, isPortalUser } = useAuth();

  return (
    <footer
      data-testid="footer"
      style={{
        borderTop: "1px solid rgba(255,255,255,0.06)",
        backgroundColor: mkt.dark,
        color: mkt.onDark,
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "64px 24px 36px",
        }}
      >
        {/* 3-column grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr",
            gap: 48,
            marginBottom: 48,
          }}
        >
          {/* Col 1 — Brand */}
          <div>
            <p
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "rgba(255,255,255,0.7)",
                margin: "0 0 10px",
              }}
            >
              WeFixTrades
            </p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.65, maxWidth: 280, margin: 0 }}>
              Quote tools and AI workflows for modern service businesses.
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", lineHeight: 1.5, margin: "12px 0 0" }}>
              Built for speed, clarity, and conversion.
            </p>
          </div>

          {/* Col 2 — Company */}
          <div>
            <div style={ftHeading}>Company</div>
            <FtLink href="/about">About</FtLink>
            <FtLink href="/contact">Contact</FtLink>
          </div>

          {/* Col 3 — Legal + Access */}
          <div>
            <div style={ftHeading}>Legal</div>
            <FtLink href="/privacy">Privacy Policy</FtLink>
            <FtLink href="/terms">Terms</FtLink>

            {!isAuthenticated && (
              <FtLink href="/login">Login</FtLink>
            )}
            {isAuthenticated && (
              <FtLink href="/dashboard">Dashboard</FtLink>
            )}
            {isPortalUser && (
              <Link
                href="/dashboard"
                data-testid="footer-link-portal"
                style={{
                  ...ftLink,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.28)",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.28)"; }}
              >
                Portal
              </Link>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            borderTop: `1px solid ${mkt.onDarkBorder}`,
            paddingTop: 20,
            fontSize: 12,
            color: mkt.onDarkFaint,
          }}
        >
          <span data-testid="footer-copyright">
            &copy; {new Date().getFullYear()} WeFixTrades
          </span>
        </div>
      </div>
    </footer>
  );
}
