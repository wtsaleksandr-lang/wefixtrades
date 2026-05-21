/**
 * Canonical Lucide icon map used by QuoteQuick across the customer-facing
 * advanced calculator (logo fallback) and the admin trade editor's icon picker.
 *
 * Wave W-AI-3a — extracted from AdvancedCalculator.tsx so the same finite set
 * is shared by:
 *   - `client/src/components/quote-widget/AdvancedCalculator.tsx`
 *   - `client/src/components/admin/LucideIconPicker.tsx`
 *
 * Listed as explicit named imports (NOT `import *`) so Vite tree-shakes the
 * 1000+ lucide icons down to just the ones we use. Keep this set tight
 * (target ≤65 icons) — the picker shows ALL of them, so a huge list both
 * bloats the bundle and overwhelms the admin.
 */
import {
  AirVent,
  AlertTriangle,
  Bath,
  BatteryCharging,
  Biohazard,
  Bug,
  Building2,
  Camera,
  Car,
  ChefHat,
  ClipboardCheck,
  Construction,
  DoorOpen,
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
  Microwave,
  Mountain,
  Package,
  PackageOpen,
  PaintBucket,
  Paintbrush,
  Paintbrush2,
  Pickaxe,
  PlugZap,
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
  Plug,
  Trash2,
  TreeDeciduous,
  TreePine,
  Trees,
  Truck,
  WashingMachine,
  Wand2,
  Waves,
  Wind,
  Wrench,
  Zap,
} from "lucide-react";

/**
 * Canonical icon map. Keys are the names persisted in
 * `templates.defaultIcon` and `trade_overrides.defaultIcon` jsonb.
 */
export const QUOTEQUICK_ICONS = {
  AirVent,
  AlertTriangle,
  Bath,
  BatteryCharging,
  Biohazard,
  Bug,
  Building2,
  Camera,
  Car,
  ChefHat,
  ClipboardCheck,
  Construction,
  DoorOpen,
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
  Microwave,
  Mountain,
  Package,
  PackageOpen,
  PaintBucket,
  Paintbrush,
  Paintbrush2,
  Pickaxe,
  PlugZap,
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
  Plug,
  Trash2,
  TreeDeciduous,
  TreePine,
  Trees,
  Truck,
  WashingMachine,
  Wand2,
  Waves,
  Wind,
  Wrench,
  Zap,
} as const;

export type QuoteQuickIconName = keyof typeof QUOTEQUICK_ICONS;

export const QUOTEQUICK_ICON_NAMES: QuoteQuickIconName[] = Object.keys(
  QUOTEQUICK_ICONS,
) as QuoteQuickIconName[];

export function getQuoteQuickIcon(name: string | undefined | null) {
  if (!name) return null;
  return (QUOTEQUICK_ICONS as Record<string, typeof Truck | undefined>)[name] ?? null;
}
