/**
 * AI Insights — portal page (Wave 7).
 *
 * Customer-facing view of Claude-generated prioritized actions, derived
 * from MapGuard / Citation Tracker signals. Bundled with MapGuard
 * subscription — gated server-side.
 *
 * Structure (per BrightLocal-style reference Alex shared):
 *   1. Hero — badge + headline + sub-paragraph + last-updated + refresh
 *   2. Summary card — 1-paragraph LLM overview
 *   3. Tabs — All / GBP / Rankings / Reviews / Citations / Competitors
 *   4. Action cards — priority badge, title, rationale, impact + effort pills,
 *      action button (links to actionUrl), dismiss (X)
 *   5. Methodology band — borrowed credibility (Q3): NO fake testimonials,
 *      just an honest "how this works" explainer.
 *
 * DESIGN-SYSTEM:
 *   - semantic tokens only (text-foreground, bg-card, border-border, …)
 *   - no raw hex / tailwind raw colours
 *   - selected tab = outline, not bright fill
 *   - help cue (info icon + text) top-left of the page
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import { apiRequest } from "@/lib/queryClient";
import {
  Sparkles,
  RefreshCw,
  X,
  Info,
  TrendingUp,
  Star,
  MapPin,
  Building2,
  Trophy,
  AlertCircle,
  ExternalLink,
  Lock,
} from "lucide-react";

/* ─── Types (mirror server schema) ─── */
type InsightAction = {
  priority: 1 | 2 | 3 | 4 | 5;
  category: "gbp" | "rankings" | "reviews" | "citations" | "competitors";
  title: string;
  rationale: string;
  actionLabel: string;
  actionUrl: string;
  estimatedImpact: "high" | "medium" | "low";
  estimatedEffort: "5 min" | "1 hour" | "1 day" | "ongoing";
};

type AiInsightsResponse = {
  summary: string;
  actions: InsightAction[];
  generatedAt: string;
  cacheKey: string;
  model: string;
  cached: boolean;
  refreshed?: boolean;
};

type ErrorResponse = {
  error: string;
  message?: string;
  upgradeUrl?: string;
  retry_after_seconds?: number;
};

/* ─── Category metadata ─── */
const CATEGORY_META: Record<InsightAction["category"], { label: string; icon: React.ElementType }> = {
  gbp: { label: "GBP", icon: MapPin },
  rankings: { label: "Rankings", icon: TrendingUp },
  reviews: { label: "Reviews", icon: Star },
  citations: { label: "Citations", icon: Building2 },
  competitors: { label: "Competitors", icon: Trophy },
};

const TAB_KEYS = ["all", "gbp", "rankings", "reviews", "citations", "competitors"] as const;
type TabKey = (typeof TAB_KEYS)[number];

