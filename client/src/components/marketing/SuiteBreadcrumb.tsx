/**
 * SuiteBreadcrumb — Wave 11D D5
 *
 * Visual breadcrumb for MapGuard Suite member product pages. Renders
 * `Home › MapGuard Suite › [Product]`. The BreadcrumbList JSON-LD is
 * emitted separately on each page (via useBreadcrumbSchema or inline
 * breadcrumbList()); this is the user-visible companion.
 *
 * Supports both light + dark theme via the `variant` prop.
 */

import { Link } from "wouter";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

interface SuiteBreadcrumbProps {
  productName: string;
  /**
   * Visual variant. "dark" (default) for V7 dark hero pages; "light"
   * for pages with white/light backgrounds (CitationTrackerPage).
   */
  variant?: "dark" | "light";
}

export function SuiteBreadcrumb({ productName, variant = "dark" }: SuiteBreadcrumbProps) {
  const baseColor = variant === "light" ? "rgba(15,23,42,0.5)" : mkt.onDarkFaint;
  const linkColor = variant === "light" ? "rgba(15,23,42,0.7)" : mkt.onDarkMuted;
  const currentColor = variant === "light" ? "rgba(15,23,42,0.92)" : mkt.onDark;

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        padding: "20px 24px 0",
        maxWidth: 1180,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <ol
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          fontFamily: MONO,
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: baseColor,
        }}
      >
        <li>
          <Link href="/" style={{ color: linkColor, textDecoration: "none" }}>
            Home
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link href="/mapguard-suite" style={{ color: linkColor, textDecoration: "none" }}>
            MapGuard Suite
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" style={{ color: currentColor }}>
          {productName}
        </li>
      </ol>
    </nav>
  );
}

export default SuiteBreadcrumb;
