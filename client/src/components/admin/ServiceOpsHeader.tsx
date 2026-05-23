/**
 * ServiceOpsHeader — shared delivery status header for service tabs.
 *
 * Replicates the TradeLine admin delivery pattern:
 * - Progress bar showing task completion
 * - Next step guidance
 * - Waiting-on indicator
 * - Onboarding status
 * - Help cues for common blockers
 *
 * Used by SocialSync tab and future service-specific tabs to
 * provide consistent delivery context alongside custom UIs.
 */
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { CheckCircle, Clock, AlertTriangle, ArrowRight, User, Wrench, Factory, Bot } from "lucide-react";

interface ServiceTask {
  id: number;
  title: string;
  status: string;
  priority: string;
  waiting_on: string | null;
  handled_by: string | null;
  due_at: string | null;
  next_action: string | null;
}

interface OnboardingInfo {
  id: number;
  status: string;
  submitted_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-50 text-blue-700",
  in_progress: "bg-indigo-50 text-indigo-700",
  waiting: "bg-amber-50 text-amber-700",
  blocked: "bg-red-50 text-red-700",
  delivered: "bg-emerald-50 text-emerald-700",
};

const WAITING_ICONS: Record<string, React.ReactNode> = {
  client: <User className="w-3 h-3" />,
  supplier: <Factory className="w-3 h-3" />,
  internal: <Wrench className="w-3 h-3" />,
  automation: <Bot className="w-3 h-3" />,
};

interface ServiceOpsHeaderProps {
  clientId: number;
  serviceFilter?: string; // Filter tasks by service_name containing this string
  helpCues?: { condition: boolean; text: string }[];
}

export default function ServiceOpsHeader({ clientId, serviceFilter, helpCues }: ServiceOpsHeaderProps) {
  const { data: allTasks } = useQuery<ServiceTask[]>({
    queryKey: [`/api/admin/crm/clients/${clientId}/fulfillment`],
    enabled: !!clientId,
  });

  if (!allTasks || allTasks.length === 0) return null;

  // Filter tasks for this service if filter provided
  const tasks = serviceFilter
    ? allTasks.filter(t => (t as any).service_name?.toLowerCase().includes(serviceFilter.toLowerCase()))
    : allTasks;

  if (tasks.length === 0) return null;

  const total = tasks.length;
  const completed = tasks.filter(t => t.status === "delivered" || t.status === "cancelled").length;
  const blocked = tasks.filter(t => t.status === "blocked");
  const waiting = tasks.filter(t => t.status === "waiting");
  const inProgress = tasks.filter(t => t.status === "in_progress");
  const nextTask = tasks.find(t => !["delivered", "cancelled"].includes(t.status));
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = completed === total;

  return (
    <Card className="p-3 mb-3">
      {/* Progress bar */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-700">
          Service Delivery
        </span>
        <span className={`text-xs font-medium ${allDone ? "text-emerald-600" : "text-gray-500"}`}>
          {completed}/{total} complete
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all ${allDone ? "bg-emerald-500" : "bg-brand-blue"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Status summary */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {blocked.length > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">
            <AlertTriangle className="w-3 h-3" />
            {blocked.length} blocked
          </span>
        )}
        {waiting.length > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
            <Clock className="w-3 h-3" />
            {waiting.length} waiting
            {waiting[0]?.waiting_on && (
              <span className="inline-flex items-center gap-0.5 ml-0.5">
                {WAITING_ICONS[waiting[0].waiting_on]}
                <span className="capitalize">{waiting[0].waiting_on}</span>
              </span>
            )}
          </span>
        )}
        {inProgress.length > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
            {inProgress.length} in progress
          </span>
        )}
        {allDone && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
            <CheckCircle className="w-3 h-3" />
            All tasks complete
          </span>
        )}
      </div>

      {/* Next step guidance */}
      {nextTask && !allDone && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
          <ArrowRight className="w-3 h-3 text-brand-blue" />
          <span>
            <span className="font-medium text-gray-700">Next:</span> {nextTask.title}
            {nextTask.waiting_on && (
              <span className="ml-1 text-amber-600">(waiting on {nextTask.waiting_on})</span>
            )}
          </span>
        </div>
      )}

      {/* Help cues */}
      {helpCues && helpCues.filter(h => h.condition).length > 0 && (
        <div className="mt-2 space-y-1">
          {helpCues.filter(h => h.condition).map((cue, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-gray-400">
              <span className="text-blue-400 mt-0.5">💡</span>
              <span>{cue.text}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
