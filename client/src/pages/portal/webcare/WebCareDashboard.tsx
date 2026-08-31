/**
 * /portal/webcare/dashboard — Wave 31 WebCare UI upgrade.
 *
 * Reporting-visibility for the website maintenance subscription. Hides
 * raw wp-cli / lighthouse jargon by default; uses Security grade /
 * Uptime / Days without incident / Performance / Backups timeline.
 *
 * Hero strip (Wave 26.7 polish-mix):
 *   - LetterGradeBadge   (A-F security grade)
 *   - KpiGauge           (uptime % with 99.9 redline)
 *   - AnimatedCounter    (days without incident, gamified)
 *   - ProgressRing       (avg Lighthouse performance score)
 *
 * Plus:
 *   - MaintenanceLogInbox   (THE structural moat)
 *   - SecurityScoreCard     (with "Why this grade?" expander)
 *   - BackupTimeline        (30-day strip + 1-click Backup now)
 *   - SiteInventory         (plugins/themes table, sort by maintained)
 *   - Quick-action row      (1-click AI actions with approval)
 *
 * Backend (Wave 31):
 *   GET   /api/portal/webcare/dashboard-kpis
 *   GET   /api/portal/webcare/maintenance-log
 *   GET   /api/portal/webcare/site-inventory
 *   POST  /api/portal/webcare/run-action
 *
 * Polling: 60s for KPIs + maintenance-log; site-inventory refreshes
 * after run-action mutations only.
 */

import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  BugOff,
  Gauge as GaugeIcon,
  HardDrive,
  Settings as SettingsIcon,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  BarComparisonCard,
  KpiGauge,
  MonthlyBarSeries,
  ProgressRing,
  SemiGauge,
  type MonthlyBar,
} from "@/components/ui/visual-primitives";
import { getMetricMeta } from "@shared/copilot/metricRegistry";
import {
  MaintenanceLogInbox,
  type MaintenanceLogEntry,
  type WebcareEventType,
} from "@/components/webcare/MaintenanceLogInbox";
import {
  SecurityScoreCard,
  type SecurityFactor,
} from "@/components/webcare/SecurityScoreCard";
import {
  BackupTimeline,
  type BackupEntry,
} from "@/components/webcare/BackupTimeline";
import {
  SiteInventory,
  type InventoryEntry,
} from "@/components/webcare/SiteInventory";
import { DaysWithoutIncident } from "@/components/webcare/DaysWithoutIncident";
import { AdvancedOnly } from "@/components/ui/AdvancedOnly";
import { IllustrativeDataBadge } from "@/components/portal/IllustrativeDataBadge";

const META = {
  securityGrade: getMetricMeta("webcare", "securityGrade")!,
  uptimePct: getMetricMeta("webcare", "uptimePct")!,
  daysWithoutIncident: getMetricMeta("webcare", "daysWithoutIncident")!,
  performanceScore: getMetricMeta("webcare", "performanceScore")!,
  pendingUpdates: getMetricMeta("webcare", "pendingUpdates")!,
};

/* ─── API shapes ─────────────────────────────────────────────────────── */

/**
 * Mirrors the honesty contract in server/routes/portal/webcare/dashboardKpis.ts:
 * a KPI we do not measure arrives as `null` and must render "not measured",
 * never 0. Do not add `?? 0` defaults to these — that is exactly the bug that
 * showed every WebCare customer a 0/100 "F" security grade.
 */
interface DashboardKpisResponse {
  previewMode?: boolean;
  kpis: {
    securityGrade: { score: number; letter: string } | null;
    uptimePct: number | null;
    daysWithoutIncident: number | null;
    performanceScore: { desktop: number; mobile: number; avg: number } | null;
    pendingUpdates: number | null;
  };
  securityFactors: SecurityFactor[];
  backupTimeline30d: BackupEntry[];
  backupsTracked: boolean;
  incidentHistoryTracked: boolean;
  lastIncident: { kindLabel: string; daysAgo: number; durationMinutes: number } | null;
  bestStreakDays: number | null;
  hasWebcareService: boolean;
}

interface MaintenanceLogResponse {
  previewMode?: boolean;
  entries: MaintenanceLogEntry[];
  emptyState: "none" | "fresh" | "filtered";
  hasMore: boolean;
  nextBefore: string | null;
  hasWebcareService: boolean;
}

