import { Link } from "wouter";
import { FOOTER_LINKS, FOOTER_LEGAL_LINKS } from "@/site/siteMap";
import { useAuth } from "@/hooks/useAuth";
import { mkt } from "@/theme/tokens";

const columns = Object.entries(FOOTER_LINKS) as [keyof typeof FOOTER_LINKS, typeof FOOTER_LINKS[keyof typeof FOOTER_LINKS]][];

function FooterLinkItem({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        data-testid={`footer-link-${label.toLowerCase().replace(/[\s()]/g, "-")}`}
        style={{
          color: mkt.onDarkFaint,
          textDecoration: "none",
          fontSize: 14,
          lineHeight: 1.5,
          transition: "color 0.15s ease-out",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = mkt.accent; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = mkt.onDarkFaint; }}
      >
        {label}
      </Link>
    </li>
  );
}

export default function Footer() {
  const { isAuthenticated, isPortalUser } = useAuth();

  return (
    <footer
      data-testid="footer"
      style={{ backgroundColor: mkt.dark, color: mkt.onDark }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "64px 24px 0",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 40,
          }}
        >
          {columns.map(([heading, links]) => (
            <div key={heading}>
              <h4
                data-testid={`footer-heading-${heading.toLowerCase()}`}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: mkt.onDarkMuted,
                  marginBottom: 16,
                }}
              >
                {heading}
              </h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {links.map((link) => (
                  <FooterLinkItem key={link.href} href={link.href} label={link.label} />
                ))}
              </ul>
            </div>
          ))}

          {/* Account column — auth-aware */}
          <div>
            <h4
              data-testid="footer-heading-account"
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: mkt.onDarkMuted,
                marginBottom: 16,
              }}
            >
              Account
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {!isAuthenticated && (
                <FooterLinkItem href="/login" label="Login" />
              )}
              {isAuthenticated && (
                <FooterLinkItem href="/Dashboard" label="Dashboard" />
              )}
              {isPortalUser && (
                <FooterLinkItem href="/Dashboard" label="Portal" />
              )}
            </ul>
          </div>
        </div>

        <div
          style={{
            borderTop: `1px solid ${mkt.onDarkBorder}`,
            marginTop: 56,
            padding: "24px 0",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            fontSize: 13,
            color: mkt.onDarkFaint,
          }}
        >
          <span data-testid="footer-copyright">
            &copy; {new Date().getFullYear()} WeFixTrades. All rights reserved.
          </span>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {FOOTER_LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                data-testid={`footer-link-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                style={{ color: mkt.onDarkFaint, textDecoration: "none", transition: "color 0.15s ease-out" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = mkt.accent; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = mkt.onDarkFaint; }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
