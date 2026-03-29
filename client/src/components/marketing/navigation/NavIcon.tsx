import type { NavIconKey } from "@/site/navigation";
import {
  Workflow,
  MessageSquare,
  PhoneCall,
  Layers,
  Calculator,
  MapPinned,
  ShieldCheck,
  Rocket,
  Share2,
  Layout,
  FileText,
  Sparkles,
  Wrench,
  Fan,
  Zap,
  Home,
  Search,
  Trees,
  Bug,
  Warehouse,
  KeyRound,
  Paintbrush,
  Hammer,
  Building2,
} from "lucide-react";

const ICON_MAP: Record<NavIconKey, typeof Workflow> = {
  workflow: Workflow,
  messageSquare: MessageSquare,
  phoneCall: PhoneCall,
  layers: Layers,
  calculator: Calculator,
  mapPinned: MapPinned,
  shieldCheck: ShieldCheck,
  rocket: Rocket,
  share2: Share2,
  layout: Layout,
  fileText: FileText,
  sparkles: Sparkles,
  wrench: Wrench,
  fan: Fan,
  zap: Zap,
  home: Home,
  search: Search,
  trees: Trees,
  bug: Bug,
  warehouse: Warehouse,
  keyRound: KeyRound,
  paintbrush: Paintbrush,
  hammer: Hammer,
  building2: Building2,
};

export function NavIcon({
  icon,
  size = 28,
  strokeWidth = 1.6,
}: {
  icon: NavIconKey;
  size?: number;
  strokeWidth?: number;
}) {
  const Icon = ICON_MAP[icon];
  return Icon ? <Icon size={size} strokeWidth={strokeWidth} /> : null;
}
