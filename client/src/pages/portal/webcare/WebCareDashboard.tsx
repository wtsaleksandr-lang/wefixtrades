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

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  BugOff,
  Gauge as GaugeIcon,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  KpiGauge,
  ProgressRing,
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

const META = {
  securityGrade: getMetricMeta("webcare", "securityGrade")!,
  uptimePct: getMetricMeta("webcare", "uptimePct")!,
  daysWithoutIncident: getMetricMeta("webcare", "daysWithoutIncident")!,
  performanceScore: getMetricMeta("webcare", "performanceScore")!,
  pendingUpdates: getMetricMeta("webcare", "pendingUpdates")!,
};

/* ─── API shapes ─────────────────────────────────────────────────────── */

interface DashboardKpisResponse {
  previewMode?: boolean;
  kpis: {
    securityGrade: { score: number; letter: string };
    uptimePct: number;
    daysWithoutIncident: number;
    performanceScore: { desktop: number; mobile: number; avg: number };
    pendingUpdates: number;
  };
  securityFactors: SecurityFactor[];
  backupTimeline30d: BackupEntry[];
  lastIncident: { kindLabel: string; daysAgo: number; durationMinutes: number } | null;
  bestStreakDays: number;
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

const QUICK_ACTIONS = [
  {
    id: "apply-all-pending-updates",
    label: "Apply all pending updates",
    description: "Run plugin / theme / core updates with a safety backup first.",
    icon: Wrench,
  },
  {
    id: "clean-malware",
    label: "Clean malware",
    description: "Request a fresh malware sweep + remediation.",
    icon: BugOff,
  },
  {
    id: "harden-security",
    label: "Harden security",
    description: "Turn on 2FA, login throttling, file-edit lockdown.",
    icon: ShieldCheck,
  },
  {
    id: "optimize-performance",
    label: "Optimize performance",
    description: "Run image + CSS minify pass for higher Lighthouse score.",
    icon: Sparkles,
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

  return (
    <PortalLayout>
      <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground md:text-2xl">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              WebCare dashboard
            </h1>
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
        <div className="grid gap-3 lg:grid-cols-4">
          <SecurityScoreCard
            score={k?.securityGrade.score ?? 0}
            letter={k?.securityGrade.letter ?? "F"}
            factors={kpis?.securityFactors ?? []}
            emptyState={isEmptyState}
          />
          <Card className="flex flex-col items-center justify-center gap-1 p-3" data-testid="webcare-uptime-gauge">
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
              emptyState={kpisLoading || (k?.uptimePct ?? 0) === 0}
            />
            <p className="text-[11px] text-muted-foreground">
              {kpis?.lastIncident
                ? `Last incident: ${kpis.lastIncident.daysAgo} day${kpis.lastIncident.daysAgo === 1 ? "" : "s"} ago — ${kpis.lastIncident.durationMinutes}-min outage`
                : "Last incident: never"}
            </p>
          </Card>
          <DaysWithoutIncident
            days={k?.daysWithoutIncident ?? 0}
            bestStreak={kpis?.bestStreakDays ?? 0}
            emptyState={isEmptyState}
          />
          {/* Performance gauge — power-user (Wave 36). */}
          <AdvancedOnly product="webcare" elementId="webcare.performance-ring">
            <Card className="flex flex-col items-center justify-center gap-1 p-3" data-testid="webcare-performance-ring">
              <ProgressRing
                value={k?.performanceScore.avg ?? 0}
                max={100}
                unit="/100"
                label={META.performanceScore.label}
                size="md"
                color="auto"
                helpText={META.performanceScore.helpText}
                improvementTips={META.performanceScore.improvementTips}
                emptyState={kpisLoading || (k?.performanceScore.avg ?? 0) === 0}
              />
              <p className="text-[11px] text-muted-foreground">
                Mobile {k?.performanceScore.mobile ?? 0} · Desktop {k?.performanceScore.desktop ?? 0}
              </p>
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
          <BackupTimeline
            entries={kpis?.backupTimeline30d ?? []}
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
              emptyState={kpisLoading || !hasService}
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
