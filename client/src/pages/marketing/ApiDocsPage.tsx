import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Copy, Check, ChevronRight, Code, Key, Gauge, AlertCircle, Webhook, Tag, Package, FileText, LifeBuoy, Rocket, Terminal, BookOpen, ExternalLink, type LucideIcon } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { mkt, colors } from "@/theme/tokens";

/* ═══════════════════════════════════════════════════
   WeFixTrades Developer API Docs — single-pager
   Reference page; OpenAPI spec at /docs/openapi.yaml.
   Content reflects the shipped v1 server contract.
═══════════════════════════════════════════════════ */

const C = {
  navy: colors.brand.dark,
  accent: colors.accent.blue,
  accentHover: colors.accent.blueHover,
  accentTint: colors.accent.blueTint,
  bg: mkt.bg,
  bgGray: colors.surface.muted,
  heading: colors.text.primary,
  body: colors.text.secondary,
  muted: colors.text.secondary,
  /* On-dark variants for text that sits directly on the dark page bg
     (mkt.bg). The light-mode `heading`/`body` above are near-black and were
     invisible on the dark background — they're kept ONLY for the white
     cards / gray tables / light callouts embedded in the page. */
  headingOnDark: mkt.onDark,
  bodyOnDark: mkt.text,
  border: mkt.border,
  borderLight: mkt.borderLight,
  codeBase: colors.brand.dark,
  codeHeader: colors.brand.darkHover,
};

interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  subs?: { id: string; label: string }[];
}

const NAV: NavSection[] = [
  { id: "introduction", label: "Introduction", icon: BookOpen },
  { id: "quickstart", label: "Quickstart", icon: Rocket },
  { id: "authentication", label: "Authentication", icon: Key },
  { id: "rate-limits", label: "Rate limits & quotas", icon: Gauge },
  { id: "errors", label: "Errors", icon: AlertCircle },
  {
    id: "endpoints",
    label: "Endpoints",
    icon: Code,
    subs: [
      { id: "ep-calculators", label: "Calculators" },
      { id: "ep-submissions", label: "Submissions" },
      { id: "ep-embeds", label: "Embeds" },
      { id: "ep-quotes", label: "Quotes" },
      { id: "ep-webhooks", label: "Webhooks" },
      { id: "ep-templates", label: "Templates" },
      { id: "ep-me", label: "Self (Me)" },
    ],
  },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "pricing", label: "Pricing", icon: Tag },
  { id: "sdks", label: "SDKs", icon: Package },
  { id: "changelog", label: "Changelog", icon: FileText },
  { id: "support", label: "Support", icon: LifeBuoy },
];

const ALL_IDS: string[] = NAV.flatMap((n) => [n.id, ...(n.subs?.map((s) => s.id) ?? [])]);

export default function ApiDocsPage() {
  // Title + meta tags handled by <PageMeta> below.

  const [active, setActive] = useState<string>("introduction");
  const observer = useRef<IntersectionObserver | null>(null);

  // Scrollspy via IntersectionObserver
  useEffect(() => {
    if (typeof window === "undefined") return;
    observer.current?.disconnect();
    const opts: IntersectionObserverInit = {
      rootMargin: "-96px 0px -65% 0px",
      threshold: [0, 0.25, 0.5, 1],
    };
    observer.current = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      if (visible.length > 0) {
        // Pick the topmost visible entry
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = (visible[0].target as HTMLElement).id;
        if (id) setActive(id);
      }
    }, opts);
    ALL_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.current?.observe(el);
    });
    return () => observer.current?.disconnect();
  }, []);

  return (
    <MarketingLayout>
      <PageMeta
        title="API documentation — embed WeFixTrades in your stack"
        description="REST API reference for WeFixTrades — embed quote calculators, capture leads, manage bookings, and integrate every product into your stack."
        canonical="/docs/api"
        keywords={["wefixtrades api", "quote calculator api", "trades software api"]}
      />
      <div data-theme="dark" data-testid="api-docs-page" style={{ background: C.bg }}>
        {/* Page header */}
        <ApiHeader />

        <div
          style={{
            display: "flex",
            maxWidth: 1400,
            margin: "0 auto",
            minHeight: "calc(100vh - 72px)",
            position: "relative",
          }}
        >
          {/* Left sidebar */}
          <aside
            className="apidocs-sidebar"
            data-testid="api-docs-sidebar"
            style={{
              width: 260,
              flexShrink: 0,
              borderRight: `1px solid ${C.border}`,
              position: "sticky" as const,
              top: 72,
              height: "calc(100vh - 72px)",
              overflowY: "auto",
              padding: "28px 0 60px",
              background: C.bg,
            }}
          >
            <SidebarNav active={active} />
          </aside>

          {/* Main content */}
          <main
            data-testid="api-docs-content"
            style={{
              flex: 1,
              padding: "40px 48px 96px",
              minWidth: 0,
              maxWidth: 880,
            }}
          >
            <ContentSections />
          </main>

          {/* Right TOC */}
          <aside
            className="apidocs-toc"
            data-testid="api-docs-toc"
            style={{
              width: 220,
              flexShrink: 0,
              position: "sticky" as const,
              top: 72,
              height: "calc(100vh - 72px)",
              overflowY: "auto",
              padding: "40px 24px 60px",
            }}
          >
            <Toc active={active} />
          </aside>
        </div>

        <style>{`
          @media (max-width: 1100px) {
            .apidocs-toc { display: none !important; }
          }
          @media (max-width: 820px) {
            .apidocs-sidebar { display: none !important; }
            [data-testid="api-docs-content"] { padding: 24px 18px 60px !important; }
            /* The floating marketing nav overlaps the top of the header band
               on mobile, clipping the "Developer documentation" eyebrow. Push
               the header content down so it clears the nav. */
            [data-testid="api-docs-header"] > div { padding: 78px 18px 24px !important; }
          }
          /* Anchor scroll offset so headings clear sticky header */
          [data-testid="api-docs-content"] [id] {
            scroll-margin-top: 88px;
          }
        `}</style>
      </div>
    </MarketingLayout>
  );
}

