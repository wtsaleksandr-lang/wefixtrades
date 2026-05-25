import { usePageTitle } from "@/hooks/usePageTitle";
/**
 * MapGuard Client Portal Dashboard
 *
 * Client-facing view of their Google Maps health, trends, and proof
 * of active monitoring. Shows only positive/neutral information —
 * no tasks, alerts, suppliers, or internal ops data.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import UpsellCard from "@/components/portal/UpsellCard";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCopilotForm } from "@/context/CopilotFormContext";
import {
  type MapguardConfig,
  DEFAULT_MAPGUARD_CONFIG,
} from "@shared/schema";
import {
  Shield, Star, MessageSquare, MapPin, TrendingUp, TrendingDown,
  Minus, Eye, CheckCircle, Activity, Clock, Plus, X, Save, Loader2, Settings,
  Calendar, AlertCircle, FileEdit, Send,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

/* ─── Types ─── */
interface MapguardData {
  active: boolean;
  health: string | null;
  last_scan: string | null;
  current: {
    score: number | null;
    grade: string | null;
    rating: number | null;
    review_count: number | null;
    photo_count: number | null;
    has_website: boolean;
    has_description: boolean;
    keywords_in_local_pack: number | null;
    keywords_in_top_10: number | null;
  } | null;
  deltas: {
    score: number | null;
    rating: number | null;
    reviews: number | null;
    local_pack: number | null;
  } | null;
  activities: string[];
  completed_last_30d: number;
  execution_progress: {
    completed: number;
    pending: number;
    has_more: boolean;
  } | null;
  activity_feed: Array<{
    message: string;
    type: "improvement" | "monitoring" | "growth" | "status";
    date: string;
  }>;
  since_start: {
    score_change: number;
    reviews_gained: number | null;
    days_active: number;
  } | null;
  snapshots: Array<{
    captured_at: string;
    score: number | null;
    grade: string | null;
    rating: number | null;
    review_count: number | null;
    keywords_in_local_pack: number | null;
    keywords_in_top_10: number | null;
  }>;
  /**
   * Present when the customer has a completed mapguard-setup but no
   * active monthly plan. Drives the "Continue with Basic/Pro" banner.
   */
  setup_completed_upsell?: {
    should_show: boolean;
    completed_at: string | null;
    days_since_completion: number | null;
  };
}

