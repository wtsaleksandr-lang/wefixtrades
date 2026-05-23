import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Copy, Check, ChevronDown, ChevronRight, ArrowLeft, Menu, X, Code, Globe, Calendar, Bot, Webhook, AlertCircle, BookOpen, Shield, Star } from "lucide-react";
import MarketingLayout from "./MarketingLayout";

import { mkt, colors, shadows } from "@/theme/tokens";

const C = {
  navy: colors.brand.dark,
  sage: colors.accent.blue,
  sageTint: colors.accent.blueTint,
  bg: mkt.bg,
  bgGray: colors.surface.muted,
  heading: colors.text.primary,
  body: colors.text.secondary,
  muted: colors.text.secondary,
  border: mkt.border,
  borderLight: mkt.borderLight,
  codeBase: colors.brand.dark,
  codeHeader: colors.brand.darkHover,
};

/* ─── Sidebar nav ────────────────────────────────── */
const NAV_ITEMS = [
  { slug: "embed", label: "Embed Guide", icon: Code },
  { slug: "domain", label: "Custom Domain", icon: Globe },
  { slug: "booking", label: "Booking + Deposits", icon: Calendar },
  { slug: "ai", label: "AI Employee", icon: Bot },
  { slug: "mapguard", label: "MapGuard", icon: Shield },
  { slug: "reputationshield", label: "ReputationShield", icon: Star },
  { slug: "webhooks", label: "Webhooks", icon: Webhook },
  { slug: "troubleshooting", label: "Troubleshooting", icon: AlertCircle },
];

/* ═══════════════════════════════════════════════════
   EXPORTED PRIMITIVES — import from this file
═══════════════════════════════════════════════════ */

/** Syntax-highlighted code block with copy button */
export function CodeBlock({ code, lang = "html" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };
  return (
    <div
      data-testid="code-block"
      data-theme="dark"
      style={{ background: C.codeBase, borderRadius: 12, overflow: "hidden", margin: "16px 0", fontSize: 13 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", background: C.codeHeader, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ color: "#94A3B8", fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{lang}</span>
        <button
          data-testid="copy-button"
          onClick={copy}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: copied ? "#6EE7B7" : "#94A3B8", fontSize: 12, fontWeight: 600, padding: "2px 6px", borderRadius: 4, transition: "color 0.2s" }}
        >
          {copied ? <Check size={12} strokeWidth={1.5} /> : <Copy size={12} strokeWidth={1.5} />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre style={{ padding: "18px 20px", margin: 0, color: "#E2E8F0", overflowX: "auto", fontFamily: "ui-monospace, SFMono-Regular, monospace", lineHeight: 1.6, whiteSpace: "pre" as const }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Numbered step block */
export function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 18, marginBottom: 28 }}>
      <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.sage, color: "#FFFFFF", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, boxShadow: `0 0 0 6px ${mkt.accentTint}` }}>
        {n}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.heading, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 15, color: C.body, lineHeight: 1.7 }}>{children}</div>
      </div>
    </div>
  );
}

/** Accordion panel */
export function Accordion({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: open ? C.bgGray : C.bg, border: "none", cursor: "pointer", textAlign: "left" as const, gap: 12 }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: C.heading, display: "flex", alignItems: "center", gap: 8 }}>
          {icon && <span>{icon}</span>}{title}
        </span>
        <ChevronDown size={16} color={C.muted} strokeWidth={1.5} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.22s ease" }} />
      </button>
      {open && (
        <div style={{ padding: "16px 20px 20px", background: C.bgGray, borderTop: `1px solid ${C.border}` }}>
          {children}
        </div>
      )}
    </div>
  );
}

/** Callout / info box */
export function InfoBox({ type = "info", children }: { type?: "info" | "warn" | "tip"; children: React.ReactNode }) {
  const styles = {
    info: { bg: "#EAF1FF", border: "#D4E2FF", icon: "ℹ️" },
    warn: { bg: "#FFFBEB", border: "#FDE68A", icon: "⚠️" },
    tip: { bg: C.sageTint, border: "#A7F3D0", icon: "💡" },
  }[type];
  return (
    <div style={{ background: styles.bg, border: `1px solid ${styles.border}`, borderRadius: 10, padding: "14px 18px", margin: "16px 0", fontSize: 14, color: C.body, lineHeight: 1.65, display: "flex", gap: 10 }}>
      <span style={{ flexShrink: 0 }}>{styles.icon}</span>
      <div>{children}</div>
    </div>
  );
}

/** Section heading inside doc page */
export function DocH2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 22, fontWeight: 800, color: C.heading, margin: "40px 0 16px", letterSpacing: "-0.01em", borderBottom: `1px solid ${C.borderLight}`, paddingBottom: 12 }}>{children}</h2>;
}

/** Section sub-heading */
export function DocH3({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 17, fontWeight: 700, color: C.heading, margin: "28px 0 10px" }}>{children}</h3>;
}

