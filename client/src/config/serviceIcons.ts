/**
 * Centralized service-id → Lucide icon mapping.
 *
 * Mirrors the icons used in admin sidebar (`AdminLayout.tsx`) so customer
 * surfaces (portal catalog, services list, dashboards) display the same
 * brand-consistent icon for each product.
 *
 * Service ids may include suffixes like `-setup` / `-ongoing` — the
 * `getServiceIcon` helper strips those before lookup so both `mapguard`
 * and `mapguard-setup` resolve to the MapGuard icon.
 */
import {
  Sparkles, Phone, Shield, ShieldCheck, TrendingUp, Star, Share2,
  Layers, Zap, Rocket, Hammer, Calendar, HelpCircle,
  type LucideIcon,
} from "lucide-react";

/** Product-id → icon. Keys match the leading dash-segment of a service id. */
export const SERVICE_ICONS: Record<string, LucideIcon> = {
  quotequick: Sparkles,
  tradeline: Phone,
  mapguard: Shield,
  webcare: ShieldCheck,
  rankflow: TrendingUp,
  reputationshield: Star,
  socialsync: Share2,
  contentflow: Layers,
  adflow: Zap,
  sitelaunch: Rocket,
  webfix: Hammer,
  bookflow: Calendar,
};

/** Resolve a service id (with or without `-setup` / `-ongoing` suffix) to its icon. */
export function getServiceIcon(serviceId: string): LucideIcon {
  const base = serviceId.replace(/-setup$|-ongoing$/, "");
  return SERVICE_ICONS[base] ?? HelpCircle;
}
