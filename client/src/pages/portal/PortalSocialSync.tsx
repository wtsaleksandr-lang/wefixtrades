import { usePageTitle } from "@/hooks/usePageTitle";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Share2, CheckCircle, Clock, Calendar, ImageIcon, Settings, X, ThumbsUp, ThumbsDown, Edit3, Loader2 } from "lucide-react";
import { Link } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SOCIALSYNC_POST_STATUS_LABELS,
  SOCIALSYNC_POST_STATUS_STYLES,
  statusLabel,
} from "@/config/portalLabels";

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
  recent_posts: PostItem[];
  upcoming_posts: (PostItem & { scheduled_for: string; scheduled_date: string })[];
}

interface PostItem {
  id: number;
  platform: string;
  caption: string;
  full_text?: string;
  hashtags?: string[] | null;
  published_at?: string | null;
  has_image: boolean;
  image_url: string | null;
}

interface PendingPost {
  id: number;
  platform: string;
  post_text: string;
  hashtags: string[] | null;
  media_plan: { prompt?: string } | null;
  scheduled_for: string;
  created_at: string;
}

const STATUS_MESSAGES: Record<string, { headline: string; sub: string }> = {
  active: { headline: "Your social media is on autopilot", sub: "We're creating and posting content for your business automatically." },
  ready: { headline: "Your accounts are connected and ready", sub: "Content will start being published soon." },
  needs_connection: { headline: "Almost there — connect your accounts", sub: "We need access to your social media accounts to start posting. Your admin team will set this up." },
  setup_in_progress: { headline: "Setting up your SocialSync", sub: "We're getting everything ready. Your admin team will complete the setup shortly." },
};

