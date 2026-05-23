import { usePageTitle } from "@/hooks/usePageTitle";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PortalLayout from "@/components/portal/PortalLayout";
import BackButton from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { Plus, Trash2, Star, TrendingUp, TrendingDown, Lock, Loader2, Info } from "lucide-react";
import { Link } from "wouter";

interface CompetitorRow {
  id: number;
  client_id: number;
  place_id: string;
  display_name: string;
  enabled: boolean;
  latest_snapshot: {
    snapshot_date: string;
    total_reviews: number;
    average_rating: string | null;
    reviews_30d: number | null;
  } | null;
}

interface CompetitorsResponse {
  tier: string | null;
  hasAccess: boolean;
  upgradeRequired?: string;
  competitors: CompetitorRow[];
  ownStats: { total_reviews: number; average_rating: number } | null;
}

interface TrendSnapshot {
  snapshot_date: string;
  total_reviews: number;
  average_rating: string | null;
  reviews_30d: number | null;
}

interface TrendSeries {
  competitor: CompetitorRow;
  snapshots: TrendSnapshot[];
}

interface TrendResponse {
  tier: string | null;
  hasAccess: boolean;
  days: number;
  series: TrendSeries[];
}

function ratingDelta(theirs: number | null, ours: number): string | null {
  if (theirs == null) return null;
  const d = ours - theirs;
  if (Math.abs(d) < 0.05) return "level";
  return d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1);
}