/* ─── Health Mapping (internal → client-friendly) ─── */
const HEALTH_DISPLAY: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  healthy:         { label: "Healthy",         color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle },
  improving:       { label: "Improving",       color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: TrendingUp },
  needs_attention:  { label: "Needs Attention", color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",   icon: Activity },
  watch_closely:   { label: "Watch Closely",   color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",   icon: Eye },
  monitoring:      { label: "Monitoring",      color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",     icon: Shield },
};

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-700 bg-emerald-50 border-emerald-200",
  B: "text-blue-700 bg-blue-50 border-blue-200",
  C: "text-amber-700 bg-amber-50 border-amber-200",
  D: "text-red-700 bg-red-50 border-red-200",
};

/* ─── Activity rotation icons/colors ─── */
const ACTIVITY_ICONS = [Shield, MapPin, Eye, Star, Activity];
const ACTIVITY_COLORS = ["bg-brand-blue", "bg-brand-blue-500", "bg-brand-blue-500", "bg-amber-500", "bg-blue-500"];

/* ─── Delta Display ─── */
function Delta({ value, suffix, invert }: { value: number | null; suffix?: string; invert?: boolean }) {
  if (value === null || value === 0) return null;
  const positive = invert ? value < 0 : value > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  // CONTRAST-2 — PortalMapguard is light-theme locked (portal UI).
  return (
    <span data-theme="light" className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? "text-emerald-600" : "text-red-500"}`}>
      <Icon className="w-3 h-3" />
      {value > 0 ? "+" : ""}{typeof value === "number" ? (Number.isInteger(value) ? value : value.toFixed(1)) : value}{suffix || ""}
    </span>
  );
}

/* ─── Metric Card ─── */
function MetricCard({ icon: Icon, label, value, delta, deltaSuffix, deltaInvert, accent }: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  deltaSuffix?: string;
  deltaInvert?: boolean;
  accent: string;
}) {
  return (
    <Card className="h-full p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
          {delta !== undefined && delta !== null && <div className="mt-1"><Delta value={delta} suffix={deltaSuffix} invert={deltaInvert} /></div>}
        </div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
    </Card>
  );
}

/* ─── Chart Tooltip ─── */
function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card shadow-lg border border-border rounded-lg px-3 py-2 text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }} className="font-medium">
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

/* ─── Setup-completion upsell banner ─── */
/**
 * Rendered when the customer finished a `mapguard-setup` project but
 * has no active monthly plan. Replaces the bland "MapGuard is not
 * active" empty state with a clear next-step CTA. Dismiss is sticky
 * server-side via metadata.upsell_dismissed.
 */
function SetupCompletionUpsellBanner({
  completedAt,
  daysSinceCompletion,
}: {
  completedAt: string | null;
  daysSinceCompletion: number | null;
}) {
  const queryClient = useQueryClient();
  const dismiss = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/portal/mapguard/upsell/dismiss", {});
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/mapguard"] });
    },
  });

  const sinceCopy =
    daysSinceCompletion == null ? "Your MapGuard setup is complete."
      : daysSinceCompletion === 0 ? "Your MapGuard setup is complete."
      : daysSinceCompletion === 1 ? "Your MapGuard setup wrapped up yesterday."
      : `Your MapGuard setup wrapped up ${daysSinceCompletion} days ago.`;

  return (
    <Card className="p-6 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
      <div className="flex items-start gap-4">
        <div className="w-8 h-8 rounded-xl bg-[#2D6A4F] flex items-center justify-center flex-shrink-0">
          <CheckCircle className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-foreground">{sinceCopy}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your Google Business profile, listings, and visibility groundwork
            are in place. Continue with monthly monitoring to catch problems
            before your customers do.
          </p>

          <ul className="mt-4 space-y-2 text-sm text-foreground">
            <li className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-[#2D6A4F] mt-0.5 flex-shrink-0" />
              <span><b>Basic</b> — weekly visibility scans + alerting on rating, reviews, and keyword drops.</span>
            </li>
            <li className="flex items-start gap-2">
              <TrendingUp className="w-4 h-4 text-[#2D6A4F] mt-0.5 flex-shrink-0" />
              <span><b>Pro</b> — Basic plus monthly competitor tracking and priority issue response.</span>
            </li>
          </ul>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/portal/services"
              className="inline-flex items-center justify-center px-5 py-2 bg-[#2D6A4F] text-white text-sm font-semibold rounded-lg hover:bg-[#1F5040] transition-colors"
              data-testid="upsell-see-plans"
            >
              See plans
            </Link>
            <button
              type="button"
              onClick={() => dismiss.mutate()}
              disabled={dismiss.isPending}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              data-testid="upsell-dismiss"
            >
              {dismiss.isPending ? "Dismissing…" : "Not now"}
            </button>
          </div>
          {completedAt && (
            <p className="mt-3 text-xs text-muted-foreground/70">
              Setup completed {new Date(completedAt).toLocaleDateString()}.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ─── Main Page ─── */
export default function PortalMapguard() {
  usePageTitle("MapGuard");
  const { data, isLoading, error } = useQuery<MapguardData>({
    queryKey: ["/api/portal/mapguard"],
    queryFn: async () => {
      const res = await fetch("/api/portal/mapguard", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-brand-blue flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">MapGuard</h1>
            <p className="text-sm text-muted-foreground">Your Google Maps visibility report</p>
          </div>
        </div>

        {isLoading && (
          <div className="space-y-4">
            <div className="grid auto-rows-fr grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(i => <Card key={i} className="h-full p-4"><Skeleton className="h-14 w-full" /></Card>)}
            </div>
            <Card className="p-4"><Skeleton className="h-48 w-full" /></Card>
          </div>
        )}

        {error && (
          <Card className="p-6 text-center">
            <p className="text-sm text-red-600">Failed to load MapGuard data. Please try again later.</p>
          </Card>
        )}

        {data && !data.active && data.setup_completed_upsell?.should_show && (
          <SetupCompletionUpsellBanner
            completedAt={data.setup_completed_upsell.completed_at}
            daysSinceCompletion={data.setup_completed_upsell.days_since_completion}
          />
        )}

        {data && !data.active && !data.setup_completed_upsell?.should_show && (
          <Card className="p-8 text-center">
            <Shield className="w-8 h-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">MapGuard is not active on your account</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Contact us to get started with Google Maps optimization.</p>
          </Card>
        )}

        {data && data.active && (
          <>
            {/* Customer-initiated Google Business connection. Shown only
                when the client isn't connected yet so the post + review
                automation has somewhere to publish. */}
            <GbpConnectBanner />

            {/* Fresh-subscriber empty state — when the service is
                active but no snapshots exist yet (typical first 24h).
                Replaces the visually-empty dashboard with an explicit
                "first scan in progress" reassurance. */}
            {!data.current && data.snapshots.length === 0 && <FirstScanRunningCard />}

            {/* Health Banner */}
            {data.health && (
              <HealthBanner health={data.health} lastScan={data.last_scan} />
            )}

            {/* Metric Cards */}
            {data.current && (
              <div className="grid auto-rows-fr grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  icon={Shield}
                  label="Visibility Score"
                  value={
                    <span className="flex items-center gap-2">
                      {data.current.score ?? "—"}
                      {data.current.grade && (
                        <span className={`text-sm px-1.5 py-0.5 rounded font-bold border ${GRADE_COLORS[data.current.grade] || "bg-muted text-muted-foreground border-border"}`}>
                          {data.current.grade}
                        </span>
                      )}
                    </span>
                  }
                  delta={data.deltas?.score}
                  deltaSuffix=" pts"
                  accent="bg-brand-blue"
                />
                <MetricCard
                  icon={Star}
                  label="Google Rating"
                  value={data.current.rating?.toFixed(1) ?? "—"}
                  delta={data.deltas?.rating}
                  accent="bg-amber-500"
                />
                <MetricCard
                  icon={MessageSquare}
                  label="Total Reviews"
                  value={data.current.review_count ?? "—"}
                  delta={data.deltas?.reviews}
                  accent="bg-blue-500"
                />
                <MetricCard
                  icon={MapPin}
                  label="In Map Pack"
                  value={data.current.keywords_in_local_pack != null ? `${data.current.keywords_in_local_pack} keywords` : "—"}
                  delta={data.deltas?.local_pack}
                  accent="bg-brand-blue-500"
                />
              </div>
            )}

            {/* Q16 upsell — pair MapGuard with RankFlow for compound visibility */}
            <UpsellCard
              recommendPrefix="rankflow"
              pitch="Pair MapGuard with RankFlow local SEO to rank for the keywords driving Map Pack appearances."
            />

            {/* Since You Started */}
            {data.since_start && data.since_start.score_change > 0 && (
              <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-800">
                  Your visibility has improved by {data.since_start.score_change} points since starting
                  {data.since_start.reviews_gained != null && data.since_start.reviews_gained > 0 && (
                    <span> &middot; {data.since_start.reviews_gained} new reviews gained</span>
                  )}
                </p>
              </div>
            )}

            {/* Score Trend Chart */}
            {data.snapshots.length >= 2 && (
              <Card className="p-5">
                <h2 className="text-sm font-semibold text-foreground mb-4">Visibility Score Over Time</h2>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.snapshots.map(s => ({
                      date: new Date(s.captured_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                      Score: s.score,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="Score" stroke="#0d3cfc" strokeWidth={2} dot={{ r: 3, fill: "#0d3cfc" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* Reviews Trend Chart */}
            {data.snapshots.length >= 2 && data.snapshots.some(s => s.review_count != null) && (
              <Card className="p-5">
                <h2 className="text-sm font-semibold text-foreground mb-4">Reviews Over Time</h2>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.snapshots.map(s => ({
                      date: new Date(s.captured_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                      Reviews: s.review_count,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="Reviews" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3, fill: "#3B82F6" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* Improvement Progress */}
            {data.execution_progress && data.execution_progress.completed > 0 && (
              <Card className="p-5">
                <h2 className="text-sm font-semibold text-foreground mb-2">Improvement Progress</h2>
                <p className="text-xs text-muted-foreground mb-3">
                  {data.execution_progress.completed} improvement{data.execution_progress.completed !== 1 ? "s" : ""} completed this month
                </p>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-blue rounded-full transition-all"
                    style={{ width: `${Math.min(100, data.execution_progress.completed * 20)}%` }}
                  />
                </div>
              </Card>
            )}

            {/* What We're Doing — dynamic from tasks + signals */}
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">What We're Doing For You</h2>
              <div className="space-y-3">
                {/* Dynamic activity items from active tasks */}
                {data.activities && data.activities.length > 0 ? (
                  data.activities.map((text, i) => (
                    <ActivityItem
                      key={i}
                      icon={ACTIVITY_ICONS[i % ACTIVITY_ICONS.length]}
                      color={ACTIVITY_COLORS[i % ACTIVITY_COLORS.length]}
                      title={text}
                      description=""
                    />
                  ))
                ) : (
                  <ActivityItem
                    icon={Eye}
                    color="bg-brand-blue"
                    title="We are continuously monitoring and improving your visibility"
                    description=""
                  />
                )}

                {/* Always show monitoring baseline */}
                <ActivityItem
                  icon={Shield}
                  color="bg-blue-500"
                  title="Profile Protection"
                  description="Your listing is monitored for unwanted changes, missing information, and accuracy issues."
                />

                {/* Dynamic positive signals */}
                {data.deltas?.reviews != null && data.deltas.reviews > 0 && (
                  <ActivityItem
                    icon={MessageSquare}
                    color="bg-amber-500"
                    title="Reviews Growing"
                    description={`You gained ${data.deltas.reviews} new review${data.deltas.reviews !== 1 ? "s" : ""} since the last check.`}
                  />
                )}
                {data.deltas?.score != null && data.deltas.score > 0 && (
                  <ActivityItem
                    icon={TrendingUp}
                    color="bg-emerald-500"
                    title="Visibility Improving"
                    description={`Your visibility score improved by ${data.deltas.score} points.`}
                  />
                )}
                {data.completed_last_30d > 0 && (
                  <ActivityItem
                    icon={CheckCircle}
                    color="bg-emerald-500"
                    title={`${data.completed_last_30d} improvement${data.completed_last_30d !== 1 ? "s" : ""} completed this month`}
                    description=""
                  />
                )}
              </div>
            </Card>

            {/* Backlog + Upgrade Signal */}
            {data.execution_progress && data.execution_progress.pending > 0 && (
              <Card className={`p-5 ${data.execution_progress.has_more ? "border-amber-200 bg-amber-50/30" : ""}`}>
                <h2 className="text-sm font-semibold text-foreground mb-1">
                  {data.execution_progress.pending} improvement{data.execution_progress.pending !== 1 ? "s" : ""} waiting
                </h2>
                <p className="text-xs text-muted-foreground mb-3">
                  {data.execution_progress.has_more
                    ? "We've identified additional improvements that can boost your visibility. Your current plan limits how many we complete each month."
                    : "These will be completed soon as part of your plan."}
                </p>
                {data.execution_progress.has_more && (
                  <div className="flex items-start gap-3 px-3 py-3 rounded-lg bg-card border border-amber-200">
                    <TrendingUp className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Unlock faster growth</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Upgrade your plan to allow us to fix more issues each month and improve your ranking faster.</p>
                      <UpgradePlanButton />
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Post calendar — backed by mapguard_posts. Always shown
                even when empty: the empty state explains that posts
                are scheduled monthly. */}
            <PostCalendarCard />

            {/* Recent Activity Feed */}
            {data.activity_feed && data.activity_feed.length > 0 && (
              <Card className="p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3">Recent Activity</h2>
                <div className="space-y-2.5">
                  {data.activity_feed.map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        item.type === "improvement" ? "bg-emerald-400" :
                        item.type === "growth" ? "bg-blue-400" :
                        item.type === "monitoring" ? "bg-brand-blue-400" :
                        "bg-gray-300"
                      }`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground">{item.message}</p>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                          {new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Profile Snapshot */}
            {data.current && (
              <Card className="p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3">Profile Snapshot</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <ProfileCheck label="Website linked" ok={data.current.has_website} />
                  <ProfileCheck label="Business description" ok={data.current.has_description} />
                  <ProfileCheck label="Photos uploaded" ok={(data.current.photo_count ?? 0) > 0} detail={data.current.photo_count != null ? `${data.current.photo_count} photos` : undefined} />
                  <ProfileCheck label="Google rating" ok={(data.current.rating ?? 0) >= 4.0} detail={data.current.rating ? `${data.current.rating.toFixed(1)} stars` : undefined} />
                  <ProfileCheck label="Reviews" ok={(data.current.review_count ?? 0) >= 10} detail={data.current.review_count != null ? `${data.current.review_count} total` : undefined} />
                  <ProfileCheck label="Ranking in top 10" ok={(data.current.keywords_in_top_10 ?? 0) > 0} detail={data.current.keywords_in_top_10 != null ? `${data.current.keywords_in_top_10} keywords` : undefined} />
                </div>
              </Card>
            )}

            {/* Customer-editable monitoring config */}
            <MapguardConfigCard />
          </>
        )}
      </div>
    </PortalLayout>
  );
}

