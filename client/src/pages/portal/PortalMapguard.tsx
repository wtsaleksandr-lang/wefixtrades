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
import PortalLayout from "@/components/portal/PortalLayout";
import UpsellCard from "@/components/portal/UpsellCard";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  type MapguardConfig,
  DEFAULT_MAPGUARD_CONFIG,
} from "@shared/schema";
import {
  Shield, Star, MessageSquare, MapPin, TrendingUp, TrendingDown,
  Minus, Eye, CheckCircle, Activity, Clock, Plus, X, Save, Loader2, Settings,
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
const ACTIVITY_COLORS = ["bg-[#2D6A4F]", "bg-purple-500", "bg-indigo-500", "bg-amber-500", "bg-blue-500"];

/* ─── Delta Display ─── */
function Delta({ value, suffix, invert }: { value: number | null; suffix?: string; invert?: boolean }) {
  if (value === null || value === 0) return null;
  const positive = invert ? value < 0 : value > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? "text-emerald-600" : "text-red-500"}`}>
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
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
          {delta !== undefined && delta !== null && <div className="mt-1"><Delta value={delta} suffix={deltaSuffix} invert={deltaInvert} /></div>}
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent}`}>
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
    <div className="bg-white shadow-lg border border-gray-200 rounded-lg px-3 py-2 text-xs">
      <p className="text-gray-500 mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }} className="font-medium">
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
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
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2D6A4F] flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">MapGuard</h1>
            <p className="text-sm text-gray-500">Your Google Maps visibility report</p>
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

        {data && !data.active && (
          <Card className="p-8 text-center">
            <Shield className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">MapGuard is not active on your account</p>
            <p className="text-xs text-gray-400 mt-1">Contact us to get started with Google Maps optimization.</p>
          </Card>
        )}

        {data && data.active && (
          <>
            {/* Customer-initiated Google Business connection. Shown only
                when the client isn't connected yet so the post + review
                automation has somewhere to publish. */}
            <GbpConnectBanner />

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
                        <span className={`text-sm px-1.5 py-0.5 rounded font-bold border ${GRADE_COLORS[data.current.grade] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                          {data.current.grade}
                        </span>
                      )}
                    </span>
                  }
                  delta={data.deltas?.score}
                  deltaSuffix=" pts"
                  accent="bg-[#2D6A4F]"
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
                  accent="bg-purple-500"
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
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Visibility Score Over Time</h2>
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
                      <Line type="monotone" dataKey="Score" stroke="#2D6A4F" strokeWidth={2} dot={{ r: 3, fill: "#2D6A4F" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {/* Reviews Trend Chart */}
            {data.snapshots.length >= 2 && data.snapshots.some(s => s.review_count != null) && (
              <Card className="p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Reviews Over Time</h2>
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
                <h2 className="text-sm font-semibold text-gray-900 mb-2">Improvement Progress</h2>
                <p className="text-xs text-gray-500 mb-3">
                  {data.execution_progress.completed} improvement{data.execution_progress.completed !== 1 ? "s" : ""} completed this month
                </p>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#2D6A4F] rounded-full transition-all"
                    style={{ width: `${Math.min(100, data.execution_progress.completed * 20)}%` }}
                  />
                </div>
              </Card>
            )}

            {/* What We're Doing — dynamic from tasks + signals */}
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">What We're Doing For You</h2>
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
                    color="bg-[#2D6A4F]"
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
                <h2 className="text-sm font-semibold text-gray-900 mb-1">
                  {data.execution_progress.pending} improvement{data.execution_progress.pending !== 1 ? "s" : ""} waiting
                </h2>
                <p className="text-xs text-gray-500 mb-3">
                  {data.execution_progress.has_more
                    ? "We've identified additional improvements that can boost your visibility. Your current plan limits how many we complete each month."
                    : "These will be completed soon as part of your plan."}
                </p>
                {data.execution_progress.has_more && (
                  <div className="flex items-start gap-3 px-3 py-3 rounded-lg bg-white border border-amber-200">
                    <TrendingUp className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Unlock faster growth</p>
                      <p className="text-xs text-gray-500 mt-0.5">Upgrade your plan to allow us to fix more issues each month and improve your ranking faster.</p>
                      <button
                        className="mt-2 inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#2D6A4F] hover:bg-[#1B4332] transition-colors"
                        onClick={() => window.open("mailto:support@wefixtrades.com?subject=MapGuard%20Upgrade", "_blank")}
                      >
                        Upgrade Plan
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Recent Activity Feed */}
            {data.activity_feed && data.activity_feed.length > 0 && (
              <Card className="p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h2>
                <div className="space-y-2.5">
                  {data.activity_feed.map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        item.type === "improvement" ? "bg-emerald-400" :
                        item.type === "growth" ? "bg-blue-400" :
                        item.type === "monitoring" ? "bg-indigo-400" :
                        "bg-gray-300"
                      }`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-700">{item.message}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
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
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Profile Snapshot</h2>
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
          <p className="text-xs text-gray-500">Your Google Maps presence</p>
        </div>
      </div>
      {lastScan && (
        <div className="flex items-center gap-1 text-xs text-gray-400">
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
      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
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
        <div className="w-4 h-4 rounded-full border-2 border-gray-300 shrink-0" />
      )}
      <div>
        <span className={ok ? "text-gray-700" : "text-gray-400"}>{label}</span>
        {detail && <span className="text-[11px] text-gray-400 ml-1">({detail})</span>}
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
        <Settings className="w-4 h-4 text-gray-700" />
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Monitoring settings</h2>
          <p className="text-xs text-gray-500">Customize what we monitor and how we alert you.</p>
        </div>
      </div>

      {/* City override */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-700">City / region</label>
        <Input
          type="text"
          value={draft.city ?? ""}
          onChange={(e) => setDraft({ ...draft, city: e.target.value || null })}
          placeholder={data.resolved_city ?? "auto-detected from your business profile"}
          className="h-9 text-sm"
        />
        <p className="text-[11px] text-gray-400">
          Used when searching for keyword rankings. Leave blank to let MapGuard auto-detect.
        </p>
      </div>

      {/* Keywords */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <label className="text-xs font-medium text-gray-700">Tracked keywords</label>
          {!usingCustomKeywords && (
            <span className="text-[11px] text-gray-400">
              Auto-generated from {data.trade_type ?? "your trade"}
            </span>
          )}
        </div>
        {usingCustomKeywords && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(draft.custom_keywords ?? []).map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-md text-xs font-medium text-gray-700"
              >
                {kw}
                <button
                  type="button"
                  onClick={() => removeKeyword(kw)}
                  aria-label={`Remove ${kw}`}
                  className="text-gray-400 hover:text-gray-700"
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
        <p className="text-[11px] text-gray-400">
          Up to 50 keywords. Adding even one switches off the auto-generated list.
        </p>
      </div>

      {/* Alerts */}
      <div className="border-t border-gray-100 pt-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Alerts</p>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-700">
            Alert when ranking drops by at least
            <span className="ml-2 font-semibold text-gray-900">
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
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>Off</span>
            <span>Sensitive</span>
            <span>10+ positions</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div>
            <p className="text-sm font-medium text-gray-800">Weekly summary email</p>
            <p className="text-[11px] text-gray-400">Friday recap of last week's rankings, reviews, and snapshot changes.</p>
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
        <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
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
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Discard changes
          </button>
        </div>
      )}
      {!dirty && draft.custom_keywords === null && draft.alerts.rank_drop_threshold === DEFAULT_MAPGUARD_CONFIG.alerts.rank_drop_threshold && (
        <p className="text-[11px] text-gray-400 pt-1 border-t border-gray-100">
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

  if (isLoading || !data) return null;
  if (data.connected) return null;
  if (!data.configured) return null; // ops hasn't set env vars yet — hide quietly

  const startConnect = async () => {
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
        <div className="w-9 h-9 rounded-lg bg-[#008BBE] flex items-center justify-center shrink-0">
          <MapPin className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Connect your Google Business Profile</p>
          <p className="text-xs text-gray-600 mt-0.5">
            We'll be able to post updates, respond to reviews, and protect your listing automatically.
            Takes about 30 seconds and you can revoke access any time from your Google account.
          </p>
          <Button
            onClick={startConnect}
            disabled={redirecting}
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
