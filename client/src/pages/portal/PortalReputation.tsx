import { useQuery } from "@tanstack/react-query";
import { Star, TrendingUp, MessageSquare, Send, CheckCircle } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ReputationReport {
  summary: {
    reviews_this_month: number;
    reviews_last_month: number;
    reviews_change: number;
    total_reviews: number;
    average_rating: number | null;
    average_rating_this_month: number | null;
    average_rating_last_month: number | null;
    reply_rate: number | null;
  };
  activity: {
    reviews_responded_to: number;
    review_requests_sent: number;
    reviews_generated: number;
    estimated_response_rate: number | null;
    avg_days_to_review: number | null;
  };
  weekly_trend: { week: string; reviews: number }[];
  latest_reviews: {
    reviewer: string;
    rating: number | null;
    text: string;
    date: string | null;
    replied: boolean;
  }[];
  recent_replies: {
    reviewer: string;
    rating: number | null;
    date: string | null;
  }[];
}

function Stars({ count }: { count: number }) {
  return (
    <span className="text-amber-400">
      {"★".repeat(count)}{"☆".repeat(5 - count)}
    </span>
  );
}

export default function PortalReputation() {
  const { data, isLoading } = useQuery<ReputationReport>({
    queryKey: ["/api/portal/reputation"],
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="max-w-3xl mx-auto space-y-4 p-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </PortalLayout>
    );
  }

  if (!data) {
    return (
      <PortalLayout>
        <div className="max-w-3xl mx-auto p-4 text-center py-16">
          <p className="text-gray-500">Reputation report is not yet available.</p>
          <p className="text-sm text-gray-400 mt-1">Your review automation may still be setting up.</p>
        </div>
      </PortalLayout>
    );
  }

  const s = data.summary;
  const a = data.activity;

  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto space-y-5 p-4">
        {/* Header */}
        <div>
          <h1 className="text-lg font-bold text-gray-900">Your Reputation Report</h1>
          <p className="text-sm text-gray-500">Here's how your online reputation is performing</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard icon={<Star className="w-4 h-4 text-amber-500" />} label="Average Rating" value={s.average_rating != null ? `${s.average_rating}` : "—"} sub={s.average_rating_this_month != null ? `${s.average_rating_this_month} this month` : undefined} change={s.average_rating_this_month != null && s.average_rating_last_month != null ? Math.round((s.average_rating_this_month - s.average_rating_last_month) * 10) / 10 : undefined} />
          <MetricCard icon={<TrendingUp className="w-4 h-4 text-emerald-500" />} label="Reviews This Month" value={`${s.reviews_this_month}`} sub={`${s.total_reviews} total`} change={s.reviews_change !== 0 ? s.reviews_change : undefined} />
          <MetricCard icon={<MessageSquare className="w-4 h-4 text-blue-500" />} label="Reply Rate" value={s.reply_rate != null ? `${s.reply_rate}%` : "—"} sub={`${a.reviews_responded_to} responded`} />
          <MetricCard icon={<Send className="w-4 h-4 text-purple-500" />} label="Requests Sent" value={`${a.review_requests_sent}`} sub={a.reviews_generated > 0 ? `${a.reviews_generated} reviews likely generated` : undefined} />
        </div>

        {/* Value Summary */}
        <Card className="p-5 bg-[#F0F7F4] border-[#2D6A4F]/10">
          <h3 className="text-sm font-semibold text-[#2D6A4F] mb-2">What we've done for you</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-[#2D6A4F] mt-0.5 flex-shrink-0" />
              <span className="text-gray-700">Responded to <strong>{a.reviews_responded_to}</strong> reviews on your behalf</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-[#2D6A4F] mt-0.5 flex-shrink-0" />
              <span className="text-gray-700">Sent <strong>{a.review_requests_sent}</strong> review requests to your customers</span>
            </div>
            {a.reviews_generated > 0 && (
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-[#2D6A4F] mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">~<strong>{a.reviews_generated}</strong> new reviews likely from our requests</span>
              </div>
            )}
          </div>
          {a.estimated_response_rate != null && a.estimated_response_rate > 0 && (
            <p className="text-xs text-gray-500 mt-3">Estimated review request response rate: {a.estimated_response_rate}%{a.avg_days_to_review ? ` · Average ${a.avg_days_to_review} days to receive a review` : ""}</p>
          )}
        </Card>

        {/* Weekly Trend */}
        {data.weekly_trend.some(w => w.reviews > 0) && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Reviews Per Week</h3>
            <div className="flex items-end gap-1.5 h-16">
              {data.weekly_trend.map((w, i) => {
                const max = Math.max(...data.weekly_trend.map(t => t.reviews), 1);
                const height = w.reviews > 0 ? Math.max(6, (w.reviews / max) * 64) : 3;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <div className={`w-full rounded-t ${w.reviews > 0 ? "bg-[#2D6A4F]" : "bg-gray-200"}`} style={{ height: `${height}px` }} />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1.5 mt-1">
              {data.weekly_trend.map((w, i) => (
                <div key={i} className="flex-1 text-center text-[9px] text-gray-400">{w.week}</div>
              ))}
            </div>
          </Card>
        )}

        {/* Latest Reviews */}
        {data.latest_reviews.length > 0 && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Positive Reviews</h3>
            <div className="space-y-3">
              {data.latest_reviews.map((r, i) => (
                <div key={i} className="pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{r.reviewer}</span>
                      {r.rating && <Stars count={r.rating} />}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      {r.replied && <span className="text-emerald-600">Replied ✓</span>}
                      {r.date && <span>{r.date}</span>}
                    </div>
                  </div>
                  {r.text && <p className="text-sm text-gray-600">{r.text}</p>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Recent Replies */}
        {data.recent_replies.length > 0 && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Responses Posted</h3>
            <div className="space-y-2">
              {data.recent_replies.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-gray-700">Replied to {r.reviewer}</span>
                    {r.rating && <Stars count={r.rating} />}
                  </div>
                  {r.date && <span className="text-xs text-gray-400">{r.date}</span>}
                </div>
              ))}
            </div>
          </Card>
        )}

        <p className="text-[10px] text-gray-400 text-center pb-4">
          Review attribution is estimated based on timing and customer matching. Actual results may vary.
        </p>
      </div>
    </PortalLayout>
  );
}

function MetricCard({ icon, label, value, sub, change }: { icon: React.ReactNode; label: string; value: string; sub?: string; change?: number }) {
  return (
    <Card className="p-4 text-center">
      <div className="flex items-center justify-center mb-1">{icon}</div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      {change !== undefined && change !== 0 && (
        <p className={`text-[10px] font-medium mt-0.5 ${change > 0 ? "text-emerald-600" : "text-red-500"}`}>
          {change > 0 ? "↑" : "↓"} {Math.abs(change)} vs last month
        </p>
      )}
    </Card>
  );
}
