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

            {/* Activity / Value Section */}
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">What We're Doing</h2>
              <div className="space-y-3">
                <ActivityItem
                  icon={Eye}
                  color="bg-[#2D6A4F]"
                  title="Active Monitoring"
                  description="We are continuously tracking your Google Business Profile, local rankings, and competitor activity."
                />
                <ActivityItem
                  icon={Shield}
                  color="bg-blue-500"
                  title="Profile Protection"
                  description="Your listing is being monitored for unwanted changes, missing information, and accuracy issues."
                />
                {data.current && (data.current.keywords_in_local_pack ?? 0) > 0 && (
                  <ActivityItem
                    icon={MapPin}
                    color="bg-purple-500"
                    title="Local Pack Presence"
                    description={`Your business currently appears in the Google Maps pack for ${data.current.keywords_in_local_pack} tracked search term${data.current.keywords_in_local_pack !== 1 ? "s" : ""}.`}
                  />
                )}
                {data.deltas?.reviews != null && data.deltas.reviews > 0 && (
                  <ActivityItem
                    icon={MessageSquare}
                    color="bg-amber-500"
                    title="Reviews Growing"
                    description={`You gained ${data.deltas.reviews} new review${data.deltas.reviews !== 1 ? "s" : ""} since the last check. Keep it up!`}
                  />
                )}
                {data.deltas?.score != null && data.deltas.score > 0 && (
                  <ActivityItem
                    icon={TrendingUp}
                    color="bg-emerald-500"
                    title="Visibility Improving"
                    description={`Your visibility score improved by ${data.deltas.score} points. Your Google presence is getting stronger.`}
                  />
                )}
              </div>
            </Card>

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