interface SiteInventoryResponse {
  previewMode?: boolean;
  entries: InventoryEntry[];
  hasWebcareService: boolean;
  lastSnapshotAt: string | null;
}

/* ─── Quick actions ──────────────────────────────────────────────────── */

/**
 * Only actions that genuinely perform the work they name.
 *
 * "Harden security" (2FA / login throttling / file-edit lockdown) and
 * "Optimize performance" (image + CSS minify for a Lighthouse score) were
 * removed: neither is possible over the WordPress REST API and no
 * Lighthouse measurement exists, so both buttons wrote a "done" line to the
 * maintenance log and changed nothing on the customer's site. "Clean
 * malware" became "Scan for malware" — we can genuinely detect, we could
 * not genuinely honour its "our team cleans it within 4 hours" promise.
 *
 * Three actions, all real. Kept even so at 2-per-row on mobile so no card
 * ever wraps alone.
 */
const QUICK_ACTIONS = [
  {
    id: "apply-all-pending-updates",
    label: "Apply all pending updates",
    description: "Applies safe plugin updates, after taking a backup first. Major versions are held for review.",
    icon: Wrench,
  },
  {
    id: "scan-malware",
    label: "Scan for malware",
    description: "Checks core files against WordPress's official checksums and scans your pages for injections.",
    icon: BugOff,
  },
  {
    id: "run-backup-now",
    label: "Back up now",
    description: "Captures a restorable content backup — posts, pages, categories, tags and menus.",
    icon: HardDrive,
  },
] as const;

type QuickActionId = (typeof QUICK_ACTIONS)[number]["id"];

/* ─── Dashboard ─────────────────────────────────────────────────────── */

