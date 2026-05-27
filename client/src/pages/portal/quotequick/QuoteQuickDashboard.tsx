/**
 * /portal/quotequick/dashboard — Wave 29 QuoteQuick UI upgrade.
 *
 * Customer-facing dashboard built on Wave 22A primitives + Wave 26.7
 * polish-mix:
 *
 *   Hero KPI row (4 tiles, mixed primitives):
 *     - Quotes Sent       (AnimatedCounter + Sparkline)
 *     - Deposit-Paid Rate (KpiGauge)
 *     - Revenue This Mo.  (AnimatedCounter, dollar formatted)
 *     - Active Embed Sites (ProgressRing)
 *
 *   Per-template ConversionGauge cards below.
 *
 *   Quick-action row: 1-click whitelisted AI actions (nudge customer,
 *   extend deadline, add discount, request feedback, acknowledge).
 *
 * Backend:
 *   GET /api/portal/quotequick/dashboard-kpis
 *   GET /api/portal/quotequick/templates/:id/conversion
 *   POST /api/portal/quotequick/run-action
 *
 * Polling: 60s for KPIs. No WebSockets.
 */

import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  Brush,
  ExternalLink,
  Settings as SettingsIcon,
  Sparkles,
  Zap,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AnimatedCounter,
  KpiGauge,
  ProgressRing,
  Sparkline,
} from "@/components/ui/visual-primitives";
import { ConversionGauge } from "@/components/quotequick/ConversionGauge";
import { getMetricMeta } from "@shared/copilot/metricRegistry";
import { AdvancedOnly } from "@/components/ui/AdvancedOnly";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

const META = {
  quotesSent: getMetricMeta("quotequick", "quotesSent")!,
  avgDepositPaidRate: getMetricMeta("quotequick", "avgDepositPaidRate")!,
  revenueThisMonth: getMetricMeta("quotequick", "revenueThisMonth")!,
  activeEmbeds: getMetricMeta("quotequick", "activeEmbeds")!,
};

/* ─── API shapes ─────────────────────────────────────────────────────── */

interface DashboardKpisResponse {
  previewMode?: boolean;
  kpis: {
    quotesSent: { thisMonth: number; lastMonth: number; deltaPct: number };
    avgDepositPaidRate: number;
    revenueThisMonth: number;
    activeEmbeds: { active: number; configured: number };
  };
  velocityTrend12w: number[];
}

interface TemplateSummary {
  id: number;
  name: string;
}

interface ConversionResponse {
  templateId: number;
  range: string;
  stages: {
    views: number;
    starts: number;
    completes: number;
    depositPaid: number;
  };
  conversionRate: number;
  industryBenchmark: number;
  performanceVsBenchmark: "below" | "at" | "above";
}

/* ─── Quick actions ──────────────────────────────────────────────────── */

const QUICK_ACTIONS = [
  {
    id: "nudge-customer",
    label: "Nudge stalled customer",
    description: "Send a friendly follow-up to a customer who started but didn't complete.",
    icon: Sparkles,
  },
  {
    id: "extend-quote-expiration",
    label: "Extend quote deadline",
    description: "Bump the active quote's deadline by 7 days.",
    icon: Zap,
  },
  {
    id: "add-discount-offer",
    label: "Add 10% discount line",
    description: "Append a same-day discount line to a stale quote.",
    icon: Sparkles,
  },
  {
    id: "request-feedback",
    label: "Ask for feedback",
    description: "Send a 'why didn't you book?' survey to a recent non-buyer.",
    icon: Sparkles,
  },
] as const;

type QuickActionId = (typeof QUICK_ACTIONS)[number]["id"];

/* ─── Dashboard ─────────────────────────────────────────────────────── */

