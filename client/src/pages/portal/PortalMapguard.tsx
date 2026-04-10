/**
 * MapGuard Client Portal Dashboard
 *
 * Client-facing view of their Google Maps health, trends, and proof
 * of active monitoring. Shows only positive/neutral information —
 * no tasks, alerts, suppliers, or internal ops data.
 */

import { useQuery } from "@tanstack/react-query";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield, Star, MessageSquare, MapPin, TrendingUp, TrendingDown,
  Minus, Eye, CheckCircle, Activity, Clock,
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
    <Card className="p-4">
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(i => <Card key={i} className="p-4"><Skeleton className="h-14 w-full" /></Card>)}
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
            {/* Health Banner */}
            {data.health && (
              <HealthBanner health={data.health} lastScan={data.last_scan} />
            )}

            {/* Metric Cards */}
            {data.current && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                        onClick={() => window.open("mailto:hello@wefixtrades.co.uk?subject=MapGuard%20Upgrade", "_blank")}
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