/** Simple bullet checklist */
export function Checklist({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: "12px 0", display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => (
        <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: C.body, lineHeight: 1.55 }}>
          <Check size={16} color={C.sage} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 1 }} />
          {item}
        </li>
      ))}
    </ul>
  );
}

/* ═══════════════════════════════════════════════════
   DOCS LAYOUT WRAPPER
═══════════════════════════════════════════════════ */
interface DocsLayoutProps {
  activeSlug: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

export default function DocsLayout({ activeSlug, title, description, children }: DocsLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [, navigate] = useLocation();

  return (
    <MarketingLayout>
      <div data-testid={`docs-page-${activeSlug}`} style={{ overflowX: "hidden" }}>

        {/* Mobile top bar */}
        <div className="docs-mobile-bar" style={{ display: "none", padding: "12px 20px", borderBottom: `1px solid ${C.border}`, background: C.bg, alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/docs" style={{ display: "flex", alignItems: "center", gap: 6, color: C.sage, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
            <ArrowLeft size={14} strokeWidth={1.5} /> Docs
          </Link>
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            data-testid="docs-mobile-menu"
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.body }}
          >
            {sidebarOpen ? <X size={14} strokeWidth={1.5} /> : <Menu size={14} strokeWidth={1.5} />} Menu
          </button>
        </div>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="docs-mobile-bar" style={{ display: "flex", flexDirection: "column", background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "12px 0" }}>
            <DocsSidebar activeSlug={activeSlug} onNavigate={() => setSidebarOpen(false)} />
          </div>
        )}

        <div style={{ display: "flex", maxWidth: 1200, margin: "0 auto", minHeight: "calc(100vh - 72px)" }}>
          {/* Desktop sidebar */}
          <aside
            data-testid="docs-sidebar"
            className="docs-desktop-sidebar"
            style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${C.border}`, position: "sticky" as const, top: 72, height: "calc(100vh - 72px)", overflowY: "auto", padding: "32px 0" }}
          >
            <div style={{ padding: "0 20px 16px", borderBottom: `1px solid ${C.borderLight}`, marginBottom: 16 }}>
              <Link href="/docs" style={{ display: "flex", alignItems: "center", gap: 7, color: C.muted, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                <ArrowLeft size={14} strokeWidth={1.5} /> Back to Docs
              </Link>
            </div>
            <DocsSidebar activeSlug={activeSlug} onNavigate={() => {}} />
          </aside>

          {/* Content */}
          <main data-testid="docs-content" style={{ flex: 1, padding: "48px 52px 80px", minWidth: 0 }}>
            {/* Page header */}
            <div style={{ marginBottom: 40 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 12, color: C.muted, fontWeight: 500 }}>
                <BookOpen size={14} color={C.muted} strokeWidth={1.5} />
                <span>QuoteQuick Pro Docs</span>
                <ChevronRight size={12} color={C.muted} strokeWidth={1.5} />
                <span style={{ color: C.sage, fontWeight: 600 }}>{title}</span>
              </div>
              <h1 style={{ fontSize: "clamp(24px, 3vw, 34px)", fontWeight: 800, color: C.heading, margin: "0 0 12px", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
                {title}
              </h1>
              <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.65, margin: 0, maxWidth: 600 }}>{description}</p>
            </div>

            {/* Page content */}
            {children}

            {/* Footer nav */}
            <div style={{ marginTop: 64, paddingTop: 28, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <Link href="/docs" style={{ display: "flex", alignItems: "center", gap: 6, color: C.sage, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                <ArrowLeft size={14} strokeWidth={1.5} /> Back to Docs Hub
              </Link>
              <Link href="/contact" style={{ display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
                Something unclear? Contact support →
              </Link>
            </div>
          </main>
        </div>

        <style>{`
          @media (max-width: 820px) {
            .docs-desktop-sidebar { display: none !important; }
            .docs-mobile-bar { display: flex !important; }
            [data-testid="docs-content"] { padding: 28px 20px 60px !important; }
          }
        `}</style>
      </div>
    </MarketingLayout>
  );
}

/* Sidebar nav links */
function DocsSidebar({ activeSlug, onNavigate }: { activeSlug: string; onNavigate: () => void }) {
  return (
    <nav data-testid="docs-nav">
      <div style={{ padding: "0 20px 10px", fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>
        Guides
      </div>
      {NAV_ITEMS.map(({ slug, label, icon: Icon }) => {
        const active = slug === activeSlug;
        return (
          <Link
            key={slug}
            href={`/docs/${slug}`}
            data-testid={`docs-nav-${slug}`}
            onClick={onNavigate}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 20px",
              textDecoration: "none",
              background: active ? `${C.sage}12` : "transparent",
              borderLeft: `3px solid ${active ? C.sage : "transparent"}`,
              transition: "all 0.15s ease",
            }}
          >
            <Icon size={16} color={active ? C.sage : C.muted} strokeWidth={1.5} />
            <span style={{ fontSize: 14, fontWeight: active ? 600 : 400, color: active ? C.sage : C.body }}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
