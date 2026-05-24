/**
 * Canonical Lucide icon map used by QuoteQuick across the customer-facing
 * advanced calculator (logo fallback) and the admin trade editor's icon picker.
 *
 * Curated to ~72 icons across 8 categories — kept tight so:
 *   - Vite tree-shakes the 1000+ lucide icons to just what we render.
 *   - Admins aren't overwhelmed; every icon is genuinely useful for
 *     home-services / trades / quoting flows.
 *
 * Consumers:
 *   - `client/src/components/quote-widget/AdvancedCalculator.tsx`
 *   - `client/src/components/admin/LucideIconPicker.tsx`
 *
 * To add an icon: add the named import, add it to QUOTEQUICK_ICONS, and add
 * its name to the appropriate category in QUOTEQUICK_ICON_CATEGORIES.
 */
import {
  AirVent,
  AlertTriangle,
  AppWindow,
  Axe,
  Bath,
  BatteryCharging,
  Biohazard,
  Bolt,
  Bug,
  Building2,
  Calendar,
  Camera,
  Car,
  ChefHat,
  ClipboardCheck,
  Clock,
  Construction,
  CreditCard,
  DollarSign,
  DoorOpen,
  Drill,
  Droplet,
  Droplets,
  Fence,
  Flame,
  Globe,
  Hammer,
  HardHat,
  Home,
  KeyRound,
  Lamp,
  Layers,
  Leaf,
  Lightbulb,
  Lock,
  Mail,
  MessageCircle,
  Microwave,
  Mountain,
  Package,
  PackageOpen,
  PaintBucket,
  Paintbrush,
  Paintbrush2,
  Phone,
  Pickaxe,
  Plug,
  PlugZap,
  Receipt,
  RectangleHorizontal,
  Refrigerator,
  Scissors,
  Settings,
  Shield,
  ShowerHead,
  Snowflake,
  Sparkles,
  SprayCan,
  Sun,
  Thermometer,
  Trash2,
  TreeDeciduous,
  TreePine,
  Trees,
  Truck,
  Wand2,
  Warehouse,
  WashingMachine,
  Waves,
  Wind,
  Wrench,
  Zap,
} from "lucide-react";

/**
 * Canonical icon map. Keys are the names persisted in
 * `templates.defaultIcon` and `trade_overrides.defaultIcon` jsonb.
 *
 * Note: lucide-react 0.453 has no Saw or Screwdriver export, so we use
 * Axe and Bolt as the closest tool stand-ins.
 */
export const QUOTEQUICK_ICONS = {
  AirVent,
  AlertTriangle,
  AppWindow,
  Axe,
  Bath,
  BatteryCharging,
  Biohazard,
  Bolt,
  Bug,
  Building2,
  Calendar,
  Camera,
  Car,
  ChefHat,
  ClipboardCheck,
  Clock,
  Construction,
  CreditCard,
  DollarSign,
  DoorOpen,
  Drill,
  Droplet,
  Droplets,
  Fence,
  Flame,
  Globe,
  Hammer,
  HardHat,
  Home,
  KeyRound,
  Lamp,
  Layers,
  Leaf,
  Lightbulb,
  Lock,
  Mail,
  MessageCircle,
  Microwave,
  Mountain,
  Package,
  PackageOpen,
  PaintBucket,
  Paintbrush,
  Paintbrush2,
  Phone,
  Pickaxe,
  Plug,
  PlugZap,
  Receipt,
  RectangleHorizontal,
  Refrigerator,
  Scissors,
  Settings,
  Shield,
  ShowerHead,
  Snowflake,
  Sparkles,
  SprayCan,
  Sun,
  Thermometer,
  Trash2,
  TreeDeciduous,
  TreePine,
  Trees,
  Truck,
  Wand2,
  Warehouse,
  WashingMachine,
  Waves,
  Wind,
  Wrench,
  Zap,
} as const;

