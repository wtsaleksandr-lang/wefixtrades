import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { V7PageShell } from "@/components/marketing/v7";
import { mkt } from "@/theme/tokens";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { SITE_URL } from "@/lib/seo/pageMeta";
import { buildArticleJsonLd } from "@shared/seoContentPage";

/* ════════════════════════════════════════════════════════════════════════
   DB-backed SEO article page — /blog/:slug.

   Renders a PUBLISHED seo_content_pages row fetched from
   GET /api/blog/articles/:slug. This is the owned-domain SEO engine's render
   surface: each article emits Article + BreadcrumbList JSON-LD, a canonical,
   and a real author entity (E-E-A-T) via the shared <PageMeta>.

   Visibility is enforced server-side: draft/in_review/archived/missing slugs
   404, so this page shows a clean "not found" state + noindex for any
   non-published slug — unpublished content is never indexable.
   ════════════════════════════════════════════════════════════════════════ */

interface ArticleResponse {
  article: {
    slug: string;
    title: string;
    metaDescription: string;
    excerpt: string;
    content: string;
    jsonldType: string;
    author: string;
    canonical: string | null;
    publishedAt: string | null;
    updatedAt: string | null;
  };
}

/** Minimal, dependency-free + XSS-safe markdown-ish renderer.
 *  Splits on blank lines; lines starting with `## ` become H2, `### ` H3,
 *  everything else a paragraph. No raw HTML is injected (no
 *  dangerouslySetInnerHTML), so user/LLM content cannot inject markup. */
function ArticleBody({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div style={{ fontSize: 16, color: mkt.onDark, lineHeight: 1.75 }}>
      {blocks.map((block, i) => {
        if (block.startsWith("### ")) {
          return (
            <h3 key={i} style={{
              fontSize: 20, fontWeight: 700, color: mkt.onDark,
              margin: "32px 0 12px", lineHeight: 1.3, letterSpacing: "-0.01em",
            }}>{block.slice(4)}</h3>
          );
        }
        if (block.startsWith("## ")) {
          return (
            <h2 key={i} style={{
              fontSize: 24, fontWeight: 700, color: mkt.onDark,
              margin: "40px 0 14px", lineHeight: 1.25, letterSpacing: "-0.015em",
            }}>{block.slice(3)}</h2>
          );
        }
        return <p key={i} style={{ margin: "0 0 20px" }}>{block}</p>;
      })}
    </div>
  );
}

async function fetchArticle(slug: string): Promise<ArticleResponse | null> {
  const res = await fetch(`/api/blog/articles/${encodeURIComponent(slug)}`, {
    credentials: "include",
  });
  if (res.status === 404) return null; // not published / missing
  if (!res.ok) throw new Error(`Failed to load article (${res.status})`);
  return res.json();
}

export default function BlogArticlePage({ slug }: { slug: string }) {
  const { data, isLoading, isError } = useQuery<ArticleResponse | null>({
    queryKey: ["/api/blog/articles", slug],
    queryFn: () => fetchArticle(slug),
  });

  const article = data?.article ?? null;
  const canonicalPath = `/blog/${slug}`;
  const canonical = article?.canonical ?? canonicalPath;

  // Breadcrumb JSON-LD (only meaningful when the article exists).
  useBreadcrumbSchema(
    article
      ? [
          { name: "Home", url: SITE_URL },
          { name: "Blog", url: `${SITE_URL}/blog` },
          { name: article.title, url: `${SITE_URL}${canonicalPath}` },
        ]
      : [],
  );

  // ── Not published / missing → clean not-found + noindex ──
  if (!isLoading && (article === null || isError)) {
    return (
      <MarketingLayout>
        <PageMeta
          title="Article not found"
          description="This article is not available."
          canonical={canonicalPath}
          noIndex
        />
        <V7PageShell>
          <section style={{ background: mkt.bg, padding: "80px 16px", textAlign: "center" }}>
            <div style={{ maxWidth: 560, margin: "0 auto" }}>
              <h1 style={{ fontSize: "clamp(24px,4vw,34px)", fontWeight: 700, color: mkt.onDark, margin: "0 0 12px" }}>
                Article not found
              </h1>
              <p style={{ fontSize: 15, color: mkt.onDarkMuted, margin: "0 0 28px" }}>
                The article you’re looking for isn’t published yet, or the link has changed.
              </p>
              <Link href="/blog" style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 14, fontWeight: 600, color: mkt.accent, textDecoration: "none",
              }}>
                <ArrowLeft size={14} /> Back to all articles
              </Link>
            </div>
          </section>
        </V7PageShell>
      </MarketingLayout>
    );
  }

  // ── Loading skeleton (no PageMeta noindex flip; keep default index) ──
  if (isLoading || !article) {
    return (
      <MarketingLayout>
        <V7PageShell>
          <section style={{ background: mkt.bg, padding: "60px 16px", minHeight: "40vh" }}>
            <div style={{ maxWidth: 760, margin: "0 auto", color: mkt.onDarkMuted, fontSize: 14 }}>
              Loading…
            </div>
          </section>
        </V7PageShell>
      </MarketingLayout>
    );
  }

  // ── Published article — Article + Breadcrumb JSON-LD via PageMeta ──
  // Built from the shared pure helper so the emitted JSON-LD is identical to
  // what the guard test asserts (author entity always present for E-E-A-T).
  const articleJsonLd = buildArticleJsonLd({
    slug: article.slug,
    title: article.title,
    status: "published",
    author_entity: article.author,
    meta_description: article.metaDescription,
    excerpt: article.excerpt,
    jsonld_type: article.jsonldType,
    canonical: article.canonical,
    published_at: article.publishedAt,
    updated_at: article.updatedAt,
  });

  const dateLabel = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "short" })
    : "";

  return (
    <MarketingLayout>
      <PageMeta
        title={article.title}
        description={article.metaDescription || article.excerpt || article.title}
        canonical={canonical}
        ogType="article"
        jsonLd={articleJsonLd}
      />
      <V7PageShell>
        <section style={{ background: mkt.bg, padding: "44px 16px 60px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <Link href="/blog" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 600, color: mkt.accent,
              textDecoration: "none", marginBottom: 24,
            }}>
              <ArrowLeft size={14} /> Back to all articles
            </Link>

            <h1 style={{
              fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700,
              color: mkt.onDark, margin: "0 0 8px",
              lineHeight: 1.2, letterSpacing: "-0.02em",
            }}>{article.title}</h1>

            <p style={{ fontSize: 14, color: mkt.onDarkMuted, margin: "0 0 32px" }}>
              {article.author}{dateLabel ? ` · ${dateLabel}` : ""}
            </p>

            <ArticleBody markdown={article.content} />

            <div style={{
              borderTop: `1px solid ${mkt.onDarkBorder}`,
              paddingTop: 32, marginTop: 40, textAlign: "center",
            }}>
              <p style={{ fontSize: 15, color: mkt.onDarkMuted, marginBottom: 16 }}>
                Want help implementing these strategies for your business?
              </p>
              <Link href="/wizard" style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "12px 28px", borderRadius: 14,
                background: mkt.accent, color: mkt.onDark,
                fontSize: 15, fontWeight: 700, textDecoration: "none",
              }}>
                Get Started Free <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      </V7PageShell>
    </MarketingLayout>
  );
}
