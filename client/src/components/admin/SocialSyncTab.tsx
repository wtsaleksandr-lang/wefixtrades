import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Play, XCircle, RotateCcw, Calendar, Zap, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ─── */

interface SocialSyncProfile {
  id: number;
  client_id: number;
  enabled: boolean;
  niche: string | null;
  location: string | null;
  services: string[] | null;
  tone: string | null;
  frequency: string | null;
  autopilot: boolean;
  platform_preferences: string[] | null;
  service_focus: string[] | null;
  created_at: string;
  updated_at: string;
}

interface SocialSyncSummary {
  profile: SocialSyncProfile | null;
  stats: {
    active_topics: number;
    total_topics: number;
    draft_posts: number;
    ready_posts: number;
    queued_posts: number;
    published_posts: number;
    failed_posts: number;
    pending_queue: number;
    failed_queue: number;
    completed_queue: number;
  };
  next_scheduled: { id: number; platform: string; scheduled_for: string } | null;
  last_generation: { action: string; created_at: string; details: any } | null;
}

interface Topic {
  id: number;
  title: string;
  type: string;
  angle: string | null;
  target_service: string | null;
  status: string;
  source_type: string;
  created_at: string;
}

interface Post {
  id: number;
  platform: string;
  post_text: string;
  caption: string | null;
  hashtags: string[] | null;
  status: string;
  quality_score: number | null;
  scheduled_for: string | null;
  published_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

interface QueueItem {
  id: number;
  post_id: number;
  platform: string;
  status: string;
  run_at: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  worker_note: string | null;
}

interface ActivityLog {
  id: number;
  entity_type: string;
  action: string;
  status: string | null;
  details: any;
  created_at: string;
}

/* ─── Helpers ─── */

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  used: "bg-blue-50 text-blue-700",
  archived: "bg-gray-100 text-gray-600",
  rejected: "bg-red-50 text-red-700",
  draft: "bg-gray-100 text-gray-600",
  ready: "bg-blue-50 text-blue-700",
  queued: "bg-amber-50 text-amber-700",
  publishing: "bg-purple-50 text-purple-700",
  published: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
  pending: "bg-amber-50 text-amber-700",
  locked: "bg-purple-50 text-purple-700",
  completed: "bg-emerald-50 text-emerald-700",
  not_connected: "bg-gray-100 text-gray-500",
  connected: "bg-emerald-50 text-emerald-700",
  success: "bg-emerald-50 text-emerald-700",
  failure: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const TONES = ["professional", "casual", "friendly", "authoritative"];
const FREQUENCIES = [
  { value: "daily", label: "Daily (7/week)" },
  { value: "3_per_week", label: "3x per week" },
  { value: "2_per_week", label: "2x per week" },
  { value: "weekly", label: "Weekly (1/week)" },
];

/* ─── Main Component ─── */

export default function SocialSyncTab({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    niche: "", location: "", services: "",
    tone: "professional", frequency: "3_per_week",
    service_focus: "", platform_preferences: "facebook,instagram",
  });

  // ─── Queries ───

  const { data: summary, isLoading } = useQuery<SocialSyncSummary>({
    queryKey: [`/api/socialsync/clients/${clientId}/summary`],
    enabled: !!clientId,
  });

  const { data: topics } = useQuery<Topic[]>({
    queryKey: [`/api/socialsync/clients/${clientId}/topics`],
    enabled: !!clientId,
  });

  const { data: posts } = useQuery<Post[]>({
    queryKey: [`/api/socialsync/clients/${clientId}/posts`],
    enabled: !!clientId,
  });

  const { data: queue } = useQuery<QueueItem[]>({
    queryKey: [`/api/socialsync/clients/${clientId}/queue`],
    enabled: !!clientId,
  });

  const { data: activity } = useQuery<ActivityLog[]>({
    queryKey: [`/api/socialsync/clients/${clientId}/activity`],
    enabled: !!clientId,
  });

