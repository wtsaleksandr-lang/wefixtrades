/**
 * SEO Wave B — `<OptimizedImage>` component.
 *
 * Wraps a `<picture>` with auto-derived `<source type="image/avif">`
 * and `<source type="image/webp">` siblings when the `src` points
 * at a same-origin raster image (see
 * `client/src/lib/seo/imageOptimization.ts`). External URLs (Google
 * Maps CDN, data URIs, etc.) skip the picture wrapper and render a
 * plain `<img>` — same CLS / decoding / loading hints still apply.
 *
 * Defaults chosen for marketing pages:
 *   - `loading="lazy"`  (override to "eager" for above-the-fold)
 *   - `decoding="async"` (always)
 *   - density srcset of 1x/2x/3x for raster originals
 *
 * When `preload` is true the component upserts a
 * `<link rel="preload" as="image">` into `<head>` on mount and
 * removes it on unmount. Use sparingly — preload is intended for
 * the single LCP image per route.
 */

import { useEffect, type CSSProperties, type ImgHTMLAttributes } from "react";
import {
  isOptimizableSrc,
  pictureSources,
  densitySrcSet,
  preloadDescriptor,
} from "@/lib/seo/imageOptimization";

type ImgHandoff = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "srcSet" | "loading" | "decoding" | "width" | "height"
>;

export interface OptimizedImageProps extends ImgHandoff {
  /** Image source. Same-origin raster paths get AVIF/WebP variants. */
  src: string;
  /** Required for SEO + accessibility. Empty string is allowed for decorative imagery. */
  alt: string;
  /** Intrinsic width in CSS pixels — required to prevent CLS. */
  width: number;
  /** Intrinsic height in CSS pixels — required to prevent CLS. */
  height: number;
  /**
   * Native loading hint. Defaults to `"lazy"`. Pass `"eager"` for
   * above-the-fold hero images and pair with `fetchPriority="high"`.
   */
  loading?: "lazy" | "eager";
  /**
   * Native fetchpriority hint. Defaults to `"auto"`. Pass `"high"`
   * for the LCP image and `"low"` for decorative imagery.
   */
  fetchPriority?: "high" | "low" | "auto";
  /** Density variants to emit in the srcset. Defaults to [1, 2, 3]. */
  densities?: readonly number[];
  /** Optional `sizes` attribute for the responsive image. */
  sizes?: string;
  /**
   * When true, injects `<link rel="preload" as="image">` into
   * `<head>` on mount. Only use for the LCP image on a route.
   */
  preload?: boolean;
  /**
   * Disable automatic AVIF/WebP source emission even when the src
   * looks optimizable. Useful when build-time variants haven't been
   * generated for a specific asset.
   */
  disableVariants?: boolean;
  /** Forwarded to the inner `<img>` for sizing / layout. */
  style?: CSSProperties;
  /** Forwarded to the inner `<img>`. */
  className?: string;
}

/**
 * Insert (and clean up) a `<link rel="preload" as="image">` hint in
 * `<head>` for the duration of this component's lifetime.
 */
function usePreloadHint(active: boolean, src: string, sizes?: string, densities?: readonly number[]) {
  useEffect(() => {
    if (!active) return;
    if (typeof document === "undefined") return;
    const desc = preloadDescriptor(src, { sizes, densities });
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = desc.href;
    if (desc.imagesrcset) link.setAttribute("imagesrcset", desc.imagesrcset);
    if (desc.imagesizes) link.setAttribute("imagesizes", desc.imagesizes);
    if (desc.type) link.type = desc.type;
    link.setAttribute("data-optimized-preload", src);
    document.head.appendChild(link);
    return () => {
      link.parentNode?.removeChild(link);
    };
  }, [active, src, sizes, densities]);
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  loading = "lazy",
  fetchPriority = "auto",
  densities = [1, 2, 3],
  sizes,
  preload = false,
  disableVariants = false,
  style,
  className,
  ...rest
}: OptimizedImageProps) {
  usePreloadHint(preload, src, sizes, densities);

  const optimizable = !disableVariants && isOptimizableSrc(src);
  const sources = optimizable ? pictureSources(src, densities) : [];
  const fallbackSrcSet = optimizable ? densitySrcSet(src, densities) : undefined;

  // Cast to lowercase because React 19 accepts `fetchPriority` (camelCase)
  // but TS lib versions vary; the DOM attribute is "fetchpriority".
  const imgProps: ImgHTMLAttributes<HTMLImageElement> & {
    fetchpriority?: "high" | "low" | "auto";
  } = {
    ...rest,
    src,
    srcSet: fallbackSrcSet,
    sizes,
    alt,
    width,
    height,
    loading,
    decoding: "async",
    style,
    className,
  };
  if (fetchPriority !== "auto") {
    imgProps.fetchpriority = fetchPriority;
  }

  if (sources.length === 0) {
    // Plain <img> for external URLs, SVGs, data URIs, etc.
    return <img {...imgProps} />;
  }

  return (
    <picture>
      {sources.map((s) => (
        <source key={s.type} type={s.type} srcSet={s.srcSet} sizes={sizes} />
      ))}
      <img {...imgProps} />
    </picture>
  );
}

export default OptimizedImage;