/* ─── Sub-Components ─── */

function HealthBanner({ health, lastScan }: { health: string; lastScan: string | null }) {
  const display = HEALTH_DISPLAY[health] || HEALTH_DISPLAY.monitoring;
  const Icon = display.icon;
  return (
    <div className={`flex items-center justify-between rounded-xl border p-4 ${display.bg}`}>
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 ${display.color}`} />
        <div>
          <p className={`text-sm font-semibold ${display.color}`}>{display.label}</p>
          <p className="text-xs text-muted-foreground">Your Google Maps presence</p>
        </div>
      </div>
      {lastScan && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
          <Clock className="w-3 h-3" />
          Last checked {new Date(lastScan).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
      )}
    </div>
  );
}

function ActivityItem({ icon: Icon, color, title, description }: {
  icon: React.ElementType;
  color: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function ProfileCheck({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
      ) : (
        <div className="w-4 h-4 rounded-full border-2 border-input shrink-0" />
      )}
      <div>
        <span className={ok ? "text-foreground" : "text-muted-foreground/70"}>{label}</span>
        {detail && <span className="text-[11px] text-muted-foreground/70 ml-1">({detail})</span>}
      </div>
    </div>
  );
}

/* ─── MapGuard config editor ─────────────────────────────────────
   Lets the customer override the auto-generated keyword list, set
   a city for ranking searches, tune the rank-drop alert threshold,
   and toggle the weekly summary email. The card is dirty-tracked so
   the Save button only appears when something has changed. */

interface MapguardConfigResponse {
  config: MapguardConfig;
  defaults: MapguardConfig;
  resolved_city: string | null;
  trade_type: string | null;
}

function MapguardConfigCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<MapguardConfigResponse>({
    queryKey: ["/api/portal/mapguard/config"],
  });

  const [draft, setDraft] = useState<MapguardConfig | null>(null);
  const [keywordInput, setKeywordInput] = useState("");

  useEffect(() => {
    if (data?.config && !draft) setDraft(data.config);
  }, [data, draft]);

  const saveMutation = useMutation({
    mutationFn: async (next: MapguardConfig) => {
      const res = await apiRequest("PUT", "/api/portal/mapguard/config", next);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "MapGuard settings saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/mapguard/config"] });
    },
    onError: () => {
      toast({ title: "Couldn't save", description: "Try again in a moment.", variant: "destructive" });
    },
  });

  /* Phase 1c: register the MapGuard monitoring settings with the copilot.
   * custom_keywords is a comma-separated string on the wire; the threshold
   * is clamped to 0-10 and weekly_summary is coerced from "true"/"false".
   * Enabled only once the config draft has loaded. */
  useCopilotForm({
    formLabel: "MapGuard settings",
    fields: [
      { key: "city", label: "City / region for ranking searches" },
      { key: "custom_keywords", label: "Tracked keywords (comma-separated, up to 50; blank = auto)" },
      { key: "rank_drop_threshold", label: "Rank-drop alert threshold (0-10; 0 disables)" },
      { key: "weekly_summary", label: "Weekly summary email (true | false)" },
    ],
    values: {
      city: draft?.city ?? "",
      custom_keywords: (draft?.custom_keywords ?? []).join(", "),
      rank_drop_threshold: draft?.alerts.rank_drop_threshold ?? 0,
      weekly_summary: draft?.alerts.weekly_summary ?? false,
    },
    onApply: (fills) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next: MapguardConfig = {
          ...prev,
          alerts: { ...prev.alerts },
        };
        for (const f of fills) {
          switch (f.field_key) {
            case "city":
              next.city = f.value.trim() || null;
              break;
            case "custom_keywords": {
              const list = f.value
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean)
                .slice(0, 50);
              next.custom_keywords = list.length === 0 ? null : Array.from(new Set(list));
              break;
            }
            case "rank_drop_threshold": {
              const n = Number(f.value);
              if (Number.isFinite(n)) {
                next.alerts.rank_drop_threshold = Math.min(10, Math.max(0, Math.round(n)));
              }
              break;
            }
            case "weekly_summary":
              if (f.value === "true" || f.value === "false") {
                next.alerts.weekly_summary = f.value === "true";
              }
              break;
          }
        }
        return next;
      });
    },
    enabled: !!draft && !!data,
  });

  if (isLoading || !draft || !data) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="h-3 w-full mb-2" />
        <Skeleton className="h-8 w-full" />
      </Card>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(data.config);
  const usingCustomKeywords = !!draft.custom_keywords && draft.custom_keywords.length > 0;

  const addKeyword = () => {
    const v = keywordInput.trim();
    if (!v) return;
    const list = draft.custom_keywords ?? [];
    if (list.includes(v) || list.length >= 50) return;
    setDraft({ ...draft, custom_keywords: [...list, v] });
    setKeywordInput("");
  };
  const removeKeyword = (kw: string) => {
    const list = (draft.custom_keywords ?? []).filter((k) => k !== kw);
    setDraft({ ...draft, custom_keywords: list.length === 0 ? null : list });
  };

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Settings className="w-4 h-4 text-foreground" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Monitoring settings</h2>
          <p className="text-xs text-muted-foreground">Customize what we monitor and how we alert you.</p>
        </div>
      </div>

      {/* City override */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">City / region</label>
        <Input
          type="text"
          value={draft.city ?? ""}
          onChange={(e) => setDraft({ ...draft, city: e.target.value || null })}
          placeholder={data.resolved_city ?? "auto-detected from your business profile"}
          className="h-9 text-sm"
        />
        <p className="text-[11px] text-muted-foreground/70">
          Used when searching for keyword rankings. Leave blank to let MapGuard auto-detect.
        </p>
      </div>

      {/* Keywords */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <label className="text-xs font-medium text-foreground">Tracked keywords</label>
          {!usingCustomKeywords && (
            <span className="text-[11px] text-muted-foreground/70">
              Auto-generated from {data.trade_type ?? "your trade"}
            </span>
          )}
        </div>
        {usingCustomKeywords && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(draft.custom_keywords ?? []).map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-xs font-medium text-foreground"
              >
                {kw}
                <button
                  type="button"
                  onClick={() => removeKeyword(kw)}
                  aria-label={`Remove ${kw}`}
                  className="text-muted-foreground/70 hover:text-foreground"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addKeyword();
              }
            }}
            placeholder={`e.g. emergency ${data.trade_type ?? "plumber"} ${data.resolved_city ?? "near me"}`}
            className="h-9 text-sm flex-1"
          />
          <Button type="button" size="sm" variant="outline" onClick={addKeyword} className="h-9 px-3">
            <Plus size={14} className="mr-1" /> Add
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground/70">
          Up to 50 keywords. Adding even one switches off the auto-generated list.
        </p>
      </div>

      {/* Alerts */}
      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alerts</p>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            Alert when ranking drops by at least
            <span className="ml-2 font-semibold text-foreground">
              {draft.alerts.rank_drop_threshold === 0
                ? "disabled"
                : `${draft.alerts.rank_drop_threshold} position${draft.alerts.rank_drop_threshold === 1 ? "" : "s"}`}
            </span>
          </label>
          <input
            type="range"
            min={0}
            max={10}
            value={draft.alerts.rank_drop_threshold}
            onChange={(e) =>
              setDraft({
                ...draft,
                alerts: { ...draft.alerts, rank_drop_threshold: parseInt(e.target.value) },
              })
            }
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground/70">
            <span>Off</span>
            <span>Sensitive</span>
            <span>10+ positions</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div>
            <p className="text-sm font-medium text-foreground">Weekly summary email</p>
            <p className="text-[11px] text-muted-foreground/70">Friday recap of last week's rankings, reviews, and snapshot changes.</p>
          </div>
          <Switch
            checked={draft.alerts.weekly_summary}
            onCheckedChange={(v) =>
              setDraft({ ...draft, alerts: { ...draft.alerts, weekly_summary: v } })
            }
          />
        </div>
      </div>

      {/* Save bar */}
      {dirty && (
        <div className="flex items-center gap-3 pt-1 border-t border-border">
          <Button
            onClick={() => saveMutation.mutate(draft)}
            disabled={saveMutation.isPending}
            size="sm"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 mr-1.5" /> Save settings
              </>
            )}
          </Button>
          <button
            type="button"
            onClick={() => setDraft(data.config)}
            disabled={saveMutation.isPending}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Discard changes
          </button>
        </div>
      )}
      {!dirty && draft.custom_keywords === null && draft.alerts.rank_drop_threshold === DEFAULT_MAPGUARD_CONFIG.alerts.rank_drop_threshold && (
        <p className="text-[11px] text-muted-foreground/70 pt-1 border-t border-border">
          You're using the default MapGuard configuration.
        </p>
      )}
    </Card>
  );
}

/* ─── Google Business connect banner ──────────────────────────────
   Shown only when the customer has not yet connected their GBP. The
   automated post + review-response features need write-API access. On
   click, we fetch a one-shot OAuth URL from the portal API and route
   the browser to Google's consent screen. */
interface GbpStatusResponse {
  connected: boolean;
  configured: boolean;
  location_name: string | null;
}

function GbpConnectBanner() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<GbpStatusResponse>({
    queryKey: ["/api/portal/mapguard/gbp/status"],
  });
  const [redirecting, setRedirecting] = useState(false);
  // Explicit consent that we'll act as Manager on the customer's GBP.
  // Required separate from Google's own OAuth consent — Google's screen
  // is permission-scoped; this is the WeFixTrades agreement to act on
  // their behalf, mirroring the audit's "legal hygiene" recommendation.
  const [consented, setConsented] = useState(false);

  if (isLoading || !data) return null;
  if (data.connected) return null;
  if (!data.configured) return null; // ops hasn't set env vars yet — hide quietly

  const startConnect = async () => {
    if (!consented) return;
    try {
      setRedirecting(true);
      const res = await fetch("/api/portal/mapguard/gbp/connect-url", { credentials: "include" });
      if (!res.ok) throw new Error("connect-url fetch failed");
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setRedirecting(false);
      toast({
        title: "Couldn't start Google connection",
        description: "Try again in a moment.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="p-5 border-blue-200 bg-blue-50/50">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#008BBE] flex items-center justify-center shrink-0">
          <MapPin className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Connect your Google Business Profile</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            We'll be able to post updates, respond to reviews, and protect your listing automatically.
            Takes about 30 seconds and you can revoke access any time from your Google account.
          </p>

          <label className="flex items-start gap-2 mt-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5 w-3.5 h-3.5 rounded border-input text-[#008BBE] focus:ring-[#008BBE]"
            />
            <span className="text-[11px] text-muted-foreground leading-snug">
              I authorise WeFixTrades to act as a Manager on my Google Business Profile —
              posting updates, replying to reviews, and editing listing information on my
              behalf. I can revoke this access any time from my Google account. See our{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-[#008BBE] underline">terms</a>.
            </span>
          </label>

          <Button
            onClick={startConnect}
            disabled={redirecting || !consented}
            size="sm"
            className="mt-3 bg-[#008BBE] hover:bg-[#006fa0]"
          >
            {redirecting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Connecting…
              </>
            ) : (
              "Connect Google Business"
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ─── Upgrade plan button ─────────────────────────────────────────
   Opens the Stripe Customer Portal in a new tab so the customer can
   change their MapGuard plan, update payment method, or cancel. Falls
   back to a support email only if Stripe isn't reachable. */
function UpgradePlanButton() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const openBillingPortal = async () => {
    try {
      setLoading(true);
      const res = await apiRequest("POST", "/api/portal/billing/portal-session", {});
      const data = await res.json();
      if (data?.url) {
        window.open(data.url, "_blank");
      } else {
        throw new Error("No URL returned");
      }
    } catch (err: any) {
      toast({
        title: "Couldn't open billing portal",
        description: "Email support@wefixtrades.com and we'll handle the upgrade for you.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className="mt-2 inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold text-white bg-brand-blue hover:bg-brand-blue-600 transition-colors disabled:opacity-60"
      onClick={openBillingPortal}
      disabled={loading}
    >
      {loading ? (
        <>
          <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
          Opening…
        </>
      ) : (
        "Upgrade Plan"
      )}
    </button>
  );
}

/* ─── Empty-state card for fresh subscribers ──────────────────────
   Shown when the customer is active but no scans have happened yet
   (typical for the first 24h post-signup). Replaces the previous
   nearly-empty dashboard with an explicit reassurance + timeline. */
function FirstScanRunningCard() {
  return (
    <Card className="p-8 text-center bg-emerald-50/40 border-emerald-200">
      <Shield className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
      <p className="text-sm font-semibold text-foreground">First scan is running</p>
      <p className="text-xs text-muted-foreground mt-2 max-w-md mx-auto">
        We're collecting your baseline visibility data right now. Your full dashboard
        — score, rating, reviews, keyword rankings — will be ready within 24 hours.
        We'll email you when the first report is available.
      </p>
      <p className="text-[11px] text-muted-foreground/70 mt-4">
        Want to speed this up? Connect your Google Business Profile below so we can
        start posting and responding on your behalf immediately.
      </p>
    </Card>
  );
}

/* ─── Post calendar ───────────────────────────────────────────────
   Shows the customer's mapguard_posts row history: published, drafted,
   scheduled, skipped, failed. Backed by /api/portal/mapguard/posts.
   Grouped by quota_period (YYYY-MM) so the customer can see "this is
   what we're posting this month". Empty state explains the cadence. */

interface MapguardPostRow {
  id: number;
  status: "scheduled" | "drafted" | "published" | "failed" | "skipped";
  theme: string | null;
  scheduled_for: string;
  published_at: string | null;
  content: string | null;
  gbp_post_id: string | null;
  quota_period: string;
}

interface PostsResponse {
  posts: MapguardPostRow[];
  by_period: Record<string, MapguardPostRow[]>;
}

const POST_STATUS_DISPLAY: Record<MapguardPostRow["status"], {
  label: string;
  icon: React.ElementType;
  badgeClass: string;
}> = {
  scheduled: { label: "Scheduled",  icon: Calendar,  badgeClass: "bg-blue-50 text-blue-700 border-blue-200" },
  drafted:   { label: "Drafted",    icon: FileEdit,  badgeClass: "bg-brand-blue-50 text-brand-blue-700 border-brand-blue-200" },
  published: { label: "Published",  icon: Send,      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  skipped:   { label: "Skipped",    icon: AlertCircle, badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  failed:    { label: "Retrying",   icon: AlertCircle, badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
};

const THEME_LABEL: Record<string, string> = {
  promotion: "Promo",
  tip: "Tip",
  service_highlight: "Service",
  seasonal: "Seasonal",
  review_response: "Trust signal",
  company_update: "Update",
};

function PostCalendarCard() {
  const { data, isLoading, error } = useQuery<PostsResponse>({
    queryKey: ["/api/portal/mapguard/posts"],
  });

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-40 mb-3" />
        <Skeleton className="h-20 w-full" />
      </Card>
    );
  }
  if (error) return null; // dashboard already shows the error banner

  const periods = data?.by_period ? Object.keys(data.by_period).sort().reverse() : [];

  // Empty state — customer is subscribed but no posts have been
  // scheduled yet (typical mid-month signup, before next 1st-of-month
  // fan-out fires).
  if (periods.length === 0) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Post calendar</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Your Google Business posts will appear here once they're scheduled.
          We schedule the next month's posts on the 1st of each month.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Post calendar</h2>
      </div>

      <div className="space-y-4">
        {periods.map((period) => (
          <PostPeriodSection key={period} period={period} posts={data!.by_period[period]} />
        ))}
      </div>
    </Card>
  );
}

function PostPeriodSection({ period, posts }: { period: string; posts: MapguardPostRow[] }) {
  // Format YYYY-MM → "May 2026"
  const [y, m] = period.split("-");
  const label = new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, 1))
    .toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const published = posts.filter((p) => p.status === "published").length;
  const total = posts.length;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">{label}</h3>
        <span className="text-[11px] text-muted-foreground/70">{published}/{total} posted</span>
      </div>
      <div className="space-y-2">
        {posts.map((p) => <PostRow key={p.id} post={p} />)}
      </div>
    </div>
  );
}

function PostRow({ post }: { post: MapguardPostRow }) {
  const display = POST_STATUS_DISPLAY[post.status];
  const Icon = display.icon;
  const dateStr = new Date(post.published_at || post.scheduled_for).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
  const themeLabel = post.theme ? (THEME_LABEL[post.theme] || post.theme) : null;
  const preview = post.content ? post.content.slice(0, 140) + (post.content.length > 140 ? "…" : "") : null;

  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-muted/50/60 border border-border">
      <div className="shrink-0 pt-0.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] font-medium ${display.badgeClass}`}>
            {display.label}
          </span>
          {themeLabel && (
            <span className="text-[10px] text-muted-foreground/70">{themeLabel}</span>
          )}
          <span className="text-[10px] text-muted-foreground/70 ml-auto">{dateStr}</span>
        </div>
        {preview ? (
          <p className="text-xs text-foreground leading-snug line-clamp-2">{preview}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground/70 italic">
            {post.status === "scheduled" ? "Content will be drafted closer to the publish date." : "—"}
          </p>
        )}
      </div>
    </div>
  );
}
