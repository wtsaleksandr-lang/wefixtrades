import { useEffect, useState, type ReactNode } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { mkt } from "@/theme/tokens";
import { V7Hero, V7Section, V7Container, V7PageShell } from "@/components/marketing/v7";

/**
 * Shared chrome for legal / trust pages (Privacy, Terms, Cookies, Security).
 *
 * Adds a sticky "On this page" table-of-contents sidebar (desktop) with
 * active-section highlighting, and a collapsible jump-menu (mobile). Each
 * section gets an id anchor so links are deep-linkable and SEO-friendly.
 */

export type TocItem = { id: string; label: string };

export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 36, scrollMarginTop: 96 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: mkt.onDark, marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${mkt.onDarkBorder}`, letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}

function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-90px 0px -65% 0px", threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return active;
}

export function LegalShell({
  eyebrow = "Legal",
  title,
  sub,
  metaTitle,
  metaDescription,
  canonical,
  toc,
  children,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  metaTitle: string;
  metaDescription: string;
  canonical: string;
  toc: TocItem[];
  children: ReactNode;
}) {
  const active = useActiveSection(toc.map((t) => t.id));

  return (
    <MarketingLayout>
      <PageMeta title={metaTitle} description={metaDescription} canonical={canonical} />
      <V7PageShell>
        <V7Hero productName={eyebrow} headline={title} sub={sub} />
        <V7Section padding="40px">
          <V7Container maxWidth={1040}>
            {/* Mobile jump-menu */}
            <details className="legal-toc-mobile" style={{
              marginBottom: 20, borderRadius: 14, border: `1px solid ${mkt.onDarkBorder}`,
              background: mkt.sectionLight, padding: "12px 16px",
            }}>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: mkt.onDark, listStyle: "none" }}>
                On this page
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
                {toc.map((t) => (
                  <a key={t.id} href={`#${t.id}`} style={{ fontSize: 13, color: mkt.onDarkMuted, textDecoration: "none", padding: "4px 0" }}>
                    {t.label}
                  </a>
                ))}
              </div>
            </details>

            <div className="legal-grid" style={{ display: "grid", gridTemplateColumns: "224px 1fr", gap: 32, alignItems: "start" }}>
              {/* Desktop sticky TOC */}
              <nav className="legal-toc" aria-label="On this page" style={{ position: "sticky", top: 96, alignSelf: "start" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: mkt.textFaint, marginBottom: 12 }}>
                  On this page
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {toc.map((t) => {
                    const isActive = active === t.id;
                    return (
                      <a
                        key={t.id}
                        href={`#${t.id}`}
                        style={{
                          fontSize: 13,
                          lineHeight: 1.4,
                          padding: "6px 10px",
                          borderRadius: 8,
                          textDecoration: "none",
                          borderLeft: `2px solid ${isActive ? mkt.accent : "transparent"}`,
                          color: isActive ? mkt.onDark : mkt.onDarkMuted,
                          fontWeight: isActive ? 650 : 450,
                          background: isActive ? "rgba(13,60,252,0.06)" : "transparent",
                          transition: "color 0.15s, background 0.15s, border-color 0.15s",
                        }}
                      >
                        {t.label}
                      </a>
                    );
                  })}
                </div>
              </nav>

              {/* Content card */}
              <div style={{
                background: mkt.sectionLight,
                borderRadius: 24,
                padding: "44px",
                border: `1px solid ${mkt.onDarkBorder}`,
                minWidth: 0,
              }}>
                {children}
              </div>
            </div>
          </V7Container>
        </V7Section>
      </V7PageShell>

      <style>{`
        html { scroll-behavior: smooth; }
        .legal-toc-mobile { display: none; }
        .legal-toc-mobile summary::-webkit-details-marker { display: none; }
        @media (max-width: 860px) {
          .legal-grid { grid-template-columns: 1fr !important; }
          .legal-toc { display: none !important; }
          .legal-toc-mobile { display: block !important; }
        }
      `}</style>
    </MarketingLayout>
  );
}