/* ─── Header band ─────────────────────────────────── */
function ApiHeader() {
  return (
    <div
      data-testid="api-docs-header"
      style={{
        background: C.navy,
        color: "#fff",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: "28px 48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap" as const,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: C.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 0 6px ${colors.accent.blueGlow}`,
            }}
          >
            <Terminal size={20} color="#fff" strokeWidth={1.75} />
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "rgba(255,255,255,0.55)",
                textTransform: "uppercase" as const,
                letterSpacing: "0.12em",
                marginBottom: 4,
              }}
            >
              Developer documentation
            </div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              WeFixTrades API <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>· v1</span>
            </h1>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const }}>
          <a
            href="/docs/openapi.yaml"
            data-testid="api-docs-openapi-link"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 8,
              textDecoration: "none",
              background: "transparent",
            }}
          >
            <FileText size={14} strokeWidth={1.75} />
            OpenAPI spec
            <ExternalLink size={12} strokeWidth={1.75} />
          </a>
          <Link
            href="/portal/api-access"
            data-testid="api-docs-cta-key"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              background: C.accent,
              borderRadius: 8,
              textDecoration: "none",
              boxShadow: `0 6px 18px ${colors.accent.blueGlow}`,
            }}
          >
            <Key size={14} strokeWidth={1.75} />
            Get an API key
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ─── Sidebar nav (left) ──────────────────────────── */
function SidebarNav({ active }: { active: string }) {
  return (
    <nav data-testid="api-docs-nav">
      <div
        style={{
          padding: "0 20px 12px",
          fontSize: 10,
          fontWeight: 800,
          color: C.muted,
          letterSpacing: "0.12em",
          textTransform: "uppercase" as const,
        }}
      >
        API reference
      </div>
      {NAV.map(({ id, label, icon: Icon, subs }) => {
        const isActive = active === id || (subs?.some((s) => s.id === active) ?? false);
        return (
          <div key={id}>
            <a
              href={`#${id}`}
              data-testid={`api-docs-nav-${id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 20px",
                textDecoration: "none",
                background: isActive ? `${C.accent}10` : "transparent",
                borderLeft: `3px solid ${isActive ? C.accent : "transparent"}`,
              }}
            >
              <Icon size={14} color={isActive ? C.accent : C.muted} strokeWidth={1.5} />
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? C.accent : C.body,
                }}
              >
                {label}
              </span>
            </a>
            {subs && isActive && (
              <div style={{ padding: "2px 0 6px 38px" }}>
                {subs.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    data-testid={`api-docs-nav-${s.id}`}
                    style={{
                      display: "block",
                      padding: "4px 0",
                      textDecoration: "none",
                      fontSize: 12.5,
                      color: active === s.id ? C.accent : C.muted,
                      fontWeight: active === s.id ? 600 : 500,
                    }}
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/* ─── Right TOC ───────────────────────────────────── */
function Toc({ active }: { active: string }) {
  // Build a small TOC mirroring h2/h3 of the active section.
  const tocMap = useMemo<Record<string, { label: string; sub?: { id: string; label: string }[] }>>(
    () => ({
      introduction: { label: "Introduction" },
      quickstart: { label: "Quickstart" },
      authentication: { label: "Authentication" },
      "rate-limits": { label: "Rate limits & quotas" },
      errors: { label: "Errors" },
      endpoints: {
        label: "Endpoints",
        sub: [
          { id: "ep-calculators", label: "Calculators" },
          { id: "ep-submissions", label: "Submissions" },
          { id: "ep-embeds", label: "Embeds" },
          { id: "ep-quotes", label: "Quotes" },
          { id: "ep-webhooks", label: "Webhooks" },
          { id: "ep-templates", label: "Templates" },
          { id: "ep-me", label: "Self (Me)" },
        ],
      },
      webhooks: { label: "Webhooks" },
      pricing: { label: "Pricing" },
      sdks: { label: "SDKs" },
      changelog: { label: "Changelog" },
      support: { label: "Support" },
    }),
    [],
  );

  return (
    <div data-testid="api-docs-toc-inner">
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase" as const,
          color: C.muted,
          marginBottom: 12,
        }}
      >
        On this page
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {Object.entries(tocMap).map(([id, info]) => {
          const isActive = active === id || (info.sub?.some((s) => s.id === active) ?? false);
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                style={{
                  textDecoration: "none",
                  fontSize: 12.5,
                  color: isActive ? C.accent : C.muted,
                  fontWeight: isActive ? 600 : 500,
                  display: "block",
                  padding: "2px 0",
                  borderLeft: `2px solid ${isActive ? C.accent : "transparent"}`,
                  paddingLeft: 10,
                  marginLeft: -10,
                }}
              >
                {info.label}
              </a>
              {info.sub && isActive && (
                <ul style={{ listStyle: "none", padding: "2px 0 4px 12px", margin: 0 }}>
                  {info.sub.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        style={{
                          textDecoration: "none",
                          fontSize: 12,
                          color: active === s.id ? C.accent : C.muted,
                          fontWeight: active === s.id ? 600 : 500,
                          display: "block",
                          padding: "2px 0",
                        }}
                      >
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─── Reusable primitives ─────────────────────────── */
function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      style={{
        fontSize: 26,
        fontWeight: 800,
        color: C.headingOnDark,
        margin: "48px 0 14px",
        letterSpacing: "-0.02em",
        scrollMarginTop: 88,
      }}
    >
      {children}
    </h2>
  );
}

function H3({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3
      id={id}
      style={{
        fontSize: 18,
        fontWeight: 700,
        color: C.headingOnDark,
        margin: "32px 0 10px",
        scrollMarginTop: 88,
      }}
    >
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 15, color: C.bodyOnDark, lineHeight: 1.7, margin: "10px 0" }}>
      {children}
    </p>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        background: C.bgGray,
        border: `1px solid ${C.borderLight}`,
        borderRadius: 5,
        padding: "1px 6px",
        fontSize: 13,
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        color: C.heading,
      }}
    >
      {children}
    </code>
  );
}

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div
      data-testid="code-block"
      style={{
        background: C.codeBase,
        borderRadius: 10,
        overflow: "hidden",
        margin: "14px 0",
        fontSize: 13,
        border: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 14px",
          background: C.codeHeader,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span
          style={{
            color: "#94A3B8",
            fontSize: 10.5,
            fontWeight: 700,
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
          }}
        >
          {lang}
        </span>
        <button
          data-testid="copy-button"
          onClick={copy}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: copied ? "#6EE7B7" : "#94A3B8",
            fontSize: 11.5,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          {copied ? <Check size={12} strokeWidth={1.75} /> : <Copy size={12} strokeWidth={1.75} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        style={{
          padding: "16px 18px",
          margin: 0,
          color: "#E2E8F0",
          overflowX: "auto",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          lineHeight: 1.6,
          whiteSpace: "pre" as const,
          fontSize: 12.5,
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Tabs({ tabs }: { tabs: { label: string; lang: string; code: string }[] }) {
  const [idx, setIdx] = useState(0);
  return (
    <div
      data-testid="code-tabs"
      style={{
        background: C.codeBase,
        borderRadius: 10,
        overflow: "hidden",
        margin: "14px 0",
        border: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: C.codeHeader,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "0 8px",
        }}
      >
        {tabs.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setIdx(i)}
            data-testid={`code-tab-${t.label.toLowerCase()}`}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "10px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: i === idx ? "#fff" : "#94A3B8",
              borderBottom: `2px solid ${i === idx ? C.accent : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <pre
        style={{
          padding: "16px 18px",
          margin: 0,
          color: "#E2E8F0",
          overflowX: "auto",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          lineHeight: 1.6,
          whiteSpace: "pre" as const,
          fontSize: 12.5,
        }}
      >
        <code>{tabs[idx].code}</code>
      </pre>
    </div>
  );
}

function Callout({
  type = "info",
  children,
}: {
  type?: "info" | "warn" | "tip";
  children: React.ReactNode;
}) {
  const styles = {
    info: { bg: "#EAF1FF", border: "#D4E2FF", icon: "i" },
    warn: { bg: "#FFFBEB", border: "#FDE68A", icon: "!" },
    tip: { bg: "#ECFDF5", border: "#A7F3D0", icon: "*" },
  }[type];
  return (
    <div
      style={{
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        borderRadius: 10,
        padding: "12px 16px",
        margin: "14px 0",
        fontSize: 14,
        color: C.body,
        lineHeight: 1.6,
        display: "flex",
        gap: 10,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          border: `1px solid ${styles.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 11,
          color: C.body,
        }}
      >
        {styles.icon}
      </span>
      <div>{children}</div>
    </div>
  );
}

function EndpointRow({
  method,
  path,
  description,
}: {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
}) {
  const colorByMethod: Record<string, string> = {
    GET: "#0ea5e9",
    POST: "#16a34a",
    PUT: "#d97706",
    PATCH: "#d97706",
    DELETE: "#dc2626",
  };
  return (
    <div
      data-testid={`endpoint-${method.toLowerCase()}-${path.replace(/[^a-zA-Z0-9]/g, "-")}`}
      style={{
        display: "grid",
        gridTemplateColumns: "70px 1fr",
        gap: 16,
        alignItems: "center",
        padding: "10px 14px",
        border: `1px solid ${C.borderLight}`,
        borderRadius: 8,
        marginBottom: 6,
        background: "#fff",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: colorByMethod[method],
          letterSpacing: "0.06em",
        }}
      >
        {method}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <code
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            fontSize: 13,
            color: C.heading,
            fontWeight: 600,
          }}
        >
          {path}
        </code>
        <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
          {description}
        </span>
      </div>
    </div>
  );
}

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div style={{ overflowX: "auto", margin: "16px 0" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13.5,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
        }}
      >
        <thead style={{ background: C.bgGray }}>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  fontWeight: 700,
                  color: C.heading,
                  fontSize: 12.5,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: i === 0 ? "none" : `1px solid ${C.borderLight}` }}>
              {r.map((cell, j) => (
                <td
                  key={j}
                  style={{
                    padding: "10px 14px",
                    color: C.body,
                    verticalAlign: "top" as const,
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Content ─────────────────────────────────────── */
function ContentSections() {
  return (
    <>
      {/* INTRODUCTION */}
      <section>
        <H2 id="introduction">Introduction</H2>
        <P>
          The WeFixTrades API is a REST-over-HTTPS interface for embedding quote calculators,
          capturing leads, and integrating WeFixTrades products into your stack. All requests
          return JSON, authenticate via bearer tokens, and follow conventional HTTP semantics —
          if you've used Stripe, Twilio, or Cal.com Platform, you'll feel at home.
        </P>
        <P>
          Base URL: <InlineCode>https://wefixtrades.com/api/v1</InlineCode>. All endpoints are
          versioned under <InlineCode>/api/v1/...</InlineCode>. Breaking changes ship on a new
          major version; additive changes are non-breaking in <InlineCode>v1</InlineCode>.
        </P>
        <Callout type="info">
          The reference below describes the surface of v1. Final endpoint shapes are generated
          from the server-side OpenAPI spec; see <a href="/docs/openapi.yaml" style={{ color: C.accent }}>openapi.yaml</a>.
        </Callout>
      </section>

      {/* QUICKSTART */}
      <section>
        <H2 id="quickstart">Quickstart</H2>
        <P>Five minutes from zero to your first authenticated call:</P>
        <ol style={{ paddingLeft: 22, color: C.bodyOnDark, fontSize: 15, lineHeight: 1.85 }}>
          <li>
            Create a WeFixTrades account at{" "}
            <a href="/signup" style={{ color: C.accent }}>/signup</a>.
          </li>
          <li>
            Subscribe to the <strong>Developer</strong> tier — free — from{" "}
            <a href="/pricing" style={{ color: C.accent }}>Pricing</a>.
          </li>
          <li>
            Generate an API key under <strong>Portal → API Access</strong>. Production keys are
            prefixed <InlineCode>wfx_live_</InlineCode>; test-mode keys issued in non-production
            are prefixed <InlineCode>wfx_test_</InlineCode>.
          </li>
          <li>
            Call <InlineCode>GET /api/v1/me</InlineCode> to verify the key.
          </li>
          <li>
            List your calculators with <InlineCode>GET /api/v1/calculators</InlineCode>.
          </li>
        </ol>

        <Tabs
          tabs={[
            {
              label: "curl",
              lang: "bash",
              code:
                `# Verify your key\n` +
                `curl https://wefixtrades.com/api/v1/me \\\n` +
                `  -H "Authorization: Bearer wfx_live_..."\n\n` +
                `# List your calculators\n` +
                `curl https://wefixtrades.com/api/v1/calculators \\\n` +
                `  -H "Authorization: Bearer wfx_live_..."`,
            },
            {
              label: "Node",
              lang: "javascript",
              code:
                `// npm install undici  (or use built-in fetch on Node 18+)\n` +
                `const API = "https://wefixtrades.com/api/v1";\n` +
                `const headers = { Authorization: \`Bearer \${process.env.WFX_KEY}\` };\n\n` +
                `const me  = await fetch(\`\${API}/me\`,  { headers }).then(r => r.json());\n` +
                `const all = await fetch(\`\${API}/calculators\`, { headers }).then(r => r.json());\n` +
                `// success envelope: { data, request_id }; the list payload nests under data.data\n` +
                `console.log({ user: me.data, count: all.data.data.length });`,
            },
            {
              label: "Python",
              lang: "python",
              code:
                `# pip install httpx\n` +
                `import os, httpx\n\n` +
                `API = "https://wefixtrades.com/api/v1"\n` +
                `headers = {"Authorization": f"Bearer {os.environ['WFX_KEY']}"}\n\n` +
                `me  = httpx.get(f"{API}/me", headers=headers).json()\n` +
                `cal = httpx.get(f"{API}/calculators", headers=headers).json()\n` +
                `print(me["data"], len(cal["data"]["data"]))`,
            },
            {
              label: "PHP",
              lang: "php",
              code:
                `<?php\n` +
                `$api = "https://wefixtrades.com/api/v1";\n` +
                `$opts = ["http" => ["header" => "Authorization: Bearer " . getenv("WFX_KEY")]];\n` +
                `$ctx  = stream_context_create($opts);\n\n` +
                `$me  = json_decode(file_get_contents("$api/me", false, $ctx), true);\n` +
                `$cal = json_decode(file_get_contents("$api/calculators", false, $ctx), true);\n`,
            },
          ]}
        />
      </section>

      {/* AUTHENTICATION */}
      <section>
        <H2 id="authentication">Authentication</H2>
        <P>
          All requests authenticate via a bearer token in the <InlineCode>Authorization</InlineCode>{" "}
          header. The key prefix is environment-driven — there is no separate sandbox environment
          with isolated data:
        </P>
        <Table
          head={["Key prefix", "Issued in", "Notes"]}
          rows={[
            [
              <InlineCode key="p">wfx_live_...</InlineCode>,
              "Production",
              "Real submissions, real usage, billed against your tier.",
            ],
            [
              <InlineCode key="t">wfx_test_...</InlineCode>,
              "Non-production",
              "Test-mode keys are issued in non-production environments. They hit the same API surface — there is no per-account sandbox data isolation.",
            ],
          ]}
        />
        <P>
          A key is <InlineCode>wfx_live_</InlineCode> (or <InlineCode>wfx_test_</InlineCode>)
          followed by 40 url-safe characters. The first 12 characters are the stored prefix
          (e.g. <InlineCode>wfx_live_ab</InlineCode>) shown in the dashboard and in{" "}
          <InlineCode>GET /me</InlineCode>; the full secret is shown only once at creation.
        </P>

        <CodeBlock
          lang="http"
          code={`GET /api/v1/me HTTP/1.1\nHost: wefixtrades.com\nAuthorization: Bearer wfx_live_4f1c2a...`}
        />

        <H3 id="auth-rules">Handling keys safely</H3>
        <ul style={{ paddingLeft: 22, color: C.bodyOnDark, fontSize: 15, lineHeight: 1.8 }}>
          <li>Never embed live keys in browser code, mobile bundles, or public repos.</li>
          <li>Store keys in your server's secret manager (Doppler, AWS Secrets Manager, Vercel env, etc.).</li>
          <li>
            Rotate and revoke keys from <strong>Portal → API Access</strong>. Key management is
            dashboard-only — there is no API endpoint for creating, rotating, or revoking keys.
          </li>
          <li>
            Compromised key? Revoke it immediately from <strong>Portal → API Access</strong>.
            Revoked keys return <InlineCode>403 key_revoked</InlineCode> on the next request.
          </li>
        </ul>
      </section>

      {/* RATE LIMITS */}
      <section>
        <H2 id="rate-limits">Rate limits & quotas</H2>
        <P>
          The API enforces two ceilings: a per-minute <strong>rate limit</strong> (prevents
          bursts) and a monthly <strong>quota</strong> (tied to your tier). Both surface as
          response headers on every call.
        </P>

        <Table
          head={["Tier", "Per-minute rate limit", "Monthly call quota", "Overage"]}
          rows={[
            ["Developer (free)", "5/min", "1,000", "Hard stop at quota"],
            ["Starter", "30/min", "25,000", "$2 per 1,000 calls, cap 3×"],
            ["Pro", "120/min", "150,000", "$2 per 1,000 calls, cap 3×"],
            ["Business", "600/min", "750,000", "$2 per 1,000 calls, cap 3×"],
            ["Agency", "1,800/min", "3,000,000", "$2 per 1,000 calls, cap 3×"],
          ]}
        />

        <H3 id="rate-headers">Response headers</H3>
        <CodeBlock
          lang="http"
          code={
            `HTTP/1.1 200 OK\n` +
            `X-Request-Id:          req_01HEX...\n` +
            `X-RateLimit-Limit:     120\n` +
            `X-RateLimit-Remaining: 117\n` +
            `X-RateLimit-Reset:     1747892400   # Unix epoch (seconds)\n` +
            `X-Quota-Limit:         150000\n` +
            `X-Quota-Remaining:     121432\n` +
            `X-Quota-Reset:         1748736000`
          }
        />

        <H3 id="rate-429">When you hit a limit</H3>
        <P>
          Exceeding either ceiling returns <InlineCode>429 Too Many Requests</InlineCode>. These
          come from the auth/quota middleware, so they use the bare string error shape with a{" "}
          <InlineCode>retry_after_seconds</InlineCode> field (see{" "}
          <a href="#errors" style={{ color: C.accent }}>Errors</a>). Back off and retry; clients
          should implement exponential backoff with jitter for production workloads.
        </P>
        <CodeBlock
          lang="json"
          code={
            `# Per-minute rate limit\n` +
            `HTTP/1.1 429 Too Many Requests\n` +
            `\n` +
            `{ "error": "rate_limit_exceeded", "retry_after_seconds": 17 }\n\n` +
            `# Monthly quota exhausted\n` +
            `HTTP/1.1 429 Too Many Requests\n` +
            `\n` +
            `{ "error": "monthly_quota_exhausted", "retry_after_seconds": 86400 }`
          }
        />
      </section>

      {/* ERRORS */}
      <section>
        <H2 id="errors">Errors</H2>
        <P>
          The API uses <strong>two</strong> error shapes. Resource route handlers (validation,
          not-found, etc.) return a structured envelope; the auth, rate-limit, and quota
          middleware returns a bare string. Always log the{" "}
          <InlineCode>request_id</InlineCode> (also on the <InlineCode>X-Request-Id</InlineCode>{" "}
          header) when present — support can trace any call by it.
        </P>
        <P>
          <strong>Structured shape</strong> — resource handlers (400/403/404/500):
        </P>
        <CodeBlock
          lang="json"
          code={
            `{\n` +
            `  "error": {\n` +
            `    "code": "invalid_body",\n` +
            `    "message": "Field 'name' is required."\n` +
            `  },\n` +
            `  "request_id": "req_01HEXABC..."\n` +
            `}`
          }
        />
        <P>
          <strong>Bare string shape</strong> — auth / rate-limit / quota middleware. No{" "}
          <InlineCode>code</InlineCode>, <InlineCode>message</InlineCode>, or{" "}
          <InlineCode>request_id</InlineCode>:
        </P>
        <CodeBlock
          lang="json"
          code={
            `401  { "error": "missing_or_malformed_api_key" }\n` +
            `401  { "error": "invalid_api_key" }\n` +
            `403  { "error": "key_revoked" }\n` +
            `403  { "error": "no_subscription" }\n` +
            `429  { "error": "rate_limit_exceeded", "retry_after_seconds": 17 }\n` +
            `429  { "error": "monthly_quota_exhausted", "retry_after_seconds": 86400 }`
          }
        />

        <H3 id="errors-codes">Structured error codes (route handlers)</H3>
        <Table
          head={["HTTP", "Code", "When"]}
          rows={[
            ["401", <InlineCode key="1">unauthenticated</InlineCode>, "Request reached a handler without a valid authenticated key."],
            ["400", <InlineCode key="2">invalid_query</InlineCode>, "A query parameter failed validation."],
            ["400", <InlineCode key="3">invalid_body</InlineCode>, "Request body failed schema validation."],
            ["400", <InlineCode key="4">invalid_id</InlineCode>, "Path id is malformed (calculators/submissions use integer ids)."],
            ["403", <InlineCode key="5">tier_limit_exceeded</InlineCode>, "Action exceeds your tier's limit (e.g. too many calculators or webhooks)."],
            ["403", <InlineCode key="6">unknown_tier</InlineCode>, "The subscription tier could not be resolved."],
            ["404", <InlineCode key="7">not_found</InlineCode>, "Resource does not exist or is not visible to this account."],
            ["500", <InlineCode key="8">internal_error</InlineCode>, "We broke something. Reported automatically; please retry."],
          ]}
        />

        <H3 id="errors-strings">Middleware string errors (auth / quota)</H3>
        <Table
          head={["HTTP", "error string", "When"]}
          rows={[
            ["401", <InlineCode key="1">missing_or_malformed_api_key</InlineCode>, "No bearer token, or it isn't a well-formed key."],
            ["401", <InlineCode key="2">invalid_api_key</InlineCode>, "Token does not match an active key."],
            ["403", <InlineCode key="3">key_revoked</InlineCode>, "Key was revoked from the dashboard."],
            ["403", <InlineCode key="4">key_expired</InlineCode>, "Key has passed its expiry."],
            ["403", <InlineCode key="5">no_subscription</InlineCode>, "Account has no active subscription."],
            ["403", <InlineCode key="6">subscription_&lt;status&gt;</InlineCode>, "Subscription is in a non-active state (e.g. past_due, canceled)."],
            ["429", <InlineCode key="7">rate_limit_exceeded</InlineCode>, "Per-minute rate limit hit. Includes retry_after_seconds."],
            ["429", <InlineCode key="8">monthly_quota_exhausted</InlineCode>, "Monthly call quota used up. Includes retry_after_seconds."],
          ]}
        />

        <H3 id="errors-status">HTTP status conventions</H3>
        <P>
          <InlineCode>200</InlineCode> OK · <InlineCode>201</InlineCode> Created ·{" "}
          <InlineCode>204</InlineCode> No Content (e.g. <em>delete</em>) ·{" "}
          <InlineCode>400</InlineCode>/<InlineCode>401</InlineCode>/<InlineCode>403</InlineCode>/
          <InlineCode>404</InlineCode>/<InlineCode>429</InlineCode> client-side;{" "}
          <InlineCode>500</InlineCode> server-side.
        </P>
      </section>

      {/* ENDPOINTS */}
      <section>
        <H2 id="endpoints">Endpoints reference</H2>
        <P>
          All resources are scoped to your account by the bearer key. Every success response is
          wrapped in an envelope — <InlineCode>{`{ "data": ..., "request_id": "req_..." }`}</InlineCode>.
          List endpoints page via <InlineCode>?limit=</InlineCode> and <InlineCode>?offset=</InlineCode>{" "}
          parameters; the list payload (itself nested under the envelope's <InlineCode>data</InlineCode>)
          includes <InlineCode>data</InlineCode>, <InlineCode>total</InlineCode>,{" "}
          <InlineCode>has_more</InlineCode>, <InlineCode>limit</InlineCode>, and <InlineCode>offset</InlineCode>.
        </P>

        {/* Calculators */}
        <H3 id="ep-calculators">Calculators</H3>
        <EndpointRow method="GET" path="/api/v1/calculators" description="List calculators. Query: limit (1–100, default 20), offset (default 0), status (active|paused|archived)." />
        <EndpointRow method="POST" path="/api/v1/calculators" description="Create a calculator." />
        <EndpointRow method="GET" path="/api/v1/calculators/:id" description="Fetch one calculator with its full config." />
        <EndpointRow method="PATCH" path="/api/v1/calculators/:id" description="Partial update — name, business_name, calculator_settings." />
        <EndpointRow method="DELETE" path="/api/v1/calculators/:id" description="Archive a calculator." />
        <EndpointRow method="POST" path="/api/v1/calculators/:id/pause" description="Disable submissions without deleting." />
        <EndpointRow method="POST" path="/api/v1/calculators/:id/resume" description="Re-enable submissions." />
        <P>Example — create:</P>
        <CodeBlock
          lang="json"
          code={
            `POST /api/v1/calculators\n` +
            `Content-Type: application/json\n` +
            `\n` +
            `{\n` +
            `  "name":              "Plumbing — Emergency Quote",\n` +
            `  "business_name":     "Acme Plumbing",\n` +
            `  "trade_type":        "plumbing",\n` +
            `  "template_id":       "tmpl_plumbing_v2",\n` +
            `  "pricing_config":    { "base": 89, "currency": "USD" },\n` +
            `  "calculator_settings": { "theme": "dark" }\n` +
            `}`
          }
        />
        <P>
          Only <InlineCode>name</InlineCode> is required. The <InlineCode>slug</InlineCode> is
          server-generated. Example response (201) — wrapped in the success envelope:
        </P>
        <CodeBlock
          lang="json"
          code={
            `{\n` +
            `  "data": {\n` +
            `    "id":                42,\n` +
            `    "name":              "Plumbing — Emergency Quote",\n` +
            `    "business_name":     "Acme Plumbing",\n` +
            `    "slug":              "plumbing-emergency-quote",\n` +
            `    "trade_type":        "plumbing",\n` +
            `    "status":            "active",\n` +
            `    "plan_tier":         "pro",\n` +
            `    "total_views":       0,\n` +
            `    "hosted_url":        null,\n` +
            `    "subdomain":         null,\n` +
            `    "primary_color":     "#2563EB",\n` +
            `    "template_id":       "tmpl_plumbing_v2",\n` +
            `    "calculator_settings": { "theme": "dark" },\n` +
            `    "created_at":        "2026-05-21T14:02:11Z",\n` +
            `    "updated_at":        "2026-05-21T14:02:11Z"\n` +
            `  },\n` +
            `  "request_id": "req_01HEX..."\n` +
            `}`
          }
        />
        <P>Example errors:</P>
        <CodeBlock
          lang="json"
          code={
            `400 Bad Request\n` +
            `{ "error": { "code": "invalid_body", "message": "name is required" }, "request_id": "req_01HEX..." }\n\n` +
            `404 Not Found\n` +
            `{ "error": { "code": "not_found", "message": "calculator not found" }, "request_id": "req_01HEX..." }`
          }
        />

        {/* Submissions */}
        <H3 id="ep-submissions">Submissions</H3>
        <EndpointRow method="GET" path="/api/v1/calculators/:id/submissions" description="List a calculator's submissions. Query: limit (1–200, default 50), offset, since (ISO), until (ISO)." />
        <EndpointRow method="GET" path="/api/v1/submissions/:id" description="Fetch one submission with field answers + quote amount." />
        <P>
          To create a submission programmatically, use{" "}
          <InlineCode>POST /api/v1/calculators/:id/quotes</InlineCode> (see{" "}
          <a href="#ep-quotes" style={{ color: C.accent }}>Quotes</a>).
        </P>
        <P>Example — fetch one submission (inside the success envelope):</P>
        <CodeBlock
          lang="json"
          code={
            `{\n` +
            `  "data": {\n` +
            `    "id":            7,\n` +
            `    "calculator_id": 42,\n` +
            `    "name":          "Jane Doe",\n` +
            `    "email":         "jane@example.com",\n` +
            `    "phone":         "+1-555-0101",\n` +
            `    "company":       "Doe & Co",\n` +
            `    "quote_amount":  280,\n` +
            `    "answers":       { "service_type": "leak", "urgency": "today" },\n` +
            `    "status":        "new",\n` +
            `    "created_at":    "2026-05-21T14:11:02Z"\n` +
            `  },\n` +
            `  "request_id": "req_01HEX..."\n` +
            `}`
          }
        />

        {/* Embeds */}
        <H3 id="ep-embeds">Embeds</H3>
        <EndpointRow method="GET" path="/api/v1/calculators/:id/embed-code" description="Returns the <script> snippet for embedding the calculator on a 3rd-party site." />
        <EndpointRow method="GET" path="/api/v1/calculators/:id/hosted-url" description="Returns the standalone hosted URL (e.g. for SMS / email share)." />

        {/* Quotes */}
        <H3 id="ep-quotes">Quotes</H3>
        <EndpointRow method="POST" path="/api/v1/calculators/:id/quotes" description="Compute a quote and create a submission. This is how you programmatically capture a lead." />
        <P>
          Body: <InlineCode>field_values</InlineCode> (required object),{" "}
          <InlineCode>quote_amount</InlineCode> (optional number|null),{" "}
          <InlineCode>compute</InlineCode> (boolean, default true), and an optional{" "}
          <InlineCode>contact</InlineCode> object (<InlineCode>name</InlineCode>,{" "}
          <InlineCode>email</InlineCode>, <InlineCode>phone</InlineCode>,{" "}
          <InlineCode>company</InlineCode>).
        </P>
        <CodeBlock
          lang="bash"
          code={
            `curl -X POST "https://wefixtrades.com/api/v1/calculators/42/quotes" \\\n` +
            `  -H "Authorization: Bearer wfx_live_..." \\\n` +
            `  -H "Content-Type: application/json" \\\n` +
            `  -d '{\n` +
            `        "field_values": { "service_type": "leak", "urgency": "today" },\n` +
            `        "compute": true,\n` +
            `        "contact": { "name": "Jane Doe", "email": "jane@example.com" }\n` +
            `      }'`
          }
        />
        <P>Example response (201):</P>
        <CodeBlock
          lang="json"
          code={
            `{\n` +
            `  "data": {\n` +
            `    "submission_id":  7,\n` +
            `    "calculator_id":  42,\n` +
            `    "computed_quote": 280,\n` +
            `    "breakdown":      [ { "label": "Base", "amount": 89 } ],\n` +
            `    "formula_errors": [],\n` +
            `    "submission": {\n` +
            `      "id": 7, "calculator_id": 42, "name": "Jane Doe",\n` +
            `      "email": "jane@example.com", "quote_amount": 280,\n` +
            `      "answers": { "service_type": "leak", "urgency": "today" },\n` +
            `      "status": "new", "created_at": "2026-05-21T14:11:02Z"\n` +
            `    }\n` +
            `  },\n` +
            `  "request_id": "req_01HEX..."\n` +
            `}`
          }
        />

        {/* Webhooks */}
        <H3 id="ep-webhooks">Webhooks</H3>
        <EndpointRow method="GET" path="/api/v1/webhooks" description="List webhook subscriptions." />
        <EndpointRow method="POST" path="/api/v1/webhooks" description='Create a webhook subscription. Body: { url, events: [...] }.' />
        <EndpointRow method="DELETE" path="/api/v1/webhooks/:id" description="Remove a webhook subscription (id is an opaque string)." />

        {/* Templates */}
        <H3 id="ep-templates">Templates</H3>
        <EndpointRow method="GET" path="/api/v1/templates" description="List public + account calculator templates (input for POST /calculators)." />
        <EndpointRow method="GET" path="/api/v1/templates/:id" description="Fetch one template." />

        {/* Me */}
        <H3 id="ep-me">Self (Me)</H3>
        <EndpointRow method="GET" path="/api/v1/me" description="Returns the authenticated user, API key, tier, subscription, and current usage." />
        <CodeBlock
          lang="json"
          code={
            `{\n` +
            `  "data": {\n` +
            `    "user_id": 1024,\n` +
            `    "api_key": { "id": 9, "prefix": "wfx_live_ab", "name": "prod", "status": "active" },\n` +
            `    "tier": {\n` +
            `      "id": "pro", "name": "Pro",\n` +
            `      "monthly_call_quota": 150000, "rate_limit_per_minute": 120,\n` +
            `      "max_calculators": 10, "webhook_quota": 20\n` +
            `    },\n` +
            `    "subscription": {\n` +
            `      "status": "active",\n` +
            `      "current_period_start": "2026-05-01T00:00:00Z",\n` +
            `      "current_period_end":   "2026-06-01T00:00:00Z",\n` +
            `      "reset_at":             "2026-06-01T00:00:00Z"\n` +
            `    },\n` +
            `    "usage_this_period": {\n` +
            `      "calls_used": 48218, "calls_quota": 150000,\n` +
            `      "calls_remaining": 101782, "reset_at": "2026-06-01T00:00:00Z"\n` +
            `    }\n` +
            `  },\n` +
            `  "request_id": "req_01HEX..."\n` +
            `}`
          }
        />
      </section>

      {/* WEBHOOKS */}
      <section>
        <H2 id="webhooks">Webhooks</H2>
        <Callout type="warn">
          <strong>Beta — delivery coming soon.</strong> You can create webhook subscriptions and
          a signing secret is issued today, but the delivery/dispatch worker is not live yet, so
          events are <strong>not</strong> delivered to your endpoint. The event list, payload, and
          signature scheme below describe the <em>planned</em> behaviour for when delivery ships.
        </Callout>
        <P>
          Webhooks deliver events to a URL you control. Use them to forward submissions into
          your CRM, fire SMS notifications, or trigger downstream automations. Manage
          subscriptions via <InlineCode>GET/POST/DELETE /api/v1/webhooks</InlineCode>.
        </P>
        <P>
          On creation, a signing secret (<InlineCode>whsec_...</InlineCode>) is returned in full
          <strong> once</strong>. Afterwards it is redacted to{" "}
          <InlineCode>whsec_********_&lt;last4&gt;</InlineCode> — store it securely at creation
          time.
        </P>

        <H3 id="wh-events">Event types</H3>
        <Table
          head={["Event", "Fires when"]}
          rows={[
            [<InlineCode key="1">submission.created</InlineCode>, "A customer submits a calculator (UI or API)."],
            [<InlineCode key="2">calculator.created</InlineCode>, "A new calculator is provisioned."],
            [<InlineCode key="3">calculator.updated</InlineCode>, "Calculator config or pricing changes."],
            [<InlineCode key="4">calculator.deleted</InlineCode>, "Calculator archived."],
            [<InlineCode key="5">calculator.paused</InlineCode>, "Calculator submissions paused."],
            [<InlineCode key="6">calculator.resumed</InlineCode>, "Calculator submissions resumed."],
          ]}
        />

        <H3 id="wh-payload">Payload shape (planned)</H3>
        <CodeBlock
          lang="json"
          code={
            `{\n` +
            `  "id":      "evt_2a9f...",\n` +
            `  "type":    "submission.created",\n` +
            `  "created": "2026-05-21T14:11:02Z",\n` +
            `  "data": {\n` +
            `    "object": {\n` +
            `      "id":            7,\n` +
            `      "calculator_id": 42,\n` +
            `      "name":          "Jane Doe",\n` +
            `      "email":         "jane@example.com",\n` +
            `      "answers":       { "service_type": "leak", "urgency": "today" },\n` +
            `      "quote_amount":  280\n` +
            `    }\n` +
            `  }\n` +
            `}`
          }
        />

        <H3 id="wh-signature">Signature verification (planned)</H3>
        <P>
          When delivery ships, every webhook will be signed with HMAC-SHA256 over the raw request
          body using the <InlineCode>whsec_...</InlineCode> secret you saw once on creation. The
          signature is sent as <InlineCode>X-WFT-Signature</InlineCode> in the form{" "}
          <InlineCode>t=&lt;timestamp&gt;,v1=&lt;hex&gt;</InlineCode>.
        </P>

        <Tabs
          tabs={[
            {
              label: "Node",
              lang: "javascript",
              code:
                `import crypto from "node:crypto";\n\n` +
                `export function verify(rawBody, header, secret) {\n` +
                `  const [tPart, sPart] = header.split(",");\n` +
                `  const t = tPart.split("=")[1];\n` +
                `  const sig = sPart.split("=")[1];\n` +
                `  const expected = crypto\n` +
                `    .createHmac("sha256", secret)\n` +
                `    .update(\`\${t}.\${rawBody}\`)\n` +
                `    .digest("hex");\n` +
                `  return crypto.timingSafeEqual(\n` +
                `    Buffer.from(sig),\n` +
                `    Buffer.from(expected),\n` +
                `  );\n` +
                `}`,
            },
            {
              label: "Python",
              lang: "python",
              code:
                `import hmac, hashlib\n\n` +
                `def verify(raw_body: bytes, header: str, secret: str) -> bool:\n` +
                `    t_part, s_part = header.split(",")\n` +
                `    t   = t_part.split("=")[1]\n` +
                `    sig = s_part.split("=")[1]\n` +
                `    msg = f"{t}.".encode() + raw_body\n` +
                `    expected = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()\n` +
                `    return hmac.compare_digest(sig, expected)`,
            },
          ]}
        />

        <Callout type="warn">
          Always verify on the <strong>raw</strong> request body, before any JSON parsing. Most
          frameworks (Express, FastAPI, Laravel) expose a raw-body hook — use it.
        </Callout>

        <H3 id="wh-retry">Retry policy (planned)</H3>
        <P>
          Once delivery ships, non-2xx responses will be retried <strong>5 times</strong> with
          exponential backoff over 24 hours (roughly: 1m, 5m, 30m, 2h, 12h). After the 5th
          failure we mark the endpoint unhealthy and email the account owner. Idempotency:
          re-deliveries reuse the same event <InlineCode>id</InlineCode>; dedupe on it.
        </P>
      </section>

      {/* PRICING */}
      <section>
        <H2 id="pricing">Pricing</H2>
        <P>
          API access is included in every WeFixTrades tier. Limits scale with the plan; overage
          is metered at <InlineCode>$2 / 1,000</InlineCode> calls and capped at 3× the tier
          price so a runaway loop cannot blow up your bill.
        </P>
        <Table
          head={["Tier", "Monthly", "Annual", "Calls / month", "Calculators", "Webhook subs"]}
          rows={[
            ["Developer", "$0", "$0", "1,000", "1", "0"],
            ["Starter", "$49", "$480 ($40/mo)", "25,000", "3", "5"],
            ["Pro", "$149", "$1,488 ($124/mo)", "150,000", "10", "20"],
            ["Business", "$399", "$3,972 ($331/mo)", "750,000", "50", "100"],
            ["Agency", "$999", "$9,948 ($829/mo)", "3,000,000", "Unlimited", "Unlimited"],
          ]}
        />
        <Callout type="tip">
          <strong>QuoteQuick loyalty:</strong> existing QuoteQuick paid customers get Starter at{" "}
          <InlineCode>$29/mo</InlineCode> for life. Email{" "}
          <a href="mailto:billing@wefixtrades.com" style={{ color: C.accent }}>
            billing@wefixtrades.com
          </a>{" "}
          from your QuoteQuick account address.
        </Callout>
      </section>

      {/* SDKs */}
      <section>
        <H2 id="sdks">SDKs</H2>
        <P>
          No official SDKs yet — coming Q3 2026. The API is plain REST + JSON, so any HTTP
          client works. We publish an OpenAPI 3.1 spec at{" "}
          <a href="/docs/openapi.yaml" style={{ color: C.accent }}>
            /docs/openapi.yaml
          </a>
          ; community tooling like <InlineCode>openapi-generator</InlineCode>,{" "}
          <InlineCode>orval</InlineCode>, and <InlineCode>oazapfts</InlineCode> can produce
          a typed client in minutes.
        </P>
        <Callout type="info">
          Planned official SDKs: <strong>TypeScript</strong> (Node + browser),{" "}
          <strong>Python</strong>, <strong>PHP</strong>. Expression of interest:{" "}
          <a href="mailto:developers@wefixtrades.com" style={{ color: C.accent }}>
            developers@wefixtrades.com
          </a>
          .
        </Callout>
      </section>

      {/* CHANGELOG */}
      <section>
        <H2 id="changelog">Changelog</H2>
        <P>
          The v1 surface is stable. Additive changes (new endpoints, new optional fields) land
          on <InlineCode>v1</InlineCode> without notice; breaking changes ship on{" "}
          <InlineCode>v2+</InlineCode> and are announced 90 days ahead via email + this page.
        </P>
        <Table
          head={["Date", "Version", "Notes"]}
          rows={[
            ["2026-05-31", "v1.0", "Initial public launch — calculators, submissions, quotes, webhook subscriptions, templates, me."],
          ]}
        />
      </section>

      {/* SUPPORT */}
      <section>
        <H2 id="support">Support</H2>
        <P>Three channels, depending on what you need:</P>
        <Table
          head={["Channel", "Best for", "Where"]}
          rows={[
            [
              "Community Discord",
              "Quick questions, sample code, bug commiseration",
              <span key="d" style={{ color: C.muted }}>Discord (coming soon)</span>,
            ],
            [
              "Email",
              "Auth issues, billing, account questions",
              <a key="e" href="mailto:developers@wefixtrades.com" style={{ color: C.accent }}>developers@wefixtrades.com</a>,
            ],
            [
              "Dedicated CSM (Slack)",
              "Agency & Enterprise tier — shared Slack channel, SLA-backed",
              "Contact sales",
            ],
          ]}
        />
        <P>
          For incidents, the API status page lives at{" "}
          <a href="https://status.wefixtrades.com" style={{ color: C.accent }}>
            status.wefixtrades.com
          </a>{" "}
          and is the single source of truth.
        </P>

        <div
          style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap" as const,
          }}
        >
          <Link
            href="/docs"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: C.accent,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <ChevronRight size={14} strokeWidth={1.75} style={{ transform: "rotate(180deg)" }} />
            Back to product docs
          </Link>
          <Link
            href="/portal/api-access"
            data-testid="api-docs-footer-cta"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              background: C.accent,
              borderRadius: 8,
              textDecoration: "none",
            }}
          >
            <Key size={14} strokeWidth={1.75} />
            Get an API key
          </Link>
        </div>
      </section>
    </>
  );
}
