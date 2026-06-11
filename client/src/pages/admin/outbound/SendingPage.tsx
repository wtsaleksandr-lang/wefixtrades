/**
 * Sending — global send budget + domain pool health (Lane OC).
 *
 * Read-only operator view of:
 *  1. The global daily send budget — Lane OB's volume ramp (50/day at first
 *     real send, +25/day per full week, OUTBOUND_GLOBAL_DAILY_CAP as a hard
 *     ceiling), read via GET /api/admin/outbound/budget/status.
 *  2. The cold-outreach sending-domain pool — status (warming → active →
 *     paused/burned), warmup age, daily cap, and the two deliverability
 *     vitals (bounce + complaint rates) with health coloring, read via
 *     Lane OA's GET /api/admin/outbound/sending-domains (merged PR #1663).
 *
 * No fillable form on this page → listed in scripts/copilot-form-exempt.txt
 * (same compliance route as CampaignsPage/PipelinePage).
 */
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Gauge, HelpCircle, RefreshCw } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  normalizeSendingRows, warmupAgeDays, formatRate, rateSeverity, statusCounts,
  budgetUsedPercent,
  BOUNCE_WARN_PCT, BOUNCE_CRITICAL_PCT, COMPLAINT_WARN_PCT, COMPLAINT_CRITICAL_PCT,
  type BudgetStatus, type SendingDomainRow,
} from "./outboundUiHelpers";

/* ─── Status + severity styling (theme-aware tokens, no raw white/black) ─── */
const STATUS_BADGES: Record<string, string> = {
  warming: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-muted text-muted-foreground",
  burned: "bg-red-100 text-red-700",
};

