/**
 * SEO Wave A — Per-page meta configuration types and shared defaults.
 *
 * Every public marketing page renders a `<PageMeta>` component (see
 * `client/src/components/seo/PageMeta.tsx`) that injects the values
 * below into the document head at runtime. SPA SEO is not perfect
 * (server-side rendering would be better), but Googlebot evaluates
 * JS, so this gives crawlers a populated <title>, description, OG
 * tags, Twitter card, canonical link, and JSON-LD per route.
 */

export interface PageMeta {
  /** Page title — rendered as `<title>{title} · WeFixTrades</title>`. */
  title: string;
  /** Meta description — kept under 160 chars for SERPs. */
  description: string;
  /** Canonical URL. Defaults to the current pathname on PUBLIC_BASE_URL. */
  canonical?: string;
  /** OG image absolute or root-relative URL. Defaults to {@link DEFAULT_OG_IMAGE}. */
  ogImage?: string;
  /** OG type — `website` for most marketing pages, `product` for product pages, `article` for blog posts. */
  ogType?: "website" | "article" | "product";
  /** Keywords (comma-joined into a meta tag — modest SEO value but harmless). */
  keywords?: string[];
  /** JSON-LD structured data — single object or array of objects. */
  jsonLd?: object | object[];
  /** When true, emits `<meta name="robots" content="noindex, nofollow">`. */
  noIndex?: boolean;
}

/**
 * Default Open Graph image. The brand placeholder lives in
 * `client/public/brand/og-default.png`. If the file is missing
 * (Wave A ships without a custom OG image), the meta tag still
 * resolves to a 404 — that's fine for crawlers; a follow-up wave
 * should generate a proper 1200x630 brand-aware PNG.
 */
export const DEFAULT_OG_IMAGE = "/brand/og-default.png";

export const SITE_NAME = "WeFixTrades";
export const SITE_URL = "https://wefixtrades.com";
export const TWITTER_HANDLE = "@wefixtrades";
