/**
 * BD-2a / BD-1 — category icon shown LEFT of the step title in the widget
 * header (16–20px). One icon per category from the BB-2 taxonomy. Templates
 * can override per-template via the optional `categoryIcon` field on
 * `AdvancedConfig` / `TemplateConfig`.
 *
 * Lucide icons are explicit named imports so Vite tree-shakes them out of
 * the wider lucide-react bundle.
 */
import {
  Wrench, HardHat, SprayCan, Home, AlertTriangle, Trees, Briefcase,
  type LucideIcon,
} from 'lucide-react';
import { resolveDerivedCategoryId, type DerivedCategoryId } from '@shared/templatePresets';

/**
 * Map every derived category to a single Lucide icon. Mirrors the 7-category
 * brief (Automotive, Construction, Cleaning, HomeImprovement, Emergency,
 * Outdoor, Professional). The `default` bucket falls back to Briefcase so a
 * mis-categorised template still renders something sensible.
 */
const CATEGORY_ICON_MAP: Record<DerivedCategoryId, LucideIcon> = {
  automotive: Wrench,
  construction: HardHat,
  cleaning: SprayCan,
  'home-improvement': Home,
  emergency: AlertTriangle,
  outdoor: Trees,
  professional: Briefcase,
  default: Briefcase,
};

/**
 * Optional per-template override — map a lowercase name string to a Lucide
 * icon. Kept TINY on purpose so templates picking an override don't bloat
 * the bundle with the whole lucide set.
 */
const OVERRIDE_ICON_MAP: Record<string, LucideIcon> = {
  wrench: Wrench,
  car: Wrench,
  hardhat: HardHat,
  spraycan: SprayCan,
  home: Home,
  alerttriangle: AlertTriangle,
  trees: Trees,
  briefcase: Briefcase,
};

/**
 * Resolve a `LucideIcon` for the given category + optional template override.
 * Override wins when present and recognised; otherwise the derived category
 * decides; otherwise `Briefcase` (the safe fallback).
 */
export function resolveCategoryIcon(
  category: string | undefined,
  override?: string,
): LucideIcon {
  if (override) {
    const key = override.trim().toLowerCase();
    if (OVERRIDE_ICON_MAP[key]) return OVERRIDE_ICON_MAP[key];
  }
  const derived = resolveDerivedCategoryId(category);
  return CATEGORY_ICON_MAP[derived];
}

interface Props {
  /** Template category string (e.g. "Automotive", "Cleaning"). */
  category?: string;
  /** Optional per-template override (icon name, case-insensitive). */
  override?: string;
  /** Pixel size. Brief calls for 16–20px; default 18. */
  size?: number;
  /** Accent / stroke colour (typically the resolved widget accent). */
  color?: string;
  /** Stroke width. Default 2 — matches lucide's default. */
  strokeWidth?: number;
}

/**
 * Small inline category icon. Renders nothing if no category resolves —
 * callers should treat the slot as optional.
 */
export default function CategoryIcon({
  category, override, size = 18, color, strokeWidth = 2,
}: Props) {
  const Icon = resolveCategoryIcon(category, override);
  return (
    <Icon
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      data-testid="quote-widget-category-icon"
      data-component-name="Category icon"
      data-component-type="category-icon"
    />
  );
}
