import {
  Calculator,
  Calendar,
  MessageSquare,
  Phone,
  Map,
  Search,
  Globe,
  Shield,
  Share2,
  Wrench,
  Star,
  Zap,
  Bot,
  Megaphone,
  BarChart3,
  FileText,
  Users,
  Clock,
  Settings,
  Rocket,
  Layers,
  Layout,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  calculator: Calculator,
  calendar: Calendar,
  chat: MessageSquare,
  message: MessageSquare,
  phone: Phone,
  map: Map,
  search: Search,
  globe: Globe,
  shield: Shield,
  share: Share2,
  wrench: Wrench,
  star: Star,
  zap: Zap,
  bot: Bot,
  megaphone: Megaphone,
  chart: BarChart3,
  file: FileText,
  users: Users,
  clock: Clock,
  settings: Settings,
  rocket: Rocket,
  layers: Layers,
  layout: Layout,
  sparkles: Sparkles,
  workflow: Workflow,
};

interface IconBadgeProps {
  name: string;
  size?: number;
  className?: string;
}

export function IconBadge({ name, size = 20, className = "" }: IconBadgeProps) {
  const Icon = ICON_MAP[name] ?? Zap;

  return (
    <div
      className={`inline-flex items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950 p-2 ${className}`}
      data-testid={`icon-badge-${name}`}
    >
      <Icon size={size} className="text-blue-600 dark:text-blue-400" strokeWidth={1.8} />
    </div>
  );
}
