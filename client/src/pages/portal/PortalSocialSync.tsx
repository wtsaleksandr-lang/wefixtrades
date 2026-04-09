import { useQuery } from "@tanstack/react-query";
import { Share2, CheckCircle, Clock, Calendar, ImageIcon } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface SocialSyncReport {
  status: "setup_in_progress" | "needs_connection" | "ready" | "active";
  summary: {
    posts_this_month: number;
    total_published: number;
    active_platforms: number;
    posting_frequency: string;
    autopilot: boolean;
  };
  next_scheduled: { platform: string; scheduled_for: string } | null;
  platforms: { platform: string; connected: boolean }[];
  recent_posts: {
    id: number;
    platform: string;
    caption: string;
    published_at: string | null;
    has_image: boolean;
    image_url: string | null;
  }[];
}

const STATUS_MESSAGES: Record<string, { headline: string; sub: string }> = {
  active: { headline: "Your social media is on autopilot", sub: "We're creating and posting content for your business automatically." },
  ready: { headline: "Your accounts are connected and ready", sub: "Content will start being published soon." },
  needs_connection: { headline: "Almost there — connect your accounts", sub: "We need access to your social media accounts to start posting. Your admin team will set this up." },
  setup_in_progress: { headline: "Setting up your SocialSync", sub: "We're getting everything ready. Your admin team will complete the setup shortly." },
};

export default function PortalSocialSync() {
  const { data, isLoading } = useQuery<SocialSyncReport>({
    queryKey: ["/api/portal/socialsync"],
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="max-w-3xl mx-auto space-y-4 p-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </PortalLayout>
    );
  }

  if (!data) {
    return (
      <PortalLayout>
        <div className="max-w-3xl mx-auto p-4 text-center py-16">
          <Share2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">SocialSync is not yet active for your account.</p>
          <p className="text-sm text-gray-400 mt-1">Contact your account manager to get started.</p>
        </div>
      </PortalLayout>
    );
  }

  const s = data.summary;
  const msg = STATUS_MESSAGES[data.status] || STATUS_MESSAGES.active;

  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto space-y-5 p-4">
        {/* Header */}
        <div>
          <h1 className="text-lg font-bold text-gray-900">Your Social Media</h1>
          <p className="text-sm text-gray-500">Powered by SocialSync</p>
        </div>

        {/* Status banner */}
        <Card className={`p-5 ${data.status === "active" ? "bg-[#F0F7F4] border-[#2D6A4F]/10" : "bg-gray-50"}`}>
          <div className="flex items-start gap-3">
            {data.status === "active" ? (
              <CheckCircle className="w-5 h-5 text-[#2D6A4F] mt-0.5 flex-shrink-0" />
            ) : (
              <Clock className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
            )}
            <div>
              <p className={`text-sm font-semibold ${data.status === "active" ? "text-[#2D6A4F]" : "text-gray-700"}`}>{msg.headline}</p>
              <p className="text-xs text-gray-500 mt-0.5">{msg.sub}</p>
            </div>
          </div>
        </Card>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Posts This Month" value={`${s.posts_this_month}`} />
          <MetricCard label="Total Published" value={`${s.total_published}`} />
          <MetricCard label="Active Platforms" value={`${s.active_platforms}`} />
          <MetricCard label="Frequency" value={s.posting_frequency} />
        </div>

        {/* Next Scheduled */}
        {data.next_scheduled && (
          <Card className="p-4 flex items-center gap-3">
            <Calendar className="w-4 h-4 text-[#2D6A4F]" />
            <div>
              <p className="text-xs text-gray-500">Next scheduled post</p>
              <p className="text-sm font-medium text-gray-800">{data.next_scheduled.platform} — {data.next_scheduled.scheduled_for}</p>
            </div>
          </Card>
        )}

        {/* Connected Platforms */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Your Platforms</h3>
          <div className="space-y-2">
            {data.platforms.map(p => (
              <div key={p.platform} className={`flex items-center justify-between p-3 rounded-lg border ${p.connected ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200"}`}>
                <span className="text-sm font-medium text-gray-800">{p.platform}</span>
                {p.connected ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <CheckCircle className="w-3.5 h-3.5" /> Connected
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Not connected</span>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Posts */}
        {data.recent_posts.length > 0 && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Content We Published</h3>
            <div className="space-y-3">
              {data.recent_posts.map(post => (
                <div key={post.id} className="flex gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                  {post.has_image && post.image_url && (
                    <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                      <img src={post.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  )}
                  {post.has_image && !post.image_url && (
                    <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="w-5 h-5 text-gray-300" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-medium text-gray-500 capitalize">{post.platform}</span>
                      {post.published_at && <span className="text-[10px] text-gray-400">{post.published_at}</span>}
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{post.caption}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {s.autopilot && (
          <p className="text-[10px] text-gray-400 text-center pb-4">
            Content is generated and published automatically by SocialSync. Posts are quality-checked before going live.
          </p>
        )}
      </div>
    </PortalLayout>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4 text-center">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </Card>
  );
}