export type QuoteQuickIconName = keyof typeof QUOTEQUICK_ICONS;

export const QUOTEQUICK_ICON_NAMES: QuoteQuickIconName[] = Object.keys(
  QUOTEQUICK_ICONS,
) as QuoteQuickIconName[];

/**
 * Category grouping for the curated picker. Order here drives chip order
 * in the UI. Every icon in QUOTEQUICK_ICONS must appear in exactly one
 * category — `QUOTEQUICK_ICON_CATEGORY_OF` is derived from this.
 */
export const QUOTEQUICK_ICON_CATEGORIES = [
  {
    id: "tools",
    label: "Tools",
    icons: [
      "Hammer",
      "Wrench",
      "Bolt",
      "Drill",
      "Axe",
      "Pickaxe",
      "HardHat",
      "Construction",
      "Paintbrush",
      "Paintbrush2",
      "PaintBucket",
      "SprayCan",
      "Settings",
      "Wand2",
    ] satisfies QuoteQuickIconName[],
  },
  {
    id: "home",
    label: "Home",
    icons: [
      "Home",
      "DoorOpen",
      "AppWindow",
      "KeyRound",
      "Warehouse",
      "Building2",
      "Fence",
      "Lock",
      "Shield",
      "Layers",
      "RectangleHorizontal",
    ] satisfies QuoteQuickIconName[],
  },
  {
    id: "vehicle",
    label: "Vehicle",
    icons: ["Truck", "Car", "Package", "PackageOpen"] satisfies QuoteQuickIconName[],
  },
  {
    id: "comfort",
    label: "Comfort",
    icons: [
      "Thermometer",
      "Snowflake",
      "Sun",
      "Droplet",
      "Droplets",
      "Flame",
      "Wind",
      "AirVent",
      "Waves",
      "Sparkles",
    ] satisfies QuoteQuickIconName[],
  },
  {
    id: "outdoor",
    label: "Outdoor",
    icons: [
      "Leaf",
      "TreePine",
      "TreeDeciduous",
      "Trees",
      "Scissors",
      "Mountain",
      "Globe",
    ] satisfies QuoteQuickIconName[],
  },
  {
    id: "utility",
    label: "Utility",
    icons: [
      "Zap",
      "Plug",
      "PlugZap",
      "Lightbulb",
      "Lamp",
      "BatteryCharging",
      "Trash2",
      "Biohazard",
      "Bug",
    ] satisfies QuoteQuickIconName[],
  },
  {
    id: "service",
    label: "Service",
    icons: [
      "Calendar",
      "Clock",
      "Phone",
      "MessageCircle",
      "Mail",
      "Camera",
      "ChefHat",
      "ClipboardCheck",
      "Microwave",
      "Refrigerator",
      "WashingMachine",
      "ShowerHead",
      "Bath",
      "AlertTriangle",
    ] satisfies QuoteQuickIconName[],
  },
  {
    id: "money",
    label: "Money",
    icons: ["DollarSign", "CreditCard", "Receipt"] satisfies QuoteQuickIconName[],
  },
] as const;

export type QuoteQuickIconCategoryId = (typeof QUOTEQUICK_ICON_CATEGORIES)[number]["id"];

/** Reverse lookup: icon name -> category id. */
export const QUOTEQUICK_ICON_CATEGORY_OF: Record<QuoteQuickIconName, QuoteQuickIconCategoryId> =
  QUOTEQUICK_ICON_CATEGORIES.reduce(
    (acc, cat) => {
      for (const name of cat.icons) acc[name] = cat.id;
      return acc;
    },
    {} as Record<QuoteQuickIconName, QuoteQuickIconCategoryId>,
  );

export function getQuoteQuickIcon(name: string | undefined | null) {
  if (!name) return null;
  return (QUOTEQUICK_ICONS as Record<string, typeof Truck | undefined>)[name] ?? null;
}
