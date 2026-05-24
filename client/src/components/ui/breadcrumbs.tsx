import * as React from "react";
import { Link } from "wouter";
import { ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Single breadcrumb segment.
 * - `label`: human-readable text shown for the segment.
 * - `to`: optional path. When provided the segment is clickable and uses
 *   wouter's <Link>. When omitted the segment renders as the current
 *   page (bold, non-clickable, aria-current="page").
 */
export type BreadcrumbItem = {
  label: string;
  to?: string;
};

/**
 * Clickable breadcrumbs row shared between admin + portal layouts.
 *
 * Visual rules (per DESIGN-SYSTEM.md):
 *  - text-sm, muted-by-default, brand-blue on hover for clickable items.
 *  - Current page is bold + non-clickable.
 *  - ChevronRight separators in a low-contrast grey.
 *  - Mobile (<sm): collapse middle segments with an ellipsis when the
 *    trail has more than 3 items — keep first + last 2 visible so the
 *    user always knows where they came from and where they are.
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  if (!items || items.length === 0) return null;

  // Mobile collapse: keep first + last 2 items when >3 total
  const shouldCollapse = items.length > 3;
  const collapsedMobile: Array<BreadcrumbItem | "ellipsis"> = shouldCollapse
    ? [items[0], "ellipsis", ...items.slice(-2)]
    : items;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("w-full", className)}
      data-testid="breadcrumbs"
    >
      {/* Mobile (collapsed) — visible <sm only */}
      <ol className="flex sm:hidden flex-wrap items-center gap-1 text-sm text-gray-500">
        {collapsedMobile.map((seg, idx) => (
          <BreadcrumbSegmentLi
            key={idx}
            seg={seg}
            isLast={idx === collapsedMobile.length - 1}
          />
        ))}
      </ol>
      {/* Desktop (full trail) — visible sm and up */}
      <ol className="hidden sm:flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
        {items.map((seg, idx) => (
          <BreadcrumbSegmentLi
            key={idx}
            seg={seg}
            isLast={idx === items.length - 1}
          />
        ))}
      </ol>
    </nav>
  );
}

function BreadcrumbSegmentLi({
  seg,
  isLast,
}: {
  seg: BreadcrumbItem | "ellipsis";
  isLast: boolean;
}) {
  if (seg === "ellipsis") {
    return (
      <li className="inline-flex items-center gap-1.5">
        <span
          className="inline-flex items-center text-gray-400"
          aria-hidden="true"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
          <span className="sr-only">More</span>
        </span>
        <ChevronRight
          className="w-3.5 h-3.5 text-gray-300 shrink-0"
          aria-hidden="true"
        />
      </li>
    );
  }

  return (
    <li className="inline-flex items-center gap-1.5">
      {isLast || !seg.to ? (
        <span
          aria-current={isLast ? "page" : undefined}
          className="font-semibold text-gray-900 truncate max-w-[16rem]"
        >
          {seg.label}
        </span>
      ) : (
        <Link
          href={seg.to}
          className="text-gray-500 hover:text-brand-blue transition-colors truncate max-w-[12rem]"
        >
          {seg.label}
        </Link>
      )}
      {!isLast && (
        <ChevronRight
          className="w-3.5 h-3.5 text-gray-300 shrink-0"
          aria-hidden="true"
        />
      )}
    </li>
  );
}

export default Breadcrumbs;