/* ─── Priority pill — semantic-token gradient (no raw hex) ─── */
function PriorityBadge({ priority }: { priority: number }) {
  const tone =
    priority === 1 ? "bg-destructive/10 text-destructive border-destructive/30" :
    priority === 2 ? "bg-warning/10 text-warning-foreground border-warning/30" :
    priority === 3 ? "bg-muted text-foreground border-border" :
                     "bg-muted/60 text-muted-foreground border-border";
  return (
    <div className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${tone}`}>
      {priority}
    </div>
  );
}

function ImpactPill({ impact }: { impact: InsightAction["estimatedImpact"] }) {
  const tone =
    impact === "high" ? "bg-primary/10 text-primary border-primary/30" :
    impact === "medium" ? "bg-muted text-foreground border-border" :
                          "bg-muted/60 text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      Impact: {impact}
    </span>
  );
}

function EffortPill({ effort }: { effort: InsightAction["estimatedEffort"] }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Effort: {effort}
    </span>
  );
}

/* ─── Action card ─── */
function ActionCard({
  action,
  onDismiss,
}: {
  action: InsightAction;
  onDismiss: (title: string) => void;
}) {
  const meta = CATEGORY_META[action.category];
  const CategoryIcon = meta.icon;
  return (
    <Card className="relative p-4 border-border bg-card">
      <div className="flex items-start gap-3">
        <PriorityBadge priority={action.priority} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <CategoryIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              {meta.label}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-foreground leading-snug">{action.title}</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{action.rationale}</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <ImpactPill impact={action.estimatedImpact} />
            <EffortPill effort={action.estimatedEffort} />
          </div>
          <div className="mt-3">
            <Link href={action.actionUrl}>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                {action.actionLabel}
                <ExternalLink className="ml-1.5 h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(action.title)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 -mt-1 -mr-1"
          aria-label="Dismiss this action"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </Card>
  );
}

/* ─── Upgrade gate (free customers / non-MapGuard subscribers) ─── */
function UpgradeGate({ upgradeUrl }: { upgradeUrl: string }) {
  return (
    <Card className="p-8 border-border bg-card text-center">
      <div className="mx-auto mb-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">AI Insights is part of MapGuard</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
        Subscribe to MapGuard to unlock Claude-powered prioritized actions that turn your visibility data into a clear weekly to-do list.
      </p>
      <Link href={upgradeUrl}>
        <Button>See MapGuard plans</Button>
      </Link>
    </Card>
  );
}

/* ─── Page ─── */
export default function AiInsightsPage() {
  usePageTitle("AI Insights");
  // Wave 36 — Tesla Simplification. AI Insights is now an inline Action Stack
  // on the home dashboard + every product dashboard. The standalone page
  // redirects to /portal so deep links keep working without exposing the
  // legacy surface in the nav.
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/portal", { replace: true });
  }, [navigate]);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("all");

  const insightsQ = useQuery<AiInsightsResponse | ErrorResponse>({
    queryKey: ["/api/portal/ai-insights"],
    queryFn: async () => {
      const res = await fetch("/api/portal/ai-insights", { credentials: "include" });
      const body = await res.json();
      if (!res.ok) {
        // Surface structured error so the gate component can render.
        return body as ErrorResponse;
      }
      return body as AiInsightsResponse;
    },
    staleTime: 30 * 60 * 1000, // 30 min — server enforces 24h TTL anyway
    retry: false,
  });

  const refreshM = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/portal/ai-insights/refresh");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? body?.error ?? "Failed to refresh");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/portal/ai-insights"] });
      toast({ title: "Insights refreshed", description: "Your AI recommendations have been regenerated." });
    },
    onError: (err: Error) => {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    },
  });

  const dismissM = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", "/api/portal/ai-insights/dismiss-action", { title });
      if (!res.ok) throw new Error("Failed to dismiss");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/portal/ai-insights"] });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't dismiss", description: err.message, variant: "destructive" });
    },
  });

  /* ─── Render: loading ─── */
  if (insightsQ.isLoading) {
    return (
      <PortalLayout>
        <div className="max-w-4xl mx-auto py-8 space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </PortalLayout>
    );
  }

  const data = insightsQ.data;
  const errorBody = data && "error" in data ? data : null;

  /* ─── Render: upgrade gate ─── */
  if (errorBody?.error === "ai_insights_requires_mapguard") {
    return (
      <PortalLayout>
        <div className="max-w-3xl mx-auto py-8">
          <UpgradeGate upgradeUrl={errorBody.upgradeUrl ?? "/products/mapguard"} />
        </div>
      </PortalLayout>
    );
  }

  /* ─── Render: generic error ─── */
  if (errorBody) {
    return (
      <PortalLayout>
        <div className="max-w-3xl mx-auto py-8">
          <Card className="p-6 border-border bg-card">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-semibold text-foreground mb-1">Couldn't load AI Insights</h2>
                <p className="text-sm text-muted-foreground">{errorBody.message ?? "Please try again in a few minutes."}</p>
              </div>
            </div>
          </Card>
        </div>
      </PortalLayout>
    );
  }

  const result = data as AiInsightsResponse;
  const actions = result.actions ?? [];
  const filtered = tab === "all" ? actions : actions.filter(a => a.category === tab);
  const generated = result.generatedAt ? new Date(result.generatedAt) : null;

  return (
    <PortalLayout>
      <div className="max-w-4xl mx-auto py-6 space-y-6">

        {/* Help cue — top-left of page (DESIGN-SYSTEM rule) */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          <span>Claude reads your latest MapGuard scan and gives you 3-5 ranked next steps.</span>
        </div>

        {/* Hero */}
        <Card className="p-6 border-border bg-card">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                <Sparkles className="h-3 w-3" />
                AI Insights
              </span>
              <h1 className="mt-3 text-2xl font-semibold text-foreground">Turning your data into direction</h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
                Your latest MapGuard scan, citation health, and rank trend — turned into a prioritized to-do list. Cached for 24 hours; refresh anytime.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-right shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => refreshM.mutate()}
                disabled={refreshM.isPending}
                className="h-8"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshM.isPending ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {generated && (
                <span className="text-[11px] text-muted-foreground">
                  Updated {generated.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* Summary card */}
        {result.summary && (
          <Card className="p-5 border-border bg-card">
            <p className="text-sm text-foreground leading-relaxed">{result.summary}</p>
          </Card>
        )}

        {/* Tabs — outline-selected (DESIGN-SYSTEM: selected = outline, not bright fill) */}
        <div className="flex flex-wrap gap-1.5">
          {TAB_KEYS.map(k => {
            const isActive = tab === k;
            const label = k === "all" ? "All" : CATEGORY_META[k as Exclude<TabKey, "all">].label;
            const count = k === "all"
              ? actions.length
              : actions.filter(a => a.category === k).length;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-primary text-primary bg-card"
                    : "border-border text-muted-foreground bg-card hover:text-foreground"
                }`}
              >
                {label}
                <span className="text-[10px] text-muted-foreground">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Action list */}
        {filtered.length === 0 ? (
          <Card className="p-8 border-border bg-card text-center">
            <p className="text-sm text-muted-foreground">
              No actions in this category right now — your {tab === "all" ? "overall" : CATEGORY_META[tab as Exclude<TabKey, "all">].label} health is solid.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered
              .slice()
              .sort((a, b) => a.priority - b.priority)
              .map((a, idx) => (
                <ActionCard
                  key={`${a.category}-${a.title}-${idx}`}
                  action={a}
                  onDismiss={(title) => dismissM.mutate(title)}
                />
              ))}
          </div>
        )}

        {/* Methodology band — borrowed credibility (Q3: NO fake testimonials) */}
        <Card className="p-5 border-border bg-card mt-8">
          <h3 className="text-sm font-semibold text-foreground mb-3">How AI Insights generates these recommendations</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-2 h-3 w-3 rounded-full bg-foreground/40 shrink-0" />
              <span>Pulls from your actual GBP, citations, rank, and review data — never invented numbers.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-2 h-3 w-3 rounded-full bg-foreground/40 shrink-0" />
              <span>Claude Sonnet 4.6 reads the signals and writes the prioritized actions in plain English.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-2 h-3 w-3 rounded-full bg-foreground/40 shrink-0" />
              <span>Cached for 24 hours to keep API costs predictable. Refresh anytime, max once per hour.</span>
            </li>
          </ul>
        </Card>

      </div>
    </PortalLayout>
  );
}
