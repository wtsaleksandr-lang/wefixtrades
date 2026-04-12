/**
 * Reusable service operations components for admin delivery workflows.
 * Designed to work across any service (ReputationShield, TradeLine, etc).
 */

import { Card } from "@/components/ui/card";
import { CheckCircle2, Circle, AlertTriangle, Clock, ArrowRight, Info, HelpCircle, Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";

/* ─── Service Ops Card ─── */

export type OpsStatus = "done" | "active" | "waiting" | "blocked" | "optional" | "not_started";

const STATUS_CONFIG: Record<OpsStatus, { icon: typeof CheckCircle2; color: string; bgColor: string; label: string }> = {
  done: { icon: CheckCircle2, color: "text-emerald-600", bgColor: "bg-emerald-50", label: "Completed" },
  active: { icon: Loader2, color: "text-blue-600", bgColor: "bg-blue-50", label: "Active" },
  waiting: { icon: Clock, color: "text-amber-600", bgColor: "bg-amber-50", label: "Waiting" },
  blocked: { icon: AlertTriangle, color: "text-red-600", bgColor: "bg-red-50", label: "Needs Attention" },
  optional: { icon: Circle, color: "text-gray-400", bgColor: "bg-gray-50", label: "Optional" },
  not_started: { icon: Circle, color: "text-gray-400", bgColor: "bg-gray-50", label: "Not Started" },
};

interface ServiceOpsCardProps {
  title: string;
  status: OpsStatus;
  description?: string;
  nextStep?: string;
  waitingOn?: "client" | "internal" | null;
  action?: { label: string; onClick: () => void };
  children?: ReactNode;
}

export function ServiceOpsCard({
  title,
  status,
  description,
  nextStep,
  waitingOn,
  action,
  children,
}: ServiceOpsCardProps) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;

  return (
    <div className={`flex gap-3 p-3 rounded-lg border ${status === "blocked" ? "border-red-200 bg-red-50/30" : "border-gray-100 bg-white"}`}>
      <div className={`w-7 h-7 rounded-full ${cfg.bgColor} flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon className={`w-3.5 h-3.5 ${cfg.color} ${status === "active" ? "animate-spin" : ""}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900">{title}</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cfg.bgColor} ${cfg.color}`}>
            {cfg.label}
          </span>
          {waitingOn && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
              Waiting on {waitingOn}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
        )}
        {nextStep && status !== "done" && (
          <div className="flex items-start gap-1.5 mt-1.5">
            <ArrowRight className="w-3 h-3 text-blue-500 mt-0.5 shrink-0" />
            <span className="text-xs text-blue-600 font-medium">{nextStep}</span>
          </div>
        )}
        {action && status !== "done" && (
          <button
            onClick={action.onClick}
            className="mt-2 text-xs font-medium text-white bg-[#2D6A4F] hover:bg-[#1B4332] px-3 py-1.5 rounded-md transition-colors"
          >
            {action.label}
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

/* ─── Service Ops Section ─── */

interface ServiceOpsSectionProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  completedCount?: number;
  totalCount?: number;
}

export function ServiceOpsSection({ title, subtitle, children, completedCount, totalCount }: ServiceOpsSectionProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {completedCount !== undefined && totalCount !== undefined && totalCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">{completedCount}/{totalCount}</span>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </Card>
  );
}

/* ─── Help Cue / Tooltip ─── */

interface HelpCueProps {
  text: string;
  children?: ReactNode;
}

export function HelpCue({ text, children }: HelpCueProps) {
  const [show, setShow] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      {children}
      <button
        className="ml-1 text-gray-300 hover:text-gray-500 transition-colors"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={(e) => { e.stopPropagation(); setShow(!show); }}
      >
        <Info className="w-3 h-3" />
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-gray-900 text-white text-[11px] rounded-md shadow-lg max-w-[220px] whitespace-normal leading-relaxed pointer-events-none">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </span>
  );
}

/* ─── Inline Help Text ─── */

export function HelpText({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] text-gray-400 leading-relaxed flex items-start gap-1">
      <HelpCircle className="w-3 h-3 mt-0.5 shrink-0 text-gray-300" />
      {children}
    </p>
  );
}