export default function PortalSocialSync() {
  usePageTitle("Social Media");
  const [selectedPost, setSelectedPost] = useState<PostItem | null>(null);
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [actionPostId, setActionPostId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SocialSyncReport>({
    queryKey: ["/api/portal/socialsync"],
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: pending } = useQuery<{ posts: PendingPost[] }>({
    queryKey: ["/api/portal/socialsync/pending"],
    refetchInterval: 2 * 60 * 1000,
  });

  async function callAction(postId: number, path: "approve" | "reject", body?: any) {
    setActionPostId(postId);
    try {
      const res = await fetch(`/api/portal/socialsync/posts/${postId}/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error("action failed");
      queryClient.invalidateQueries({ queryKey: ["/api/portal/socialsync/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/socialsync"] });
    } catch (err) {
      console.error("Action failed:", err);
    } finally {
      setActionPostId(null);
    }
  }

  async function saveEdit(postId: number) {
    if (editText.trim().length < 10) return;
    setActionPostId(postId);
    try {
      const res = await fetch(`/api/portal/socialsync/posts/${postId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_text: editText.trim() }),
      });
      if (!res.ok) throw new Error("edit failed");
      setEditingPostId(null);
      setEditText("");
      queryClient.invalidateQueries({ queryKey: ["/api/portal/socialsync/pending"] });
    } catch (err) {
      console.error("Edit failed:", err);
    } finally {
      setActionPostId(null);
    }
  }

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
          <p className="text-gray-500 font-medium">You haven't set up SocialSync yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">Tell us about your business and we'll start creating content for you.</p>
          <Link href="/portal/socialsync-setup">
            <Button className="bg-[#2D6A4F] hover:bg-[#1B4332]">Set Up SocialSync</Button>
          </Link>
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Your Social Media</h1>
            <p className="text-sm text-gray-500">Powered by SocialSync</p>
          </div>
          <Link href="/portal/socialsync-setup">
            <Button variant="ghost" size="sm" className="text-xs text-gray-500">
              <Settings className="w-3.5 h-3.5 mr-1" /> Edit Settings
            </Button>
          </Link>
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

        {/* Pending approval queue — customer can approve, reject, or edit before auto-publish */}
        {pending?.posts && pending.posts.length > 0 && (
          <Card className="p-5 border-amber-200 bg-amber-50/30">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Posts awaiting your review</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  We'll auto-publish these at their scheduled time unless you act.
                </p>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                {pending.posts.length} pending
              </span>
            </div>
            <div className="space-y-3">
              {pending.posts.map(p => {
                const isEditing = editingPostId === p.id;
                const isBusy = actionPostId === p.id;
                return (
                  <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-medium text-gray-500 capitalize">{p.platform}</span>
                      <span className="text-[11px] text-gray-400">
                        Scheduled {new Date(p.scheduled_for).toLocaleDateString()} {new Date(p.scheduled_for).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                    {isEditing ? (
                      <textarea
                        className="w-full text-sm text-gray-800 border border-gray-200 rounded-md p-2 font-sans resize-y min-h-[100px] focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        maxLength={3000}
                      />
                    ) : (
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{p.post_text}</p>
                    )}
                    {p.hashtags && p.hashtags.length > 0 && !isEditing && (
                      <p className="text-xs text-[#2D6A4F] mt-2">{p.hashtags.map(h => `#${h}`).join(" ")}</p>
                    )}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            className="bg-[#2D6A4F] hover:bg-[#1B4332] text-white text-xs"
                            disabled={isBusy || editText.trim().length < 10}
                            onClick={() => saveEdit(p.id)}
                          >
                            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                            Save & approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-gray-500"
                            disabled={isBusy}
                            onClick={() => { setEditingPostId(null); setEditText(""); }}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            className="bg-[#2D6A4F] hover:bg-[#1B4332] text-white text-xs"
                            disabled={isBusy}
                            onClick={() => callAction(p.id, "approve")}
                          >
                            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3 mr-1" />}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            disabled={isBusy}
                            onClick={() => { setEditingPostId(p.id); setEditText(p.post_text); }}
                          >
                            <Edit3 className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto"
                            disabled={isBusy}
                            onClick={() => callAction(p.id, "reject")}
                          >
                            <ThumbsDown className="w-3 h-3 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Recent Posts */}
        {data.recent_posts.length > 0 && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Content We Published</h3>
            <div className="space-y-3">
              {data.recent_posts.map(post => (
                <div key={post.id} className="flex gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0 cursor-pointer hover:bg-gray-50 rounded-lg -mx-1 px-1 transition-colors" onClick={() => setSelectedPost(post)}>
                  {post.has_image && post.image_url && (
                    <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                      <img src={post.image_url} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
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

        {/* Upcoming Posts */}
        {data.upcoming_posts.length === 0 && data.recent_posts.length > 0 && (
          <Card className="p-4 text-center">
            <p className="text-xs text-gray-400">All scheduled posts have been published. New content will be generated soon.</p>
          </Card>
        )}
        {data.upcoming_posts.length > 0 && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Coming Up</h3>
            <div className="space-y-2">
              {data.upcoming_posts.map((post, i) => {
                const showDate = i === 0 || post.scheduled_date !== data.upcoming_posts[i - 1].scheduled_date;
                return (
                  <div key={post.id}>
                    {showDate && (
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mt-2 mb-1 first:mt-0">{post.scheduled_date}</p>
                    )}
                    <div className="flex gap-3 py-2 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 rounded-lg -mx-1 px-1 transition-colors" onClick={() => setSelectedPost(post)}>
                      {post.has_image && post.image_url ? (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                          <img src={post.image_url} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-medium text-gray-500">{post.platform}</span>
                          <span className="text-[10px] text-gray-400">{post.scheduled_for}</span>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-1">{post.caption}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {s.autopilot && (
          <p className="text-[10px] text-gray-400 text-center pb-4">
            Content is generated and published automatically by SocialSync. Posts are quality-checked before going live.
          </p>
        )}
      </div>

      {/* Post Detail Modal */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedPost(null)}>
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500">{selectedPost.platform}</span>
                {selectedPost.published_at && <span className="text-xs text-gray-400">{selectedPost.published_at}</span>}
                {"scheduled_for" in selectedPost && (selectedPost as any).scheduled_for && (
                  <span className="text-xs text-gray-400">Scheduled: {(selectedPost as any).scheduled_for}</span>
                )}
              </div>
              <button onClick={() => setSelectedPost(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Image */}
            {selectedPost.has_image && selectedPost.image_url && (
              <div className="bg-gray-50">
                <img src={selectedPost.image_url} alt="" className="w-full max-h-80 object-contain" onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }} />
              </div>
            )}

            {/* Content */}
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                {selectedPost.full_text || selectedPost.caption}
              </p>

              {selectedPost.hashtags && selectedPost.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedPost.hashtags.map((tag, i) => (
                    <span key={i} className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      #{tag.replace(/^#/, "")}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
