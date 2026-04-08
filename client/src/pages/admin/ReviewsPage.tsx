import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { HelpCue } from "@/components/admin/ServiceOps";
import {
  Star, TrendingUp, AlertTriangle, MessageSquare, Eye, CheckCircle2, RefreshCw,
  Sparkles, Copy, Save, Loader2, FileText, ShieldAlert, Send,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MonitoredReview {
  id: number;
  client_id: number;
  google_place_id: string;
  platform: string;
  reviewer_name: string;
  rating: number;
  review_text: string | null;
  published_at: string | null;
  response_text: string | null;
  response_date: string | null;
  is_new: boolean;
  response_added: boolean;
  first_seen_at: string;
  last_synced_at: string;
  raw_payload: any;
  draft_response: string | null;
  draft_generated_at: string | null;
  draft_model: string | null;
  google_review_name: string | null;
  posted_via: string | null;
  posted_at: string | null;
}

interface ReviewStats {
  total: number;
  averageRating: number;
  newCount: number;
  withResponse: number;
  byRating: Record<number, number>;
}

type DraftTone = "auto" | "positive" | "negative" | "neutral";

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-3.5 h-3.5 ${s <= rating ? "fill-amber-400 text-amber-400" : "text-gray-200"}`}
        />
      ))}
    </div>
  );
}

function RatingBadge({ rating }: { rating: number }) {
  const colors: Record<number, string> = {
    5: "bg-emerald-100 text-emerald-700",
    4: "bg-green-100 text-green-700",
    3: "bg-amber-100 text-amber-700",
    2: "bg-orange-100 text-orange-700",
    1: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[rating] || "bg-gray-100 text-gray-600"}`}>
      <Star className="w-3 h-3 fill-current" /> {rating}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
    </Card>
  );
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function truncate(text: string | null, maxLen: number): string {
  if (!text) return "—";
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

/** Whether this review needs urgent attention (low rating, no public response). */
function needsAttention(r: MonitoredReview): boolean {
  return r.rating <= 2 && !r.response_text;
}

export default function ReviewsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [ratingFilter, setRatingFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<MonitoredReview | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftEdited, setDraftEdited] = useState(false);
  const [draftTone, setDraftTone] = useState<DraftTone>("auto");
  const [copied, setCopied] = useState(false);

  const openReview = (r: MonitoredReview) => {
    setSelected(r);
    setDraftText(r.draft_response || "");
    setDraftEdited(false);
    setDraftTone("auto");
    setCopied(false);
  };

  const closeReview = () => {
    setSelected(null);
    setDraftText("");
    setDraftEdited(false);
    setCopied(false);
  };

  // Build query params
  const buildParams = () => {
    const params = new URLSearchParams();
    params.set("limit", "50");
    if (ratingFilter === "low") { params.set("maxRating", "2"); }
    if (ratingFilter === "high") { params.set("minRating", "4"); }
    if (ratingFilter !== "all" && ratingFilter !== "low" && ratingFilter !== "high") {
      params.set("minRating", ratingFilter);
      params.set("maxRating", ratingFilter);
    }
    if (statusFilter === "new") params.set("isNew", "true");
    return params.toString();
  };

  const { data: listData, isLoading } = useQuery<{ data: MonitoredReview[]; total: number }>({
    queryKey: ["/api/admin/crm/monitored-reviews", ratingFilter, statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/crm/monitored-reviews?${buildParams()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load reviews");
      return res.json();
    },
  });

  const { data: stats } = useQuery<ReviewStats>({
    queryKey: ["/api/admin/crm/monitored-reviews/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/crm/monitored-reviews/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiRequest("POST", "/api/admin/crm/monitored-reviews/acknowledge", { ids });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/monitored-reviews"] });
      toast({ title: "Marked as reviewed" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (clientId: number) => {
      const res = await apiRequest("POST", "/api/admin/crm/monitored-reviews/sync", { client_id: clientId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sync triggered", description: "Reviews will update shortly." });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/monitored-reviews"] });
      }, 5000);
    },
  });

  const draftMutation = useMutation({
    mutationFn: async ({ reviewId, tone }: { reviewId: number; tone: DraftTone }) => {
      const body = tone !== "auto" ? { tone } : undefined;
      const res = await apiRequest("POST", `/api/admin/crm/monitored-reviews/${reviewId}/draft-response`, body);
      return res.json();
    },
    onSuccess: (data: { draft: string; tone: string; generated: boolean; error?: string }) => {
      setDraftText(data.draft);
      setDraftEdited(false);
      setCopied(false);
      if (selected) {
        setSelected({ ...selected, draft_response: data.draft, draft_generated_at: new Date().toISOString(), draft_model: data.generated ? "ai" : "fallback" });
      }
      if (!data.generated) {
        toast({ title: "AI unavailable", description: "Using fallback response. You can edit it." });
      } else {
        toast({ title: "Draft generated" });
      }
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: async ({ id, draft }: { id: number; draft: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/monitored-reviews/${id}/draft-response`, { draft_response: draft });
      return res.json();
    },
    onSuccess: () => {
      setDraftEdited(false);
      if (selected) {
        setSelected({ ...selected, draft_response: draftText });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/monitored-reviews"] });
      toast({ title: "Draft saved" });
    },
  });

  const postToGoogleMutation = useMutation({
    mutationFn: async ({ id, text }: { id: number; text: string }) => {
      const res = await apiRequest("POST", `/api/admin/crm/monitored-reviews/${id}/post-to-google`, { response_text: text });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to post");
      }
      return res.json();
    },
    onSuccess: () => {
      if (selected) {
        setSelected({ ...selected, response_text: draftText, posted_via: "reputationshield", posted_at: new Date().toISOString() });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/monitored-reviews"] });
      toast({ title: "Response posted to Google" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to post", description: err.message });
    },
  });

  // Client-side filters
  let reviews = listData?.data ?? [];
  if (statusFilter === "no_response") {
    reviews = reviews.filter((r) => !r.response_text);
  }
  if (statusFilter === "needs_attention") {
    reviews = reviews.filter((r) => needsAttention(r));
  }
  if (statusFilter === "has_draft") {
    reviews = reviews.filter((r) => !!r.draft_response);
  }

  const noResponse = stats ? stats.total - stats.withResponse : 0;
  const lowRating = stats ? (stats.byRating[1] ?? 0) + (stats.byRating[2] ?? 0) : 0;

  const isLowRating = selected ? selected.rating <= 2 : false;
  const hasPublicResponse = selected ? !!selected.response_text : false;
  const hasDraft = !!draftText;

  return (
    <AdminLayout pageContext={{ page: "reviews" }}>
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Review Monitor</h2>
          <p className="text-sm text-gray-500">Track and manage public reviews across clients</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total Reviews" value={stats?.total ?? "—"} icon={Star} color="bg-blue-500" />
          <StatCard label="Avg Rating" value={stats ? `${stats.averageRating}★` : "—"} icon={TrendingUp} color="bg-emerald-500" />
          <HelpCue text="Reviews detected by monitoring that haven't been acknowledged by admin yet.">
            <StatCard label="New / Unseen" value={stats?.newCount ?? "—"} icon={Eye} color="bg-violet-500" />
          </HelpCue>
          <HelpCue text="Public reviews without an owner response. Responding improves trust and SEO.">
            <StatCard label="No Response" value={noResponse} icon={MessageSquare} color="bg-amber-500" />
          </HelpCue>
          <HelpCue text="1-2 star reviews without a public response. These need attention first.">
            <StatCard label="Low Rating" value={lowRating} icon={AlertTriangle} color="bg-red-500" />
          </HelpCue>
        </div>

        {/* Rating distribution bar */}
        {stats && stats.total > 0 && (
          <Card className="p-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Rating Distribution</p>
            <div className="flex gap-1 h-5">
              {[5, 4, 3, 2, 1].map((r) => {
                const count = stats.byRating[r] ?? 0;
                const pct = (count / stats.total) * 100;
                if (pct === 0) return null;
                const colors: Record<number, string> = {
                  5: "bg-emerald-400", 4: "bg-green-400", 3: "bg-amber-400", 2: "bg-orange-400", 1: "bg-red-400",
                };
                return (
                  <div
                    key={r}
                    className={`${colors[r]} rounded-sm flex items-center justify-center text-[10px] font-medium text-white`}
                    style={{ width: `${pct}%`, minWidth: pct > 0 ? 20 : 0 }}
                    title={`${r}★: ${count}`}
                  >
                    {pct >= 8 ? `${r}★` : ""}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={ratingFilter} onValueChange={setRatingFilter}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ratings</SelectItem>
              <SelectItem value="high">4-5 Stars</SelectItem>
              <SelectItem value="low">1-2 Stars</SelectItem>
              <SelectItem value="5">5 Stars</SelectItem>
              <SelectItem value="4">4 Stars</SelectItem>
              <SelectItem value="3">3 Stars</SelectItem>
              <SelectItem value="2">2 Stars</SelectItem>
              <SelectItem value="1">1 Star</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reviews</SelectItem>
              <SelectItem value="new">New / Unseen</SelectItem>
              <SelectItem value="no_response">No Response</SelectItem>
              <SelectItem value="needs_attention">Needs Attention</SelectItem>
              <SelectItem value="has_draft">Has Draft</SelectItem>
            </SelectContent>
          </Select>
          {stats && stats.newCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-[36px]"
              disabled={acknowledgeMutation.isPending}
              onClick={() => {
                const newIds = reviews.filter((r) => r.is_new).map((r) => r.id);
                if (newIds.length > 0) acknowledgeMutation.mutate(newIds);
              }}
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Mark All Seen
            </Button>
          )}
        </div>

        {/* Review table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead className="hidden md:table-cell">Review</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  </TableRow>
                ))
              ) : reviews.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    No reviews found. Reviews appear after the monitoring worker runs.
                  </TableCell>
                </TableRow>
              ) : (
                reviews.map((r) => (
                  <TableRow
                    key={r.id}
                    className={`cursor-pointer hover:bg-gray-50 ${needsAttention(r) ? "bg-red-50/40" : ""}`}
                    onClick={() => openReview(r)}
                  >
                    <TableCell>
                      {r.is_new ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500" title="New" />
                      ) : needsAttention(r) ? (
                        <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm text-gray-900">{r.reviewer_name}</div>
                      <div className="text-xs text-gray-400">{r.platform}</div>
                    </TableCell>
                    <TableCell>
                      <RatingBadge rating={r.rating} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell max-w-[300px]">
                      <span className="text-sm text-gray-600">{truncate(r.review_text, 80)}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-gray-500">
                      {formatDate(r.published_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {r.response_text ? (
                          <Badge variant="secondary" className="text-xs bg-green-50 text-green-700">Replied</Badge>
                        ) : r.draft_response ? (
                          <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-600">Draft</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs bg-gray-50 text-gray-400">None</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Detail dialog */}
        <Dialog open={!!selected} onOpenChange={(open) => { if (!open) closeReview(); }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RatingStars rating={selected?.rating ?? 0} />
                <span className="text-sm text-gray-500">by {selected?.reviewer_name}</span>
                {selected && needsAttention(selected) && (
                  <Badge className="text-xs bg-red-100 text-red-700 ml-auto">Needs attention</Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-4">
                {/* Low-rating alert for 1-2 star reviews without response */}
                {isLowRating && !hasPublicResponse && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700">
                      This is a low-rating review with no public response. A prompt, professional reply can help with recovery and shows future customers you care.
                    </p>
                  </div>
                )}

                {/* Review text */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Review</p>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {selected.review_text || "No text provided."}
                  </p>
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">Published</p>
                    <p className="text-gray-700">{formatDate(selected.published_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">First Seen</p>
                    <p className="text-gray-700">{formatDate(selected.first_seen_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Platform</p>
                    <p className="text-gray-700 capitalize">{selected.platform}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Last Synced</p>
                    <p className="text-gray-700">{formatDate(selected.last_synced_at)}</p>
                  </div>
                </div>

                {/* Owner response (public) */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Public Response</p>
                  {selected.response_text ? (
                    <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                      <p className="text-sm text-green-800 leading-relaxed whitespace-pre-wrap">
                        {selected.response_text}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-green-500">
                        {selected.response_date && <span>Posted {formatDate(selected.response_date)}</span>}
                        {selected.posted_via === "reputationshield" && (
                          <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-medium">via ReputationShield</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No public response yet.</p>
                  )}
                </div>

                {/* AI Draft Response */}
                <div className={`rounded-lg ${isLowRating && !hasPublicResponse ? "ring-1 ring-red-200 p-3 bg-red-50/30" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-gray-500">AI Draft</p>
                      {hasDraft && !draftEdited && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
                          Draft only — not posted
                        </span>
                      )}
                      {draftEdited && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">
                          Unsaved changes
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tone selector + generate button */}
                  <div className="flex items-center gap-2 mb-2">
                    <Select value={draftTone} onValueChange={(v) => setDraftTone(v as DraftTone)}>
                      <SelectTrigger className="h-7 text-xs w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto tone</SelectItem>
                        <SelectItem value="positive">Warm</SelectItem>
                        <SelectItem value="neutral">Professional</SelectItem>
                        <SelectItem value="negative">Recovery</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant={isLowRating && !hasPublicResponse && !hasDraft ? "default" : "outline"}
                      className={`h-7 text-xs ${isLowRating && !hasPublicResponse && !hasDraft ? "bg-[#2D6A4F] hover:bg-[#1B4332]" : ""}`}
                      disabled={draftMutation.isPending}
                      onClick={() => draftMutation.mutate({ reviewId: selected.id, tone: draftTone })}
                    >
                      {draftMutation.isPending ? (
                        <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Drafting...</>
                      ) : hasDraft ? (
                        <><Sparkles className="w-3 h-3 mr-1" /> Regenerate</>
                      ) : (
                        <><Sparkles className="w-3 h-3 mr-1" /> Draft Response</>
                      )}
                    </Button>
                  </div>

                  {hasDraft ? (
                    <div className="space-y-2">
                      <textarea
                        value={draftText}
                        onChange={(e) => { setDraftText(e.target.value); setDraftEdited(true); setCopied(false); }}
                        rows={4}
                        className="w-full p-3 text-sm border rounded-lg resize-vertical focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
                      />
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            navigator.clipboard.writeText(draftText);
                            setCopied(true);
                            toast({ title: "Copied to clipboard" });
                          }}
                        >
                          {copied ? (
                            <><CheckCircle2 className="w-3 h-3 mr-1 text-green-600" /> Copied</>
                          ) : (
                            <><Copy className="w-3 h-3 mr-1" /> Copy</>
                          )}
                        </Button>
                        {draftEdited && (
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-[#2D6A4F] hover:bg-[#1B4332]"
                            disabled={saveDraftMutation.isPending}
                            onClick={() => saveDraftMutation.mutate({ id: selected.id, draft: draftText })}
                          >
                            {saveDraftMutation.isPending ? (
                              <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...</>
                            ) : (
                              <><Save className="w-3 h-3 mr-1" /> Save Draft</>
                            )}
                          </Button>
                        )}
                        {selected.platform === "google" && selected.google_review_name && !selected.response_text && (
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                            disabled={postToGoogleMutation.isPending || !draftText.trim()}
                            onClick={() => postToGoogleMutation.mutate({ id: selected.id, text: draftText })}
                          >
                            {postToGoogleMutation.isPending ? (
                              <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Posting...</>
                            ) : (
                              <><Send className="w-3 h-3 mr-1" /> Post to Google</>
                            )}
                          </Button>
                        )}
                      </div>
                      {selected.draft_generated_at && (
                        <p className="text-[11px] text-gray-400">
                          Generated {formatDate(selected.draft_generated_at)}
                          {selected.draft_model && ` · ${selected.draft_model}`}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">
                      {isLowRating && !hasPublicResponse
                        ? "Draft a recovery response to address this review."
                        : "Click \"Draft Response\" to generate an AI response."}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  {selected.is_new && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        acknowledgeMutation.mutate([selected.id]);
                        setSelected({ ...selected, is_new: false });
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Mark Seen
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={syncMutation.isPending}
                    onClick={() => {
                      if (selected.client_id) syncMutation.mutate(selected.client_id);
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" /> Sync Now
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
