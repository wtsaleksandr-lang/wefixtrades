import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Star, TrendingUp, MessageSquare, Send, ShieldCheck, AlertTriangle,
  ChevronDown, ChevronUp, Loader2, RefreshCw, ThumbsDown, Eye,
} from "lucide-react";

interface ReviewItem {
  id: number;
  reviewer_name: string;
  rating: number;
  review_text: string | null;
  published_at: string | null;
  response_text: string | null;
  draft_response: string | null;
  is_new: boolean;
  platform: string;
  first_seen_at: string;
}

interface FeedbackItem {
  id: number;
  customer_name: string | null;
  internal_feedback: string | null;
  sentiment: string | null;
  trigger_source: string;
  created_at: string;
  completed_at: string | null;
}

interface OverviewData {
  reviews: {
    total: number;
    averageRating: number;
    last30Days: number;
    last7Days: number;
    withoutResponse: number;
    lowRatingNoResponse: number;
    withDraft: number;
  };
  requests: {
    totalSent: number;
    pendingFollowups: number;
    routedPositive: number;
    feedbackCaptured: number;
  };
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function RatingStars({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const cls = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={`${cls} ${s <= rating ? "fill-amber-400 text-amber-400" : "text-gray-200"}`} />
      ))}
    </div>
  );
}

function MetricCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

