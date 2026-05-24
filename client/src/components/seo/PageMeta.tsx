/**
 * SEO Wave A — `<PageMeta>` component.
 *
 * Imperatively upserts `<title>`, meta tags, canonical link, and
 * `<script type="application/ld+json">` JSON-LD blocks into the
 * document head whenever the props change. No react-helmet dep —
 * the SPA mounts/unmounts route components on navigation, so the
 * effect fires for each page transition and replaces the prior
 * values.
 *
 * Why imperative DOM and not a head-manager? The project does not
 * currently depend on react-helmet or @tanstack/react-query head
 * helpers. Adding one would broaden the install footprint for one
 * wave of work. The DOM approach is forty lines, no deps, and
 * gives crawlers (Googlebot evaluates JS) populated metadata once
 * the route renders.
 */

import { useEffect } from "react";
import {
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  SITE_URL,
  TWITTER_HANDLE,
  type PageMeta as PageMetaConfig,
} from "@/lib/seo/pageMeta";

type PageMetaProps = PageMetaConfig;

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function removeMeta(attr: "name" | "property", key: string) {
  const el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (el) el.parentNode?.removeChild(el);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function resolveCanonical(canonical?: string): string {
  if (canonical) {
    // Absolute URL? leave it. Otherwise treat as path on SITE_URL.
    if (/^https?:\/\//i.test(canonical)) return canonical;
    return `${SITE_URL}${canonical.startsWith("/") ? canonical : `/${canonical}`}`;
  }
  if (typeof window === "undefined") return SITE_URL;
  const path = window.location.pathname || "/";
  return `${SITE_URL}${path}`;
}

export function PageMeta(props: PageMetaProps) {
  const {
    title,
    description,
    canonical,
    ogImage,
    ogType,
    keywords,
    jsonLd,
    noIndex,
  } = props;

  useEffect(() => {
    // Title
    document.title = `${title} · ${SITE_NAME}`;

    // Description
    upsertMeta("name", "description", description);

    // Keywords (optional)
    if (keywords && keywords.length > 0) {
      upsertMeta("name", "keywords", keywords.join(", "));
    } else {
      removeMeta("name", "keywords");
    }

    // Robots
    if (noIndex) {
      upsertMeta("name", "robots", "noindex, nofollow");
    } else {
      // Default index/follow — explicit so any prior noindex from a
      // previous route is cleared on navigation.
      upsertMeta("name", "robots", "index, follow");
    }

    const resolvedCanonical = resolveCanonical(canonical);
    const resolvedImage = ogImage ?? DEFAULT_OG_IMAGE;
    const absoluteImage = /^https?:\/\//i.test(resolvedImage)
      ? resolvedImage
      : `${SITE_URL}${resolvedImage.startsWith("/") ? resolvedImage : `/${resolvedImage}`}`;
    const resolvedType = ogType ?? "website";

    // Open Graph
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", resolvedType);
    upsertMeta("property", "og:image", absoluteImage);
    upsertMeta("property", "og:url", resolvedCanonical);
    upsertMeta("property", "og:site_name", SITE_NAME);

    // Twitter card
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", absoluteImage);
    upsertMeta("name", "twitter:site", TWITTER_HANDLE);

    // Canonical link
    upsertCanonical(resolvedCanonical);

    // JSON-LD — clear any prior page-scoped scripts, then inject fresh.
    document.head.querySelectorAll('script[data-jsonld="page"]').forEach((el) => {
      el.parentNode?.removeChild(el);
    });
    const items: object[] = Array.isArray(jsonLd)
      ? jsonLd
      : jsonLd
        ? [jsonLd]
        : [];
    for (const obj of items) {
      const script = document.createElement("script");
      script.setAttribute("type", "application/ld+json");
      script.setAttribute("data-jsonld", "page");
      script.textContent = JSON.stringify(obj);
      document.head.appendChild(script);
    }

    return () => {
      // No teardown — leave the meta tags in place; the next route
      // will overwrite them. Removing on unmount would briefly flash
      // the index.html defaults during navigation.
    };
  }, [title, description, canonical, ogImage, ogType, keywords, jsonLd, noIndex]);

  return null;
}