export default function WebCareDashboard() {
  usePageTitle("WebCare dashboard");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<WebcareEventType | "all">("all");

  const { data: kpis, isLoading: kpisLoading } = useQuery<DashboardKpisResponse>({
    queryKey: ["/api/portal/webcare/dashboard-kpis"],
    queryFn: async () => {
      const res = await fetch("/api/portal/webcare/dashboard-kpis", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load KPIs");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const { data: logData, isFetching: logFetching } = useQuery<MaintenanceLogResponse>({
    queryKey: ["/api/portal/webcare/maintenance-log", filter],
    queryFn: async () => {
      const q = filter === "all" ? "" : `?eventType=${filter}`;
      const res = await fetch(`/api/portal/webcare/maintenance-log${q}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load maintenance log");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const { data: inventoryData } = useQuery<SiteInventoryResponse>({
    queryKey: ["/api/portal/webcare/site-inventory"],
    queryFn: async () => {
      const res = await fetch("/api/portal/webcare/site-inventory", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load site inventory");
      return res.json();
    },
  });

  /* ─── Wave 73a — real KPI stat endpoints ──────────────────────────── */
  type WcScoreResponse = {
    /** null when nothing has been measured — render the empty state, not 0. */
    value: number | null;
    verdict: string;
    advice: string;
    data_status: "real" | "illustrative" | "unavailable";
  };
  type WcMonthlyResponse = {
    data: MonthlyBar[];
    data_status: "real" | "illustrative";
  };
  const scoreStatsQuery = useQuery<WcScoreResponse>({
    queryKey: ["portal", "webcare", "stats", "score"],
    queryFn: () =>
      fetch("/api/portal/webcare/stats/score", { credentials: "include" }).then(
        (r) => r.json(),
      ),
  });
  const monthlyStatsQuery = useQuery<WcMonthlyResponse>({
    queryKey: ["portal", "webcare", "stats", "monthly"],
    queryFn: () =>
      fetch("/api/portal/webcare/stats/monthly?months=6", {
        credentials: "include",
      }).then((r) => r.json()),
  });

  const runAction = useMutation({
    mutationFn: async (input: {
      action: string;
      actionId?: string;
      params?: Record<string, string | number | boolean>;
    }) => {
      return apiRequest("POST", "/api/portal/webcare/run-action", {
        actionId: input.actionId ?? `dashboard-${input.action}-${Date.now()}`,
        action: input.action,
        params: input.params,
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Action queued",
        description: data?.message ?? "Done.",
      });
      if (data?.redirectUrl) setLocation(data.redirectUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/portal/webcare/dashboard-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/webcare/maintenance-log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/webcare/site-inventory"] });
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
  const hasService = kpis?.hasWebcareService ?? false;
  const isEmptyState = !hasService;

  const entries = logData?.entries ?? [];
  const inventory = inventoryData?.entries ?? [];

  /* ─── Wave 72 — derived series for new KPI primitives ───────────────── */

  // Site health composite — Wave 73a: backed by /stats/score.
  //
  // The server is the ONLY place this is computed. The old client-side
  // fallback re-blended uptime + performance + security locally, which
  // resurrected the same fabricated-score bug the server just fixed
  // (performance and security were always 0, so every account scored ~50 and
  // was told "Improvements available"). If the endpoint has no measurement,
  // we show the neutral empty state rather than inventing a number.
  const siteHealthScore = scoreStatsQuery.data?.value ?? null;
  const siteHealthHasData = hasService && siteHealthScore !== null;
  const siteHealthIllustrative = scoreStatsQuery.data?.data_status === "illustrative";

  const siteHealthVerdict = scoreStatsQuery.data?.verdict ?? "Not measured yet";
  const siteHealthAdvice =
    scoreStatsQuery.data?.advice ??
    "Your first uptime check and health sweep haven't run yet — this fills in automatically.";

  // Incidents per month — Wave 73a: backed by /stats/monthly.
  const incidentsMonthlyBarsFallback: MonthlyBar[] = useMemo(() => {
    const now = new Date();
    const labels: string[] = [];
    const buckets: number[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(d.toLocaleString(undefined, { month: "short" }));
      buckets.push(0);
    }
    // Count entries with incident-y types per month.
    for (const e of entries as Array<{ createdAt?: string; eventType?: string }>) {
      const ts = e.createdAt ? new Date(e.createdAt) : null;
      if (!ts) continue;
      const yearDiff = now.getFullYear() - ts.getFullYear();
      const monthDiff = yearDiff * 12 + (now.getMonth() - ts.getMonth());
      const bucketIdx = 5 - monthDiff;
      if (bucketIdx < 0 || bucketIdx > 5) continue;
      const type = e.eventType ?? "";
      if (
        type === "downtime" ||
        type === "malware" ||
        type === "security_alert" ||
        type === "incident"
      ) {
        buckets[bucketIdx] += 1;
      }
    }
    // If no data, fall back to a smooth low-activity mock.
    const hasData = buckets.some((b) => b > 0);
    return labels.map((label, idx) => {
      const isCurrent = idx === labels.length - 1;
      const value = hasData ? (buckets[idx] ?? 0) : Math.max(0, 3 - idx);
      return { label, value, highlighted: isCurrent };
    });
  }, [entries]);
  // Whether the local fallback would render its synthetic low-activity mock
  // (i.e. no real incident-typed entries exist to bucket).
  const incidentsFallbackIsSynthetic = useMemo(() => {
    return !(entries as Array<{ eventType?: string }>).some((e) => {
      const t = e.eventType ?? "";
      return (
        t === "downtime" ||
        t === "malware" ||
        t === "security_alert" ||
        t === "incident"
      );
    });
  }, [entries]);
  const incidentsMonthlyUsingFallback = !(
    monthlyStatsQuery.data?.data && monthlyStatsQuery.data.data.length > 0
  );
  const incidentsMonthlyBars: MonthlyBar[] = incidentsMonthlyUsingFallback
    ? incidentsMonthlyBarsFallback
    : monthlyStatsQuery.data!.data;
  // Wave K2: badge when the stat endpoint is empty AND the local fallback is
  // drawing its synthetic low-activity mock rather than real bucketed incidents.
  const incidentsMonthlyIllustrative =
    monthlyStatsQuery.data?.data_status === "illustrative" ||
    (incidentsMonthlyUsingFallback && incidentsFallbackIsSynthetic);

  // Uptime SLA actual vs target.
  const uptimeTarget = 99.9;
  const uptimeActual = k?.uptimePct ?? 0;

  return (
    <PortalLayout>
      <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground md:text-2xl">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              WebCare dashboard
            </h2>
            <p className="text-sm text-muted-foreground">
              Reporting-visibility for your website — security grade, uptime,
              backups, and every maintenance action in plain English.
            </p>
          </div>
          {/* Wave 36 — Notifications/Setup demoted to Advanced (Wave 32 centralized prefs). */}
          <AdvancedOnly product="webcare" elementId="webcare.header-actions">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild data-testid="link-webcare-notifications">
                <Link href="/portal/webcare/notifications">
                  <Bell className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Notifications
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild data-testid="link-webcare-setup">
                <Link href="/portal/webcare/setup">
                  <SettingsIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Setup wizard
                </Link>
              </Button>
            </div>
          </AdvancedOnly>
        </div>

        {/* Hero strip — mixed primitives */}
        <div className="grid auto-rows-fr gap-3 lg:grid-cols-4">
          <SecurityScoreCard
            score={k?.securityGrade?.score ?? null}
            factors={kpis?.securityFactors ?? []}
            emptyState={isEmptyState || !k?.securityGrade}
          />
          <Card className="flex h-full flex-col items-center justify-center gap-1 p-3" data-testid="webcare-uptime-gauge">
            <KpiGauge
              value={k?.uptimePct ?? 0}
              min={90}
              max={100}
              label={META.uptimePct.label}
              unit="%"
              targetThreshold={99.9}
              size="md"
              color="auto"
              helpText={META.uptimePct.helpText}
              improvementTips={META.uptimePct.improvementTips}
              emptyState={kpisLoading || k?.uptimePct == null}
            />
            <p className="text-[11px] text-muted-foreground">
              {kpis?.lastIncident
                ? `Last incident: ${kpis.lastIncident.daysAgo} day${kpis.lastIncident.daysAgo === 1 ? "" : "s"} ago — ${kpis.lastIncident.durationMinutes}-min outage`
                : kpis?.incidentHistoryTracked
                  ? "No incidents in the monitored period"
                  : "Last incident: not monitored yet"}
            </p>
          </Card>
          <DaysWithoutIncident
            days={k?.daysWithoutIncident ?? 0}
            bestStreak={kpis?.bestStreakDays ?? 0}
            emptyState={isEmptyState || k?.daysWithoutIncident == null}
          />
          {/* Performance gauge — power-user (Wave 36).
              We run no Lighthouse job, so `performanceScore` is always null.
              Render the honest empty state rather than a 0/100 score. */}
          <AdvancedOnly product="webcare" elementId="webcare.performance-ring">
            <Card className="flex h-full flex-col items-center justify-center gap-1 p-3" data-testid="webcare-performance-ring">
              <ProgressRing
                value={k?.performanceScore?.avg ?? 0}
                max={100}
                unit="/100"
                label={META.performanceScore.label}
                size="md"
                color="auto"
                helpText={META.performanceScore.helpText}
                improvementTips={META.performanceScore.improvementTips}
                emptyState={kpisLoading || k?.performanceScore == null}
              />
              <p className="text-[11px] text-muted-foreground">
                {k?.performanceScore
                  ? `Mobile ${k.performanceScore.mobile} · Desktop ${k.performanceScore.desktop}`
                  : "Page-speed scoring isn't part of your plan yet"}
              </p>
            </Card>
          </AdvancedOnly>
        </div>

        {/* Wave 72 — new KPI primitives row */}
        <div className="grid auto-rows-fr grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {/* Headline (Simple-mode visible) — site health SemiGauge */}
          <Card className="p-4 h-full flex flex-col items-center justify-center gap-2" data-testid="wc-site-health-semigauge">
            <div className="self-end">
              <IllustrativeDataBadge show={siteHealthIllustrative} />
            </div>
            <SemiGauge
              value={siteHealthScore ?? 0}
              max={100}
              label="Site health"
              verdict={siteHealthVerdict}
              advice={siteHealthAdvice}
              size={200}
              emptyState={!siteHealthHasData}
              emptyStateMessage="Awaiting first scan"
            />
          </Card>

          {/* Advanced — incidents per month */}
          <AdvancedOnly product="webcare" elementId="webcare.incidents-monthly-bars">
            <Card className="p-4 h-full" data-testid="wc-incidents-monthly">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Incidents per month
                </div>
                <IllustrativeDataBadge show={incidentsMonthlyIllustrative} />
              </div>
              <MonthlyBarSeries
                bars={incidentsMonthlyBars}
                fillWidth
                color="crimson"
                ariaLabel="WebCare incidents per month"
              />
            </Card>
          </AdvancedOnly>

          {/* Advanced — uptime SLA target vs actual */}
          <AdvancedOnly product="webcare" elementId="webcare.uptime-sla-bars">
            <Card className="p-4 h-full" data-testid="wc-uptime-sla">
              <BarComparisonCard
                title="Uptime SLA"
                items={[
                  { label: "Target", value: uptimeTarget, color: "sapphire", formatValue: (n) => `${n.toFixed(2)}%` },
                  { label: "Actual", value: uptimeActual, color: uptimeActual >= uptimeTarget ? "emerald" : "amber", formatValue: (n) => `${n.toFixed(2)}%` },
                ]}
              />
            </Card>
          </AdvancedOnly>
        </div>

        {/* Quick-action row */}
        <Card className="flex flex-col gap-2 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Quick AI actions
            </h2>
            <span className="text-[11px] text-muted-foreground">
              1-click recommendations — your approval required
            </span>
          </div>
          {/* 3 actions: 1-up on mobile, 3-up from md. Deliberately NOT
              sm:grid-cols-2 — that would wrap the third card alone on its
              own row, which the no-orphan rule forbids. */}
          <div className="grid gap-2 md:grid-cols-3">
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <Button
                  key={a.id}
                  variant="outline"
                  size="sm"
                  className="flex h-auto flex-col items-start gap-1 px-3 py-2 text-left"
                  disabled={runAction.isPending}
                  onClick={() =>
                    runAction.mutate({ action: a.id as QuickActionId })
                  }
                  data-testid={`webcare-quick-action-${a.id}`}
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

        {/* Maintenance log — THE structural moat */}
        <MaintenanceLogInbox
          entries={entries}
          emptyState={
            !hasService
              ? "none"
              : entries.length === 0
                ? (filter === "all" ? "fresh" : "filtered")
                : "fresh"
          }
          hasMore={logData?.hasMore ?? false}
          isLoading={logFetching}
          filter={filter}
          onFilterChange={setFilter}
        />

        {/* Backup timeline — power-user (Wave 36). */}
        <AdvancedOnly product="webcare" elementId="webcare.backup-timeline">
          {/* `tracked` false = no backup has been attempted yet for this
              site, so the strip reads "no backups yet" rather than
              "0 backups taken". Once the weekly worker or the 1-click
              action has run, every dot here is a real recorded run. */}
          <BackupTimeline
            entries={kpis?.backupTimeline30d ?? []}
            tracked={kpis?.backupsTracked ?? false}
            isMutating={runAction.isPending}
            onRunBackupNow={() => runAction.mutate({ action: "run-backup-now" })}
          />
        </AdvancedOnly>

        {/* Pending updates KPI + Site inventory — power-user. */}
        <AdvancedOnly product="webcare" elementId="webcare.pending-updates-section">
        <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
          <Card className="flex flex-col items-center justify-center gap-1 p-3" data-testid="webcare-pending-updates-gauge">
            <KpiGauge
              value={k?.pendingUpdates ?? 0}
              min={0}
              max={Math.max(20, (k?.pendingUpdates ?? 0) + 5)}
              label={META.pendingUpdates.label}
              unit=""
              size="md"
              color={(k?.pendingUpdates ?? 0) === 0 ? "green" : "amber"}
              helpText={META.pendingUpdates.helpText}
              improvementTips={META.pendingUpdates.improvementTips}
              // null = no maintenance sweep has run, so "0 updates pending"
              // would render a green all-clear we have not earned.
              emptyState={kpisLoading || !hasService || k?.pendingUpdates == null}
            />
            <Button
              size="sm"
              variant="outline"
              className="mt-1 h-7 px-2 text-xs"
              disabled={runAction.isPending || (k?.pendingUpdates ?? 0) === 0}
              onClick={() => runAction.mutate({ action: "apply-all-pending-updates" })}
              data-testid="webcare-apply-all-updates-cta"
            >
              <GaugeIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Apply all updates
            </Button>
          </Card>
          <SiteInventory
            entries={inventory}
            lastSnapshotAt={inventoryData?.lastSnapshotAt ?? null}
            isMutating={runAction.isPending}
            onApplyAllUpdates={() => runAction.mutate({ action: "apply-all-pending-updates" })}
          />
        </div>
        </AdvancedOnly>

        {/* Empty-state footer CTA */}
        {!hasService && (
          <Card className="flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-sm font-medium text-foreground">
              WebCare isn't set up yet
            </p>
            <p className="text-xs text-muted-foreground">
              Take the 3-question setup wizard — under 5 minutes — and your
              maintenance feed will start populating.
            </p>
            <Button asChild size="sm" data-testid="webcare-empty-setup-cta">
              <Link href="/portal/webcare/setup">
                Start setup
                <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </Card>
        )}
      </div>
    </PortalLayout>
  );
}