const SEVERITY_TEXT: Record<string, string> = {
  ok: "text-foreground",
  warn: "text-amber-600 font-semibold",
  critical: "text-red-600 font-semibold",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium capitalize ${STATUS_BADGES[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

/** Column header with the canonical help-cue pattern for this surface. */
function HeaderCell({ label, help, align = "left" }: { label: string; help: string; align?: "left" | "center" }) {
  // Full class names (not interpolated) so Tailwind's JIT picks them up.
  const alignCls = align === "center" ? "text-center" : "text-left";
  return (
    <th className={`px-3 py-2.5 ${alignCls} text-xs font-medium text-muted-foreground`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-0.5 cursor-default">
            {label} <HelpCircle className="w-3 h-3 text-muted-foreground/70" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs">{help}</TooltipContent>
      </Tooltip>
    </th>
  );
}

/* ─── Global send budget strip (Lane OB ramp readout) ─── */

function BudgetStrip() {
  const { data: budget, isError } = useQuery<BudgetStatus>({
    queryKey: ["/api/admin/outbound/budget/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/outbound/budget/status", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load send budget (${res.status})`);
      return res.json();
    },
    refetchInterval: 60_000,
    retry: false,
  });

  if (isError) {
    return (
      <div className="bg-card rounded-lg border border-border p-3" data-testid="budget-strip-error">
        <p className="text-xs text-muted-foreground">Send budget unavailable — the budget endpoint returned an error.</p>
      </div>
    );
  }

  const usedPct = budgetUsedPercent(budget);
  const ramping = !!budget?.first_real_send_at;
  return (
    <div className="bg-card rounded-lg border border-border p-4" data-testid="budget-strip">
      <div className="flex items-center gap-1.5">
        {/* Help cue — top-left of the component per DESIGN-SYSTEM hard rule */}
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="w-3 h-3 text-muted-foreground/70 cursor-default shrink-0" />
          </TooltipTrigger>
          <TooltipContent className="max-w-[300px] text-xs">
            Cross-campaign daily send ceiling. Volume ramps like a new sender: 50/day at the first real send, +25/day per full week since. OUTBOUND_GLOBAL_DAILY_CAP, when set, is a hard ceiling on top. Real pushes stop for the day once the budget is spent; dry runs never count.
          </TooltipContent>
        </Tooltip>
        <Gauge className="w-3.5 h-3.5 text-brand-blue-600 shrink-0" />
        <p className="text-sm font-semibold text-foreground">Global send budget</p>
        {budget?.env_cap != null && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground cursor-default">
                hard cap {budget.env_cap}/day
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[240px] text-xs">
              OUTBOUND_GLOBAL_DAILY_CAP is set — the ramp never exceeds this ceiling.
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-xl font-bold text-foreground">{budget ? budget.effective_cap : "—"}</p>
          <p className="text-xs text-muted-foreground">Today's cap</p>
        </div>
        <div>
          <p className="text-xl font-bold text-foreground">{budget ? budget.sent_today : "—"}</p>
          <p className="text-xs text-muted-foreground">Sent today</p>
        </div>
        <div>
          <p className={`text-xl font-bold ${budget && budget.remaining === 0 ? "text-amber-600" : "text-green-600"}`}>
            {budget ? budget.remaining : "—"}
          </p>
          <p className="text-xs text-muted-foreground">Remaining</p>
        </div>
        <div>
          <p className="text-xl font-bold text-foreground">
            {ramping ? `Week ${(budget?.ramp_week ?? 0) + 1}` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {ramping
              ? `Ramping since ${new Date(budget!.first_real_send_at!).toLocaleDateString()}`
              : "Ramp starts at first real send"}
          </p>
        </div>
      </div>

      {/* Consumption bar */}
      <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
        <div
          className={`h-full rounded-full transition-all ${usedPct >= 100 ? "bg-amber-500" : "bg-brand-blue-600"}`}
          style={{ width: `${usedPct}%` }}
        />
      </div>
    </div>
  );
}

export default function SendingPage() {
  const { data: rows = [], isLoading, isError, refetch } = useQuery<SendingDomainRow[]>({
    queryKey: ["/api/admin/outbound/sending-domains"],
    queryFn: async () => {
      const res = await fetch("/api/admin/outbound/sending-domains", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load sending domains (${res.status})`);
      return normalizeSendingRows(await res.json());
    },
    refetchInterval: 60_000,
  });

  const counts = statusCounts(rows);

  return (
    <AdminLayout pageContext={{ page: "outbound-sending", section: "Outbound" }}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              {/* Help cue — top-left of the page header per DESIGN-SYSTEM hard rule */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3 h-3 text-muted-foreground/70 cursor-default shrink-0" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[300px] text-xs">
                  Health of the dedicated cold-email sending domains. Domains warm up gradually (warming), carry sends while healthy (active), and are paused or retired (burned) when bounce/complaint rates threaten deliverability.
                </TooltipContent>
              </Tooltip>
              <h2 className="text-lg font-semibold text-foreground">Sending Domains</h2>
            </div>
            <p className="text-sm text-muted-foreground">Daily send budget and domain pool health — warmup, caps, and deliverability vitals</p>
          </div>
        </div>

        {/* Global send budget (Lane OB ramp) */}
        <BudgetStrip />

        {/* Pool summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            { label: "Warming", value: counts.warming, color: "text-amber-600" },
            { label: "Active", value: counts.active, color: "text-green-600" },
            { label: "Paused", value: counts.paused, color: "text-muted-foreground" },
            { label: "Burned", value: counts.burned, color: "text-red-600" },
          ] as const).map((s) => (
            <div key={s.label} className="bg-card rounded-lg border border-border p-3">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Pool table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading sending domains...</div>
          ) : isError ? (
            <div className="p-8 text-center">
              <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground mb-1">Couldn't load sending domains</p>
              <p className="text-xs text-muted-foreground mb-3">The server returned an error. This is a backend failure, not an empty pool.</p>
              <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                Try again
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No sending domains in the pool yet. Domains are added via the outreach platform setup — cold email never sends from wefixtrades.com.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <HeaderCell label="Domain" help="Dedicated sending domain. Cold email never goes out from the primary wefixtrades.com domain." />
                    <HeaderCell label="Status" help="warming = building sender reputation; active = carrying sends; paused = temporarily held; burned = reputation damaged, retired from the pool." />
                    <HeaderCell label="Warmup age" help="Days since warmup started. Domains typically need 14–21 days of warmup before carrying full volume." align="center" />
                    <HeaderCell label="Daily cap" help="Maximum emails this domain may send per day. Caps ramp up with warmup age." align="center" />
                    <HeaderCell label="Bounce" help={`Hard-bounce rate. ≥${BOUNCE_WARN_PCT}% is a warning, ≥${BOUNCE_CRITICAL_PCT}% is critical — the domain should be paused.`} align="center" />
                    <HeaderCell label="Complaint" help={`Spam-complaint rate. ≥${COMPLAINT_WARN_PCT}% is a warning, ≥${COMPLAINT_CRITICAL_PCT}% is critical — providers throttle senders above this.`} align="center" />
                    <HeaderCell label="Pause reason" help="Why a paused/burned domain was taken out of rotation (manual hold, bounce spike, complaint spike, blacklist hit)." />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const age = warmupAgeDays(r.warmup_started_at);
                    const bounceSev = rateSeverity(r.bounce_rate, BOUNCE_WARN_PCT, BOUNCE_CRITICAL_PCT);
                    const complaintSev = rateSeverity(r.complaint_rate, COMPLAINT_WARN_PCT, COMPLAINT_CRITICAL_PCT);
                    return (
                      <tr key={String(r.id ?? r.domain)} className="hover:bg-muted/50" data-testid={`sending-row-${r.domain}`}>
                        <td className="px-3 py-2.5 font-medium text-foreground">{r.domain}</td>
                        <td className="px-3 py-2.5"><StatusBadge status={String(r.status)} /></td>
                        <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                          {age === null ? "—" : `${age}d`}
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                          {r.daily_cap ?? "—"}
                        </td>
                        <td className={`px-3 py-2.5 text-center text-xs ${SEVERITY_TEXT[bounceSev]}`}>
                          {formatRate(r.bounce_rate)}
                        </td>
                        <td className={`px-3 py-2.5 text-center text-xs ${SEVERITY_TEXT[complaintSev]}`}>
                          {formatRate(r.complaint_rate)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">
                          {r.paused_reason || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