export default function QuoteQuickDashboard() {
  usePageTitle("QuoteQuick dashboard");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: kpis, isLoading: kpisLoading } = useQuery<DashboardKpisResponse>({
    queryKey: ["/api/portal/quotequick/dashboard-kpis"],
    queryFn: async () => {
      const res = await fetch("/api/portal/quotequick/dashboard-kpis", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load KPIs");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  // Templates list — pulled from the legacy summary endpoint so we don't
  // need a new templates list route in this wave. Fallback empty array if
  // the summary's calculator is null (no QuoteQuick configured).
  const { data: summary } = useQuery<{
    calculator: { id: number; business_name: string } | null;
  }>({
    queryKey: ["/api/portal/quotequick/summary"],
    queryFn: async () => {
      const res = await fetch("/api/portal/quotequick/summary", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load summary");
      return res.json();
    },
  });

  const templates: TemplateSummary[] = useMemo(() => {
    if (!summary?.calculator) return [];
    return [{ id: summary.calculator.id, name: summary.calculator.business_name }];
  }, [summary]);

  const runAction = useMutation({
    mutationFn: async (action: QuickActionId) => {
      return apiRequest("POST", "/api/portal/quotequick/run-action", {
        actionId: `dashboard-${action}-${Date.now()}`,
        action,
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Action queued",
        description: data?.message ?? "Done.",
      });
      if (data?.redirectUrl) setLocation(data.redirectUrl);
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/quotequick/dashboard-kpis"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Action failed",
        description: err?.message ?? "Try again.",
        variant: "destructive",
      });
    },
  });

  const k = kpis?.kpis;
  const trend = kpis?.velocityTrend12w ?? [];

  return (
    <PortalLayout>
      <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col">
            <h1 className="text-xl font-semibold text-foreground md:text-2xl">
              QuoteQuick dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Live conversion funnel + 1-click actions for every embedded widget.
            </p>
          </div>
          {/* Wave 36 — Brand settings + Notifications collapsed into overflow menu
              (audit: 3 buttons = too many). Form builder stays as primary. */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              asChild
              data-testid="link-form-builder"
            >
              <Link href="/portal/quotequick/builder">
                <SettingsIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Form builder
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="More QuoteQuick actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/portal/quotequick/brand" data-testid="link-brand-settings">
                    <Brush className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                    Brand settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/portal/quotequick/notifications" data-testid="link-notification-settings">
                    <Bell className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                    Notifications
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/portal/settings?tab=display">Show advanced</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Hero KPI row */}
        <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="flex h-full flex-col gap-2 p-4" data-testid="kpi-quotes-sent">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {META.quotesSent.label}
            </p>
            <div className="flex items-baseline gap-2">
              <AnimatedCounter
                value={k?.quotesSent.thisMonth ?? 0}
                className="text-2xl font-semibold text-foreground"
              />
              <span
                className={
                  (k?.quotesSent.deltaPct ?? 0) >= 0
                    ? "text-xs font-medium text-[hsl(var(--chart-2))]"
                    : "text-xs font-medium text-[hsl(var(--destructive))]"
                }
                data-testid="kpi-quotes-delta"
              >
                {(k?.quotesSent.deltaPct ?? 0) >= 0 ? "+" : ""}
                {k?.quotesSent.deltaPct ?? 0}%
              </span>
            </div>
            <Sparkline values={trend} className="h-8 w-full" />
            <p className="text-[11px] text-muted-foreground">
              Last 30 days vs prior 30
            </p>
          </Card>

          <Card className="flex h-full flex-col items-center justify-center gap-2 p-4" data-testid="kpi-deposit-rate">
            <KpiGauge
              value={k?.avgDepositPaidRate ?? 0}
              max={20}
              label={META.avgDepositPaidRate.label}
              unit="%"
              size="md"
              color="auto"
              helpText={META.avgDepositPaidRate.helpText}
              improvementTips={META.avgDepositPaidRate.improvementTips}
              emptyState={kpisLoading || (k?.avgDepositPaidRate ?? 0) === 0}
            />
          </Card>

          <Card className="flex h-full flex-col gap-2 p-4" data-testid="kpi-revenue">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {META.revenueThisMonth.label}
            </p>
            <AnimatedCounter
              value={(k?.revenueThisMonth ?? 0) / 100}
              className="text-2xl font-semibold text-foreground"
              prefix="$"
              decimals={0}
            />
            <p className="text-[11px] text-muted-foreground">
              Stripe Connect deposits this month
            </p>
          </Card>

          {/* Active embeds — install-status; 1-time check belongs on Form Builder. */}
          <AdvancedOnly product="quotequick" elementId="quotequick.active-embeds-ring">
            <Card className="flex h-full flex-col items-center justify-center gap-2 p-4" data-testid="kpi-active-embeds">
              <ProgressRing
                value={k?.activeEmbeds.active ?? 0}
                max={Math.max(1, k?.activeEmbeds.configured ?? 1)}
                label={`${k?.activeEmbeds.active ?? 0} of ${k?.activeEmbeds.configured ?? 0}`}
                size="md"
                color="sapphire"
              />
              <p className="text-[11px] text-muted-foreground">
                Active embed sites
              </p>
            </Card>
          </AdvancedOnly>
        </div>

        {/* 1-click action row */}
        <Card className="flex flex-col gap-2 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Quick actions
            </h2>
            <span className="text-[11px] text-muted-foreground">
              1-click whitelisted recommendations
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <Button
                  key={a.id}
                  variant="outline"
                  size="sm"
                  className="flex h-auto flex-col items-start gap-1 px-3 py-2 text-left"
                  disabled={runAction.isPending}
                  onClick={() => runAction.mutate(a.id)}
                  data-testid={`quick-action-${a.id}`}
                >
                  <span className="flex items-center gap-1 text-xs font-semibold">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {a.label}
                  </span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {a.description}
                  </span>
                </Button>
              );
            })}
          </div>
        </Card>

        {/* Conversion gauges per template */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Conversion by template
          </h2>
          {templates.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 p-6 text-center">
              <p className="text-sm font-medium text-foreground">
                No QuoteQuick widget configured yet
              </p>
              <p className="text-xs text-muted-foreground">
                Set one up in under 5 minutes to start tracking conversions.
              </p>
              <Button asChild size="sm" data-testid="empty-state-setup">
                <Link href="/portal/quotequick/setup">
                  Get started
                  <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </Card>
          ) : (
            // Wave 36 — single-template case is the common one; per-template
            // ConversionGauge grid moves to Advanced when multiple templates exist.
            templates.length === 1 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <ConversionGaugeFetcher key={templates[0].id} template={templates[0]} />
              </div>
            ) : (
              <AdvancedOnly product="quotequick" elementId="quotequick.conversion-gauge-grid">
                <div className="grid gap-3 lg:grid-cols-2">
                  {templates.map((t) => (
                    <ConversionGaugeFetcher key={t.id} template={t} />
                  ))}
                </div>
              </AdvancedOnly>
            )
          )}
        </div>

        {/* Wave 36 — embed-install link card deleted (audit: duplicate of Form Builder).
            Installation belongs on the Form Builder page itself. */}
      </div>
    </PortalLayout>
  );
}

/* ─── Per-template fetcher ─────────────────────────────────────────── */

function ConversionGaugeFetcher({ template }: { template: TemplateSummary }) {
  const { data, isLoading } = useQuery<ConversionResponse>({
    queryKey: [
      `/api/portal/quotequick/templates/${template.id}/conversion`,
      "30d",
    ],
    queryFn: async () => {
      const res = await fetch(
        `/api/portal/quotequick/templates/${template.id}/conversion?range=30d`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load conversion");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <Card className="flex h-64 animate-pulse items-center justify-center p-4">
        <p className="text-xs text-muted-foreground">Loading conversion data…</p>
      </Card>
    );
  }

  return (
    <ConversionGauge
      templateName={template.name}
      stages={data.stages}
      conversionRate={data.conversionRate}
      industryBenchmark={data.industryBenchmark}
      performanceVsBenchmark={data.performanceVsBenchmark}
    />
  );
}
