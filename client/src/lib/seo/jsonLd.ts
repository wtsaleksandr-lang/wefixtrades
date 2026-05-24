/**
 * SEO Wave A — JSON-LD schema.org generators.
 *
 * Each helper returns a plain object ready to be `JSON.stringify`'d
 * inside a `<script type="application/ld+json">` tag. Pass to
 * `<PageMeta jsonLd={...} />` either as a single object or an array.
 *
 * Keep generators pure (no DOM, no network) so they can also be used
 * for server-rendered HTML in future waves.
 */

import { SITE_NAME, SITE_URL } from "./pageMeta";

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/brand/icon.svg`,
    sameAs: [
      // Social profiles wired up as accounts are created.
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "Customer Support",
      url: `${SITE_URL}/contact`,
    },
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export interface ProductSchemaInput {
  name: string;
  slug: string;
  description: string;
  price?: number;
  image?: string;
}

export function productSchema(product: ProductSchemaInput) {
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    url: `${SITE_URL}/products/${product.slug}`,
  };
  if (product.image) base.image = product.image;
  if (product.price !== undefined) {
    base.offers = {
      "@type": "Offer",
      price: product.price.toString(),
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/products/${product.slug}`,
    };
  }
  return base;
}

export interface ArticleSchemaInput {
  title: string;
  description: string;
  image?: string;
  datePublished: string;
  dateModified?: string;
  author: string;
  url?: string;
}

export function articleSchema(article: ArticleSchemaInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    image: article.image,
    datePublished: article.datePublished,
    dateModified: article.dateModified ?? article.datePublished,
    author: { "@type": "Person", name: article.author },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/brand/icon.svg` },
    },
    ...(article.url ? { mainEntityOfPage: article.url } : {}),
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function faqSchema(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function breadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// Alias to match PR #679 audit naming conventions.
export const breadcrumbList = breadcrumbSchema;

/* ─── SoftwareApplication ─────────────────────────────────────────
   schema.org/SoftwareApplication — used on /products/{slug} pages
   to mark up SaaS products. Google's Rich Result test surfaces the
   price, rating, and applicationCategory in SERP previews. */
export interface SoftwareApplicationOffer {
  price: string | number;
  priceCurrency?: string;
  url?: string;
}

export interface SoftwareApplicationInput {
  name: string;
  description: string;
  applicationCategory?: string;
  operatingSystem?: string;
  url?: string;
  image?: string;
  offers?: SoftwareApplicationOffer | SoftwareApplicationOffer[];
}

export function softwareApplication(input: SoftwareApplicationInput) {
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: input.name,
    description: input.description,
    applicationCategory: input.applicationCategory ?? "BusinessApplication",
    operatingSystem: input.operatingSystem ?? "Web",
  };
  if (input.url) base.url = input.url;
  if (input.image) base.image = input.image;
  if (input.offers) {
    const toOffer = (o: SoftwareApplicationOffer) => ({
      "@type": "Offer",
      price: typeof o.price === "number" ? o.price.toString() : o.price,
      priceCurrency: o.priceCurrency ?? "USD",
      ...(o.url ? { url: o.url } : {}),
    });
    base.offers = Array.isArray(input.offers)
      ? input.offers.map(toOffer)
      : toOffer(input.offers);
  }
  return base;
}

/* ─── HowTo ───────────────────────────────────────────────────────
   schema.org/HowTo — used on /docs/* pages that walk through a
   step-by-step setup flow (embed, booking, domain, etc.). */
export interface HowToStepInput {
  name: string;
  text: string;
  url?: string;
  image?: string;
}

export interface HowToInput {
  name: string;
  description?: string;
  steps: HowToStepInput[];
  totalTime?: string;
  image?: string;
}

export function howTo(input: HowToInput) {
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: input.name,
    step: input.steps.map((s, idx) => {
      const step: Record<string, unknown> = {
        "@type": "HowToStep",
        position: idx + 1,
        name: s.name,
        text: s.text,
      };
      if (s.url) step.url = s.url;
      if (s.image) step.image = s.image;
      return step;
    }),
  };
  if (input.description) base.description = input.description;
  if (input.totalTime) base.totalTime = input.totalTime;
  if (input.image) base.image = input.image;
  return base;
}

/* ─── Service ─────────────────────────────────────────────────────
   schema.org/Service — used on /services hub. */
export interface ServiceInput {
  name: string;
  serviceType?: string;
  description?: string;
  areaServed?: string | string[];
  provider?: { name: string; url?: string };
  url?: string;
  offers?: SoftwareApplicationOffer | SoftwareApplicationOffer[];
}

export function service(input: ServiceInput) {
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: input.name,
  };
  if (input.serviceType) base.serviceType = input.serviceType;
  if (input.description) base.description = input.description;
  if (input.areaServed) base.areaServed = input.areaServed;
  if (input.url) base.url = input.url;
  if (input.provider) {
    base.provider = {
      "@type": "Organization",
      name: input.provider.name,
      ...(input.provider.url ? { url: input.provider.url } : {}),
    };
  } else {
    base.provider = {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    };
  }
  if (input.offers) {
    const toOffer = (o: SoftwareApplicationOffer) => ({
      "@type": "Offer",
      price: typeof o.price === "number" ? o.price.toString() : o.price,
      priceCurrency: o.priceCurrency ?? "USD",
      ...(o.url ? { url: o.url } : {}),
    });
    base.offers = Array.isArray(input.offers)
      ? input.offers.map(toOffer)
      : toOffer(input.offers);
  }
  return base;
}