export default function PortalCompetitors() {
  usePageTitle("Competitor tracking");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPlaceId, setNewPlaceId] = useState("");

  const { data, isLoading } = useQuery<CompetitorsResponse>({
    queryKey: ["/api/portal/reputation/competitors"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/competitors", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load competitors");
      return res.json();
    },
  });

  // Trend is loaded lazily — competitors page might be visited in casual
  // mode without trend deep-dive, so we let the chart-section trigger it.
  const { data: trend } = useQuery<TrendResponse>({
    queryKey: ["/api/portal/reputation/competitors/trend", { days: 90 }],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/competitors/trend?days=90", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load trend");
      return res.json();
    },
    enabled: data?.hasAccess === true && (data?.competitors.length ?? 0) > 0,
  });

  const addMutation = useMutation({
    mutationFn: async (input: { place_id: string; display_name: string }) => {
      const res = await apiRequest("POST", "/api/portal/reputation/competitors", input);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed");
      return body;
    },
    onSuccess: () => {
      toast({ title: "Competitor added", description: "Snapshots start tomorrow at 04:30 UTC." });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/reputation/competitors"] });
      setNewName("");
      setNewPlaceId("");
      setShowAddForm(false);
    },
    onError: (err: any) => {
      toast({
        title: "Could not add competitor",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/portal/reputation/competitors/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/reputation/competitors"] });
    },
  });

  /* Phase 1c: register the add-competitor form with the copilot. Only
   * enabled while the add form is open so the AI doesn't propose fills
   * when the form isn't on screen. */
  useCopilotForm({
    formLabel: "Add competitor",
    fields: [
      { key: "display_name", label: "Competitor display name", required: true },
      { key: "place_id", label: "Google Place ID (e.g. ChIJ...)", required: true },
    ],
    values: { display_name: newName, place_id: newPlaceId },
    onApply: (fills) => {
      for (const f of fills) {
        if (f.field_key === "display_name") setNewName(f.value);
        else if (f.field_key === "place_id") setNewPlaceId(f.value);
      }
    },
    enabled: showAddForm,
  });

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </PortalLayout>
    );
  }

  // Tier gate — Basic / Pro see an upgrade prompt instead of the dashboard.
  if (!data?.hasAccess) {
    return (
      <PortalLayout>
        <div className="max-w-3xl py-6">
          <Card className="p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
              <Lock className="w-6 h-6 text-blue-600" />
            </div>
            <h1 className="text-2xl font-semibold mb-2">Competitor tracking is a Premium feature</h1>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              See how your reviews stack up against up to 5 competitors —
              trend charts, rating comparisons, weekly velocity. Upgrade
              to ReputationShield Premium to unlock.
            </p>
            <Link href="/portal/catalog">
              <Button>Upgrade to Premium</Button>
            </Link>
          </Card>
        </div>
      </PortalLayout>
    );
  }

  const competitors = data.competitors ?? [];
  const ownStats = data.ownStats ?? { total_reviews: 0, average_rating: 0 };

  return (
    <PortalLayout>
      <div className="space-y-6">
        <BackButton to="/portal/reviews" label="Back to Reviews" className="mb-3" />
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold mb-1">Competitor tracking</h1>
            <p className="text-sm text-gray-600">
              Daily snapshots of up to 5 competitors&apos; public Google review stats.
            </p>
          </div>
          {competitors.length < 5 && !showAddForm && (
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add competitor
            </Button>
          )}
        </div>

        {/* Add form (toggle) */}
        {showAddForm && (
          <Card className="p-5 mb-6">
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">Display name</label>
                <Input
                  placeholder="e.g. Acme Plumbing"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">Google Place ID</label>
                <Input
                  placeholder="ChIJ…"
                  value={newPlaceId}
                  onChange={(e) => setNewPlaceId(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1.5 flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>Find the Place ID at{" "}
                    <a
                      href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder"
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Google&apos;s Place ID finder
                    </a>.
                  </span>
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => { setShowAddForm(false); setNewName(""); setNewPlaceId(""); }}>
                Cancel
              </Button>
              <Button
                disabled={!newName.trim() || !newPlaceId.trim() || addMutation.isPending}
                onClick={() => addMutation.mutate({ place_id: newPlaceId.trim(), display_name: newName.trim() })}
              >
                {addMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Add competitor
              </Button>
            </div>
          </Card>
        )}

        {/* Your stats summary */}
        <Card className="p-5 mb-6">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Your business</div>
          <div className="flex items-baseline gap-6">
            <div>
              <div className="text-3xl font-semibold">{ownStats.average_rating?.toFixed(1) ?? "—"}</div>
              <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                Average rating
              </div>
            </div>
            <div>
              <div className="text-3xl font-semibold">{ownStats.total_reviews}</div>
              <div className="text-xs text-gray-500 mt-1">Total reviews</div>
            </div>
          </div>
        </Card>

        {/* Empty state */}
        {competitors.length === 0 && !showAddForm && (
          <Card className="p-10 text-center">
            <h2 className="text-lg font-medium mb-1">No competitors tracked yet</h2>
            <p className="text-sm text-gray-600 mb-4">
              Add up to 5 competitors to start benchmarking your reputation.
            </p>
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add your first competitor
            </Button>
          </Card>
        )}

        {/* Competitor cards */}
        {competitors.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {competitors.map((c) => {
              const snap = c.latest_snapshot;
              const theirRating = snap?.average_rating ? Number(snap.average_rating) : null;
              const delta = theirRating != null ? ratingDelta(theirRating, ownStats.average_rating) : null;
              return (
                <Card key={c.id} className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{c.display_name}</div>
                      <div className="text-xs text-gray-500 truncate">{c.place_id}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMutation.mutate(c.id)}
                      disabled={removeMutation.isPending}
                      aria-label="Remove competitor"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400" />
                    </Button>
                  </div>

                  {!snap && (
                    <div className="text-sm text-gray-500 py-2">
                      First snapshot lands tomorrow at 04:30 UTC.
                    </div>
                  )}

                  {snap && (
                    <div className="grid grid-cols-3 gap-3 mt-2">
                      <div>
                        <div className="text-2xl font-semibold">{theirRating?.toFixed(1) ?? "—"}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          Rating
                        </div>
                      </div>
                      <div>
                        <div className="text-2xl font-semibold">{snap.total_reviews ?? "—"}</div>
                        <div className="text-xs text-gray-500">Reviews</div>
                      </div>
                      <div>
                        <div className="text-2xl font-semibold flex items-center gap-1">
                          {delta === "level" ? (
                            <span className="text-gray-500 text-base">Even</span>
                          ) : delta?.startsWith("+") ? (
                            <>
                              <TrendingUp className="w-4 h-4 text-green-500" />
                              <span className="text-green-600">{delta}</span>
                            </>
                          ) : delta ? (
                            <>
                              <TrendingDown className="w-4 h-4 text-red-500" />
                              <span className="text-red-600">{delta}</span>
                            </>
                          ) : "—"}
                        </div>
                        <div className="text-xs text-gray-500">vs. you</div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Trend chart — minimal inline SVG, last 90 days */}
        {competitors.length > 0 && trend && trend.series.length > 0 && (
          <Card className="p-5 mb-6">
            <h2 className="text-base font-semibold mb-1">Review count — last 90 days</h2>
            <p className="text-xs text-gray-500 mb-4">
              Daily snapshot. Sparser lines = competitor added recently.
            </p>
            <TrendChart series={trend.series} />
          </Card>
        )}
      </div>
    </PortalLayout>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Minimal SVG trend chart — keeps this page dependency-free. If we
 * outgrow it we can promote to recharts/visx, but for 1–5 series at
 * 90 days it would be over-engineering.
 * ────────────────────────────────────────────────────────────────── */
const CHART_COLORS = ["#0d3cfc", "#0b34d6", "#6366f1", "#8b5cf6", "#ec4899"];

function TrendChart({ series }: { series: TrendSeries[] }) {
  const { width, height, padding } = { width: 800, height: 220, padding: 28 };

  // Aggregate into per-series point arrays + global max.
  const seriesPoints = useMemo(() => {
    return series.map((s) => ({
      label: s.competitor.display_name,
      points: s.snapshots.map((p) => ({
        date: p.snapshot_date,
        value: p.total_reviews,
      })),
    }));
  }, [series]);

  const maxValue = useMemo(
    () => Math.max(1, ...seriesPoints.flatMap((s) => s.points.map((p) => p.value))),
    [seriesPoints],
  );

  const allDates = useMemo(() => {
    const set = new Set<string>();
    seriesPoints.forEach((s) => s.points.forEach((p) => set.add(p.date)));
    return Array.from(set).sort();
  }, [seriesPoints]);

  if (allDates.length === 0) {
    return <div className="text-sm text-gray-500">No snapshots yet — chart fills in after the first nightly run.</div>;
  }

  const xScale = (date: string) => {
    const i = allDates.indexOf(date);
    return padding + (i / Math.max(1, allDates.length - 1)) * (width - 2 * padding);
  };
  const yScale = (v: number) => height - padding - (v / maxValue) * (height - 2 * padding);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Competitor review count trend">
        {/* Y grid */}
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={padding}
            x2={width - padding}
            y1={padding + t * (height - 2 * padding)}
            y2={padding + t * (height - 2 * padding)}
            stroke="#e5e7eb"
            strokeDasharray="2,4"
          />
        ))}
        {/* Series */}
        {seriesPoints.map((s, idx) => {
          if (s.points.length === 0) return null;
          const d = s.points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.date)} ${yScale(p.value)}`)
            .join(" ");
          return (
            <g key={s.label}>
              <path d={d} fill="none" stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={2} />
              {s.points.map((p) => (
                <circle
                  key={p.date}
                  cx={xScale(p.date)}
                  cy={yScale(p.value)}
                  r={2}
                  fill={CHART_COLORS[idx % CHART_COLORS.length]}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3 mt-3">
        {seriesPoints.map((s, idx) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block w-3 h-0.5 rounded"
              style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }}
            />
            <span className="text-gray-700">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
