/**
 * SEO Wave B — image optimization helpers.
 *
 * Static images served from `client/public/` can be paired with
 * `.webp` and `.avif` siblings generated at build time (see
 * `scripts/seo/generate-image-variants.mjs`). The runtime helpers
 * below derive the variant paths from a base `.png` / `.jpg` URL
 * and expose a srcset string for density-based responsive serving.
 *
 * Variants are only derived when the source is a same-origin path
 * (starts with "/" and ends in a known raster extension). External
 * URLs (https://lh3.googleusercontent.com/..., CDN URLs, blob:,
 * data:) skip variant generation entirely so the consumer falls
 * back to a plain <img> render. This keeps the helper safe to
 * point at user-supplied or third-party image URLs.
 */
export type ImageVariantFormat = "avif" | "webp";

export const VARIANT_FORMATS: readonly ImageVariantFormat[] = ["avif", "webp"];

const RASTER_EXT_RE = /\.(png|jpe?g)$/i;

/**
 * Returns true when `src` is a same-origin raster image whose
 * `.webp` / `.avif` siblings can be derived by replacing the
 * extension. Used to gate <picture><source> emission.
 */
export function isOptimizableSrc(src: string): boolean {
  if (!src) return false;
  if (!src.startsWith("/")) return false;
  return RASTER_EXT_RE.test(src);
}

/**
 * Replace the file extension on a same-origin raster path with the
 * given variant format. Returns null when the source is not
 * optimizable (external URL, svg, data URI, etc.).
 *
 * Example:
 *   variantSrc("/free-tools/previews/faq.png", "webp")
 *     => "/free-tools/previews/faq.webp"
 */
export function variantSrc(src: string, format: ImageVariantFormat): string | null {
  if (!isOptimizableSrc(src)) return null;
  return src.replace(RASTER_EXT_RE, `.${format}`);
}

/**
 * Build a density-based srcset string from a base path. Caller
 * supplies the @2x / @3x suffix convention; defaults to "@2x" and
 * "@3x" appended before the extension.
 *
 * If those sibling files do not exist on disk the browser will
 * silently fall back to the 1x source. Callers that know there is
 * no @2x variant should pass densities=[1].
 */
export function densitySrcSet(
  src: string,
  densities: readonly number[] = [1, 2, 3],
): string {
  if (!src || densities.length === 0) return src;
  const ext = src.match(RASTER_EXT_RE)?.[0];
  if (!ext) return densities.map((d) => `${src} ${d}x`).join(", ");
  const base = src.slice(0, -ext.length);
  return densities
    .map((d) => {
      if (d === 1) return `${src} 1x`;
      return `${base}@${d}x${ext} ${d}x`;
    })
    .join(", ");
}

/**
 * Returns an array of `<source>` descriptors (one per variant
 * format, AVIF first) for a same-origin raster source. Empty array
 * when the source can't be optimized.
 */
export interface PictureSource {
  type: `image/${ImageVariantFormat}`;
  srcSet: string;
}

export function pictureSources(
  src: string,
  densities: readonly number[] = [1, 2, 3],
): PictureSource[] {
  if (!isOptimizableSrc(src)) return [];
  return VARIANT_FORMATS.map((format) => {
    const variant = variantSrc(src, format);
    if (!variant) return null;
    return {
      type: `image/${format}` as const,
      srcSet: densitySrcSet(variant, densities),
    };
  }).filter((s): s is PictureSource => s !== null);
}

/**
 * Attribute payload for `<link rel="preload" as="image">`. Used by
 * `<OptimizedImage preload>` to hint the most modern variant the
 * browser supports.
 *
 * Preference order: avif → webp → original. The browser will use
 * `imagesrcset` + the `type` hint to skip variants it can't decode.
 */
export interface PreloadDescriptor {
  href: string;
  imagesrcset?: string;
  imagesizes?: string;
  type?: `image/${ImageVariantFormat}`;
}

export function preloadDescriptor(
  src: string,
  options: {
    densities?: readonly number[];
    sizes?: string;
    /** When true, prefer the AVIF variant in the preload hint. */
    preferAvif?: boolean;
  } = {},
): PreloadDescriptor {
  const { densities = [1, 2, 3], sizes, preferAvif = true } = options;
  const optimizable = isOptimizableSrc(src);
  if (!optimizable) {
    return { href: src, imagesizes: sizes };
  }
  const format: ImageVariantFormat = preferAvif ? "avif" : "webp";
  const variant = variantSrc(src, format) ?? src;
  return {
    href: variant,
    imagesrcset: densitySrcSet(variant, densities),
    imagesizes: sizes,
    type: `image/${format}`,
  };
}