  // ─── Mutations ───

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: [`/api/socialsync/clients/${clientId}/summary`] });
    queryClient.invalidateQueries({ queryKey: [`/api/socialsync/clients/${clientId}/topics`] });
    queryClient.invalidateQueries({ queryKey: [`/api/socialsync/clients/${clientId}/posts`] });
    queryClient.invalidateQueries({ queryKey: [`/api/socialsync/clients/${clientId}/queue`] });
    queryClient.invalidateQueries({ queryKey: [`/api/socialsync/clients/${clientId}/activity`] });
  }

  const saveProfile = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", `/api/socialsync/clients/${clientId}/profile`, data);
      return res.json();
    },
    onSuccess: () => { invalidateAll(); setEditingProfile(false); toast({ title: "Profile saved" }); },
  });

  const toggleEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PUT", `/api/socialsync/clients/${clientId}/profile`, { ...summary?.profile, enabled, client_id: clientId });
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "SocialSync toggled" }); },
  });

  const toggleAutopilot = useMutation({
    mutationFn: async (autopilot: boolean) => {
      const res = await apiRequest("PUT", `/api/socialsync/clients/${clientId}/profile`, { ...summary?.profile, autopilot, client_id: clientId });
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Autopilot toggled" }); },
  });

  const generateWeek = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/socialsync/clients/${clientId}/generate-week`);
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateAll();
      toast({ title: "Week generated", description: `${data.posts_generated} posts created, ${data.posts_queued} queued` });
    },
    onError: () => toast({ title: "Generation failed", variant: "destructive" }),
  });

  const updateTopicStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/socialsync/topics/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Topic updated" }); },
  });

  const updatePostStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/socialsync/posts/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Post updated" }); },
  });

  const regeneratePost = useMutation({
    mutationFn: async (postId: number) => {
      const res = await apiRequest("POST", `/api/socialsync/posts/${postId}/regenerate`);
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Post regenerated" }); },
    onError: () => toast({ title: "Regeneration failed", variant: "destructive" }),
  });

  const retryQueue = useMutation({
    mutationFn: async (queueId: number) => {
      const res = await apiRequest("POST", `/api/socialsync/queue/${queueId}/retry`);
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Queue item retried" }); },
  });

  const enqueuePost = useMutation({
    mutationFn: async (postId: number) => {
      const res = await apiRequest("POST", `/api/socialsync/clients/${clientId}/posts/${postId}/enqueue`);
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Post enqueued" }); },
  });

  // ─── Render ───

  const profile = summary?.profile;
  const stats = summary?.stats;

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-gray-400">Loading SocialSync...</div>;
  }

  // ─── No profile state ───
  if (!profile) {
    return (
      <Card className="p-6 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
        <p className="text-sm text-gray-600">No SocialSync profile configured for this client.</p>
        <Button
          size="sm"
          className="bg-[#2D6A4F] hover:bg-[#1B4332]"
          onClick={() => {
            setEditingProfile(true);
            setProfileForm({ niche: "", location: "", services: "", tone: "professional", frequency: "3_per_week", service_focus: "", platform_preferences: "facebook,instagram" });
          }}
        >
          Create Profile
        </Button>
        {editingProfile && <ProfileEditor profileForm={profileForm} setProfileForm={setProfileForm} onSave={(data) => saveProfile.mutate(data)} onCancel={() => setEditingProfile(false)} isPending={saveProfile.isPending} clientId={clientId} />}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Controls Card ─── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">SocialSync Controls</h3>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => {
              setEditingProfile(true);
              setProfileForm({
                niche: profile.niche || "",
                location: profile.location || "",
                services: (profile.services || []).join(", "),
                tone: profile.tone || "professional",
                frequency: profile.frequency || "3_per_week",
                service_focus: (profile.service_focus || []).join(", "),
                platform_preferences: (profile.platform_preferences || []).join(", "),
              });
            }}>Edit Profile</Button>
            <Button size="sm" className="bg-[#2D6A4F] hover:bg-[#1B4332]" onClick={() => generateWeek.mutate()} disabled={generateWeek.isPending || !profile.enabled}>
              {generateWeek.isPending ? <><RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> Generating...</> : <><Zap className="w-3.5 h-3.5 mr-1" /> Generate Week</>}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
            <span className="text-gray-600">Enabled</span>
            <Switch checked={profile.enabled} onCheckedChange={(v) => toggleEnabled.mutate(v)} />
          </div>
          <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
            <span className="text-gray-600">Autopilot</span>
            <Switch checked={profile.autopilot} onCheckedChange={(v) => toggleAutopilot.mutate(v)} />
          </div>
          <div className="p-2 bg-gray-50 rounded-lg">
            <span className="text-gray-600 text-xs">Tone</span>
            <p className="font-medium capitalize">{profile.tone || "professional"}</p>
          </div>
          <div className="p-2 bg-gray-50 rounded-lg">
            <span className="text-gray-600 text-xs">Frequency</span>
            <p className="font-medium">{(profile.frequency || "3_per_week").replace(/_/g, " ")}</p>
          </div>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-3 pt-3 border-t border-gray-100">
            <StatBox label="Active Topics" value={stats.active_topics} />
            <StatBox label="Queued" value={stats.queued_posts} color="amber" />
            <StatBox label="Published" value={stats.published_posts} color="emerald" />
            <StatBox label="Failed" value={stats.failed_posts} color="red" />
            <StatBox label="Queue Pending" value={stats.pending_queue} color="amber" />
            <StatBox label="Queue Failed" value={stats.failed_queue} color="red" />
          </div>
        )}

        {/* Operational warnings */}
        <div className="mt-3 space-y-1">
          {!profile.enabled && <WarningBanner text="SocialSync is disabled. Enable it to start generating content." />}
          {profile.enabled && !profile.autopilot && <WarningBanner text="Autopilot is off. Content will only be generated manually." />}
          {stats && stats.failed_queue > 0 && <WarningBanner text={`${stats.failed_queue} queue item(s) failed. Review and retry below.`} />}
          {summary?.next_scheduled && <InfoBanner text={`Next scheduled: ${summary.next_scheduled.platform} on ${fmtDate(summary.next_scheduled.scheduled_for)}`} />}
          {summary?.last_generation && <InfoBanner text={`Last generation: ${fmtDate(summary.last_generation.created_at)}`} />}
        </div>
      </Card>

      {/* ─── Data Tabs ─── */}
      <Tabs defaultValue="posts">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="posts">Posts ({posts?.length || 0})</TabsTrigger>
          <TabsTrigger value="topics">Topics ({topics?.length || 0})</TabsTrigger>
          <TabsTrigger value="queue">Queue ({queue?.length || 0})</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* Posts */}
        <TabsContent value="posts" className="mt-3">
          <Card>
            {posts && posts.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {posts.slice(0, 30).map((p) => (
                  <div key={p.id} className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={p.status} />
                        <span className="text-xs font-medium text-gray-500 capitalize">{p.platform}</span>
                        {p.quality_score != null && <span className="text-xs text-gray-400">Q:{p.quality_score}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {p.status === "draft" && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updatePostStatus.mutate({ id: p.id, status: "ready" })}>
                            Mark Ready
                          </Button>
                        )}
                        {p.status === "ready" && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => enqueuePost.mutate(p.id)}>
                            <Play className="w-3 h-3 mr-1" /> Enqueue
                          </Button>
                        )}
                        {["draft", "ready", "failed"].includes(p.status) && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => regeneratePost.mutate(p.id)} disabled={regeneratePost.isPending}>
                            <RotateCcw className="w-3 h-3 mr-1" /> Regen
                          </Button>
                        )}
                        {["draft", "ready"].includes(p.status) && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => updatePostStatus.mutate({ id: p.id, status: "cancelled" })}>
                            <XCircle className="w-3 h-3 mr-1" /> Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-800 line-clamp-2">{p.post_text}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      {p.scheduled_for && <span><Calendar className="w-3 h-3 inline mr-0.5" />{fmtDate(p.scheduled_for)}</span>}
                      {p.hashtags && (p.hashtags as string[]).length > 0 && <span>#{(p.hashtags as string[]).slice(0, 3).join(" #")}</span>}
                      {p.failure_reason && <span className="text-red-500">{p.failure_reason.slice(0, 60)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-6">No posts yet. Generate a week of content to get started.</p>
            )}
          </Card>
        </TabsContent>

        {/* Topics */}
        <TabsContent value="topics" className="mt-3">
          <Card>
            {topics && topics.length > 0 ? (
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topics.slice(0, 30).map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-sm max-w-xs truncate">{t.title}</TableCell>
                        <TableCell className="text-xs capitalize">{t.type.replace(/_/g, " ")}</TableCell>
                        <TableCell className="text-xs">{t.target_service || "—"}</TableCell>
                        <TableCell><StatusBadge status={t.status} /></TableCell>
                        <TableCell>
                          {t.status === "active" && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updateTopicStatus.mutate({ id: t.id, status: "archived" })}>Archive</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => updateTopicStatus.mutate({ id: t.id, status: "rejected" })}>Reject</Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-6">No topics yet.</p>
            )}
            {/* Mobile fallback */}
            {topics && topics.length > 0 && (
              <div className="md:hidden divide-y divide-gray-100">
                {topics.slice(0, 20).map((t) => (
                  <div key={t.id} className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <StatusBadge status={t.status} />
                      <span className="text-xs capitalize text-gray-500">{t.type.replace(/_/g, " ")}</span>
                    </div>
                    <p className="text-sm text-gray-800 line-clamp-2">{t.title}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Queue */}
        <TabsContent value="queue" className="mt-3">
          <Card>
            {queue && queue.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {queue.slice(0, 30).map((q) => (
                  <div key={q.id} className="p-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <StatusBadge status={q.status} />
                        <span className="text-xs font-medium text-gray-500 capitalize">{q.platform}</span>
                        <span className="text-xs text-gray-400">Post #{q.post_id}</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        Run at: {fmtDate(q.run_at)} | Attempts: {q.attempts}/{q.max_attempts}
                        {q.last_error && <span className="text-red-500 ml-2">{q.last_error.slice(0, 50)}</span>}
                        {q.worker_note && <span className="text-blue-500 ml-2">{q.worker_note.slice(0, 50)}</span>}
                      </div>
                    </div>
                    {q.status === "failed" && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => retryQueue.mutate(q.id)}>
                        <RotateCcw className="w-3 h-3 mr-1" /> Retry
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-6">No queue items.</p>
            )}
          </Card>
        </TabsContent>

        {/* Activity Logs */}
        <TabsContent value="logs" className="mt-3">
          <Card>
            {activity && activity.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {activity.slice(0, 30).map((log) => (
                  <div key={log.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700">{log.action}</span>
                        {log.status && <StatusBadge status={log.status} />}
                      </div>
                      <span className="text-xs text-gray-400">{fmtDate(log.created_at)}</span>
                    </div>
                    {log.details && typeof log.details === "object" && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{JSON.stringify(log.details).slice(0, 120)}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-6">No activity yet.</p>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Profile Editor Dialog (inline) */}
      {editingProfile && (
        <ProfileEditor
          profileForm={profileForm}
          setProfileForm={setProfileForm}
          onSave={(data) => saveProfile.mutate(data)}
          onCancel={() => setEditingProfile(false)}
          isPending={saveProfile.isPending}
          clientId={clientId}
        />
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorClass = color === "emerald" ? "text-emerald-700" : color === "red" ? "text-red-600" : color === "amber" ? "text-amber-700" : "text-gray-900";
  return (
    <div className="text-center p-2 bg-gray-50 rounded-lg">
      <p className={`text-lg font-semibold ${colorClass}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function WarningBanner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg text-xs text-amber-800">
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
      {text}
    </div>
  );
}