export default function PortalReviews() {
  const [expandedReview, setExpandedReview] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const { data: overview, isLoading: loadingOverview, error: overviewError, refetch: refetchOverview } = useQuery<OverviewData>({
    queryKey: ["/api/portal/reputation/overview"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/overview", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const { data: reviewsData, isLoading: loadingReviews } = useQuery<{ data: ReviewItem[]; total: number }>({
    queryKey: ["/api/portal/reputation/reviews"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/reviews?limit=20", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const { data: feedbackData, isLoading: loadingFeedback } = useQuery<{ data: FeedbackItem[] }>({
    queryKey: ["/api/portal/reputation/feedback"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/feedback", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: showFeedback,
  });

  const reviews = reviewsData?.data ?? [];
  const feedback = feedbackData?.data ?? [];
  const rv = overview?.reviews;
  const rq = overview?.requests;

  if (overviewError) {
    return (
      <PortalLayout>
        <div className="max-w-5xl mx-auto py-12 text-center">
          <p className="text-red-600 mb-3">Failed to load reputation data.</p>
          <Button variant="outline" size="sm" onClick={() => refetchOverview()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Retry
          </Button>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Your Reviews</h2>
          <p className="text-sm text-gray-500">How customers see your business online</p>
        </div>

        {/* Metrics */}
        {loadingOverview ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : rv && rq ? (
          <>
            {/* Top-line metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard
                label="Average Rating"
                value={`${rv.averageRating}★`}
                icon={Star}
                color="bg-amber-500"
              />
              <MetricCard
                label="Total Reviews"
                value={rv.total}
                sub={rv.last30Days > 0 ? `+${rv.last30Days} this month` : undefined}
                icon={TrendingUp}
                color="bg-emerald-500"
              />
              <MetricCard
                label="Review Requests Sent"
                value={rq.totalSent}
                sub={rq.pendingFollowups > 0 ? `${rq.pendingFollowups} follow-ups pending` : undefined}
                icon={Send}
                color="bg-blue-500"
              />
              <MetricCard
                label="Private Feedback"
                value={rq.feedbackCaptured}
                sub={`${rq.routedPositive} sent to Google`}
                icon={ShieldCheck}
                color="bg-violet-500"
              />
            </div>

            {/* Value signals */}
            <Card className="p-4 space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">This Month</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                {rv.last30Days > 0 && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <Star className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>You received <strong>{rv.last30Days}</strong> new public review{rv.last30Days !== 1 ? "s" : ""}</span>
                  </div>
                )}
                {rq.feedbackCaptured > 0 && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <ShieldCheck className="w-4 h-4 text-violet-500 shrink-0" />
                    <span><strong>{rq.feedbackCaptured}</strong> customer{rq.feedbackCaptured !== 1 ? "s" : ""} routed to private feedback</span>
                  </div>
                )}
                {rv.withoutResponse > 0 && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <MessageSquare className="w-4 h-4 text-amber-500 shrink-0" />
                    <span><strong>{rv.withoutResponse}</strong> review{rv.withoutResponse !== 1 ? "s" : ""} still need{rv.withoutResponse === 1 ? "s" : ""} a reply</span>
                  </div>
                )}
              </div>
              {rv.lowRatingNoResponse > 0 && (
                <div className="flex items-center gap-2 text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="text-sm"><strong>{rv.lowRatingNoResponse}</strong> low-rating review{rv.lowRatingNoResponse !== 1 ? "s" : ""} without a response — these should be addressed</span>
                </div>
              )}
            </Card>
          </>
        ) : null}

        {/* Recent Reviews */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Reviews</h3>
          {loadingReviews ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : reviews.length === 0 ? (
            <Card className="p-6 text-center text-gray-500 text-sm">
              No public reviews tracked yet. Reviews will appear here once monitoring starts.
            </Card>
          ) : (
            <div className="space-y-2">
              {reviews.map((r) => {
                const expanded = expandedReview === r.id;
                const isLow = r.rating <= 2;
                return (
                  <Card
                    key={r.id}
                    className={`overflow-hidden ${isLow && !r.response_text ? "border-red-200" : ""}`}
                  >
                    <button
                      className="w-full p-4 text-left flex items-start gap-3 hover:bg-gray-50/50 transition-colors"
                      onClick={() => setExpandedReview(expanded ? null : r.id)}
                    >
                      <div className="shrink-0 mt-0.5">
                        <RatingStars rating={r.rating} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">{r.reviewer_name}</span>
                          <span className="text-xs text-gray-400">{formatDate(r.published_at)}</span>
                          {r.is_new && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
                          )}
                        </div>
                        {r.review_text && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{r.review_text}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.response_text ? (
                          <Badge variant="secondary" className="text-[10px] bg-green-50 text-green-700">Replied</Badge>
                        ) : r.draft_response ? (
                          <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-600">Draft ready</Badge>
                        ) : isLow ? (
                          <Badge variant="secondary" className="text-[10px] bg-red-50 text-red-600">Needs reply</Badge>
                        ) : null}
                        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>
                    {expanded && (
                      <div className="px-4 pb-4 pt-0 space-y-3 border-t">
                        {/* Full review text */}
                        {r.review_text && (
                          <div className="pt-3">
                            <p className="text-xs text-gray-400 mb-1">Full Review</p>
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.review_text}</p>
                          </div>
                        )}

                        {/* Public response */}
                        {r.response_text && (
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Your Response (Public)</p>
                            <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                              <p className="text-sm text-green-800 whitespace-pre-wrap">{r.response_text}</p>
                            </div>
                          </div>
                        )}

                        {/* Draft (read-only for portal) */}
                        {!r.response_text && r.draft_response && (
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Draft Response (Not Posted)</p>
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                              <p className="text-sm text-blue-800 whitespace-pre-wrap">{r.draft_response}</p>
                              <p className="text-[11px] text-blue-500 mt-2">This draft was prepared by your team. It has not been posted publicly yet.</p>
                            </div>
                          </div>
                        )}

                        {/* No response state */}
                        {!r.response_text && !r.draft_response && (
                          <div className={`rounded-lg p-3 ${isLow ? "bg-red-50 border border-red-100" : "bg-gray-50"}`}>
                            <p className={`text-sm ${isLow ? "text-red-700" : "text-gray-500"}`}>
                              {isLow
                                ? "This review hasn't been responded to yet. Low-rating reviews benefit from a timely reply."
                                : "No response has been posted to this review yet."}
                            </p>
                          </div>
                        )}

                        <div className="text-xs text-gray-400">
                          First seen {formatDate(r.first_seen_at)} · {r.platform}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Private Feedback */}
        <div>
          <button
            className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3 hover:text-gray-900"
            onClick={() => setShowFeedback(!showFeedback)}
          >
            <ThumbsDown className="w-4 h-4" />
            Private Customer Feedback
            {rq && rq.feedbackCaptured > 0 && (
              <span className="text-xs font-normal text-gray-400">({rq.feedbackCaptured})</span>
            )}
            {showFeedback ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showFeedback && (
            <>
              {loadingFeedback ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : feedback.length === 0 ? (
                <Card className="p-4 text-center text-gray-500 text-sm">
                  No private feedback captured yet. When customers share concerns privately instead of publicly, they appear here.
                </Card>
              ) : (
                <div className="space-y-2">
                  {feedback.map((f) => (
                    <Card key={f.id} className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="text-sm font-medium text-gray-900">{f.customer_name || "Customer"}</span>
                          <span className="text-xs text-gray-400 ml-2">{formatDate(f.completed_at || f.created_at)}</span>
                        </div>
                        <Badge variant="secondary" className="text-[10px] bg-violet-50 text-violet-600">Private</Badge>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{f.internal_feedback}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        This feedback was captured privately and was not posted publicly.
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}