function InfoBanner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-800">
      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
      {text}
    </div>
  );
}

function ProfileEditor({
  profileForm, setProfileForm, onSave, onCancel, isPending, clientId,
}: {
  profileForm: any;
  setProfileForm: (v: any) => void;
  onSave: (data: any) => void;
  onCancel: () => void;
  isPending: boolean;
  clientId: number;
}) {
  const handleSave = () => {
    onSave({
      client_id: clientId,
      enabled: true,
      niche: profileForm.niche || null,
      location: profileForm.location || null,
      services: profileForm.services ? profileForm.services.split(",").map((s: string) => s.trim()).filter(Boolean) : null,
      tone: profileForm.tone,
      frequency: profileForm.frequency,
      autopilot: false,
      service_focus: profileForm.service_focus ? profileForm.service_focus.split(",").map((s: string) => s.trim()).filter(Boolean) : null,
      platform_preferences: profileForm.platform_preferences ? profileForm.platform_preferences.split(",").map((s: string) => s.trim()).filter(Boolean) : ["facebook", "instagram"],
    });
  };

  return (
    <Card className="p-4 mt-3 border-blue-200 bg-blue-50/30">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Edit SocialSync Profile</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600">Niche / Trade</label>
          <Input value={profileForm.niche} onChange={(e) => setProfileForm({ ...profileForm, niche: e.target.value })} placeholder="e.g. plumbing, HVAC, roofing" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Service Area / Location</label>
          <Input value={profileForm.location} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} placeholder="e.g. Denver, CO" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Services (comma-separated)</label>
          <Input value={profileForm.services} onChange={(e) => setProfileForm({ ...profileForm, services: e.target.value })} placeholder="e.g. drain cleaning, water heater repair" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Service Focus (comma-separated)</label>
          <Input value={profileForm.service_focus} onChange={(e) => setProfileForm({ ...profileForm, service_focus: e.target.value })} placeholder="e.g. emergency plumbing, leak repair" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Tone</label>
          <Select value={profileForm.tone} onValueChange={(v) => setProfileForm({ ...profileForm, tone: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TONES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Posting Frequency</label>
          <Select value={profileForm.frequency} onValueChange={(v) => setProfileForm({ ...profileForm, frequency: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-gray-600">Platforms (comma-separated)</label>
          <Input value={profileForm.platform_preferences} onChange={(e) => setProfileForm({ ...profileForm, platform_preferences: e.target.value })} placeholder="facebook, instagram, google_business, linkedin" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="bg-[#2D6A4F] hover:bg-[#1B4332]" onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving..." : "Save Profile"}
        </Button>
      </div>
    </Card>
  );
}
