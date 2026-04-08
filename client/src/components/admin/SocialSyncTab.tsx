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
import { RefreshCw, Play, XCircle, RotateCcw, Calendar, Zap, AlertTriangle, Link2, CheckCircle, ExternalLink } from "lucide-react";
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

interface FacebookStatus {
  connected: boolean;
  status: string;
  external_account_id: string | null;
  external_page_id: string | null;
  user_name: string | null;
  selected_page: { id: string; name: string; category: string | null } | null;
  pages_count: number;
  token_expires_at: string | null;
  last_validated_at: string | null;
  last_error: string | null;
}

interface FacebookPages {
  pages: { id: string; name: string; category: string | null }[];
  selected_page: { id: string; name: string } | null;
  external_page_id: string | null;
}

interface InstagramStatus {
  connected: boolean;
  status: string;
  account_id: string | null;
  username: string | null;
  name: string | null;
  profile_picture_url: string | null;
  followers_count: number | null;
  facebook_page_id: string | null;
  facebook_page_name: string | null;
  token_expires_at: string | null;
  last_validated_at: string | null;
  last_error: string | null;
}

interface InstagramAccounts {
  accounts: {
    id: string;
    username: string | null;
    name: string | null;
    followers_count: number | null;
    facebook_page_id: string;
    facebook_page_name: string;
  }[];
  selected_account_id: string | null;
  connection_status: string;
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

  const { data: fbStatus } = useQuery<FacebookStatus>({
    queryKey: [`/api/socialsync/clients/${clientId}/facebook/status`],
    enabled: !!clientId,
  });

  const { data: fbPages } = useQuery<FacebookPages>({
    queryKey: [`/api/socialsync/clients/${clientId}/facebook/pages`],
    enabled: !!clientId && fbStatus?.connected === true,
  });

  const { data: igStatus } = useQuery<InstagramStatus>({
    queryKey: [`/api/socialsync/clients/${clientId}/instagram/status`],
    enabled: !!clientId,
  });

  const { data: igAccounts } = useQuery<InstagramAccounts>({
    queryKey: [`/api/socialsync/clients/${clientId}/instagram/accounts`],
    enabled: !!clientId && fbStatus?.connected === true,
  });

  // ─── Mutations ───

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: [`/api/socialsync/clients/${clientId}/summary`] });
    queryClient.invalidateQueries({ queryKey: [`/api/socialsync/clients/${clientId}/topics`] });
    queryClient.invalidateQueries({ queryKey: [`/api/socialsync/clients/${clientId}/posts`] });
    queryClient.invalidateQueries({ queryKey: [`/api/socialsync/clients/${clientId}/queue`] });
    queryClient.invalidateQueries({ queryKey: [`/api/socialsync/clients/${clientId}/activity`] });
    queryClient.invalidateQueries({ queryKey: [`/api/socialsync/clients/${clientId}/facebook/status`] });
    queryClient.invalidateQueries({ queryKey: [`/api/socialsync/clients/${clientId}/facebook/pages`] });
    queryClient.invalidateQueries({ queryKey: [`/api/socialsync/clients/${clientId}/instagram/status`] });
    queryClient.invalidateQueries({ queryKey: [`/api/socialsync/clients/${clientId}/instagram/accounts`] });
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

  const connectFacebook = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", `/api/socialsync/clients/${clientId}/facebook/connect-url`);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) window.open(data.url, "_self");
    },
    onError: () => toast({ title: "Facebook not configured", description: "Check server environment variables.", variant: "destructive" }),
  });

  const selectFbPage = useMutation({
    mutationFn: async (pageId: string) => {
      const res = await apiRequest("POST", `/api/socialsync/clients/${clientId}/facebook/select-page`, { page_id: pageId });
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Facebook page selected" }); },
  });

  const validateFb = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/socialsync/clients/${clientId}/facebook/validate`);
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateAll();
      toast({ title: data.valid ? "Connection valid" : "Connection invalid", description: data.error || undefined, variant: data.valid ? "default" : "destructive" });
    },
  });

  const selectIgAccount = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await apiRequest("POST", `/api/socialsync/clients/${clientId}/instagram/select-account`, { account_id: accountId });
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Instagram account selected" }); },
  });

  const validateIg = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/socialsync/clients/${clientId}/instagram/validate`);
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateAll();
      toast({ title: data.valid ? "Instagram valid" : "Instagram invalid", description: data.error || undefined, variant: data.valid ? "default" : "destructive" });
    },
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

      {/* ─── Facebook Connection Card ─── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Facebook Connection</h3>
          <div className="flex items-center gap-2">
            {fbStatus?.connected && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => validateFb.mutate()} disabled={validateFb.isPending}>
                {validateFb.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <><CheckCircle className="w-3 h-3 mr-1" /> Validate</>}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => connectFacebook.mutate()} disabled={connectFacebook.isPending}>
              {connectFacebook.isPending ? "Redirecting..." : fbStatus?.connected ? "Reconnect" : <><Link2 className="w-3.5 h-3.5 mr-1" /> Connect Facebook</>}
            </Button>
          </div>
        </div>

        {!fbStatus || fbStatus.status === "not_connected" ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">No Facebook account connected. Click "Connect Facebook" to begin.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Status row */}
            <div className="flex items-center gap-3 text-sm">
              <StatusBadge status={fbStatus.status} />
              {fbStatus.user_name && <span className="text-gray-700">Account: <strong>{fbStatus.user_name}</strong></span>}
              {fbStatus.pages_count > 0 && <span className="text-gray-500">{fbStatus.pages_count} page(s) found</span>}
            </div>

            {/* Selected page */}
            {fbStatus.selected_page ? (
              <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg text-sm">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-800">Publishing to: <strong>{fbStatus.selected_page.name}</strong></span>
                {fbStatus.selected_page.category && <span className="text-emerald-600 text-xs">({fbStatus.selected_page.category})</span>}
              </div>
            ) : fbStatus.connected && (
              <WarningBanner text="No page selected. Select a page below to enable publishing." />
            )}

            {/* Page picker */}
            {fbStatus.connected && fbPages && fbPages.pages.length > 0 && (
              <div className="pt-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Select Publishing Page</label>
                <div className="space-y-1">
                  {fbPages.pages.map((page) => (
                    <div key={page.id} className={`flex items-center justify-between p-2 rounded-lg border ${fbPages.external_page_id === page.id ? "border-emerald-300 bg-emerald-50" : "border-gray-200"}`}>
                      <div>
                        <span className="text-sm font-medium">{page.name}</span>
                        {page.category && <span className="text-xs text-gray-500 ml-2">{page.category}</span>}
                      </div>
                      {fbPages.external_page_id !== page.id && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => selectFbPage.mutate(page.id)} disabled={selectFbPage.isPending}>
                          Select
                        </Button>
                      )}
                      {fbPages.external_page_id === page.id && (
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs">Active</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error / Expiry warnings */}
            {fbStatus.status === "error" && fbStatus.last_error && (
              <WarningBanner text={`Error: ${fbStatus.last_error}`} />
            )}
            {fbStatus.status === "expired" && (
              <WarningBanner text="Token expired. Click Reconnect to re-authorize." />
            )}
            {fbStatus.last_validated_at && (
              <p className="text-xs text-gray-400">Last validated: {fmtDate(fbStatus.last_validated_at)}</p>
            )}
            {fbStatus.token_expires_at && (
              <p className="text-xs text-gray-400">Token expires: {fmtDate(fbStatus.token_expires_at)}</p>
            )}
          </div>
        )}
      </Card>

      {/* ─── Instagram Connection Card ─── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Instagram Connection</h3>
          {igStatus?.connected && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => validateIg.mutate()} disabled={validateIg.isPending}>
              {validateIg.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <><CheckCircle className="w-3 h-3 mr-1" /> Validate</>}
            </Button>
          )}
        </div>

        {!fbStatus?.connected ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">Connect Facebook first — Instagram uses the same Meta authorization.</p>
          </div>
        ) : !igAccounts || igAccounts.accounts.length === 0 ? (
          <div className="text-center py-4 space-y-1">
            <p className="text-sm text-gray-500">No Instagram business/professional accounts found.</p>
            <p className="text-xs text-gray-400">Instagram publishing requires a business or professional account linked to a Facebook page.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Current selection */}
            {igStatus?.connected && igStatus.username && (
              <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg text-sm">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-800">Publishing to: <strong>@{igStatus.username}</strong></span>
                {igStatus.followers_count != null && <span className="text-emerald-600 text-xs">({igStatus.followers_count.toLocaleString()} followers)</span>}
                {igStatus.facebook_page_name && <span className="text-emerald-600 text-xs">via {igStatus.facebook_page_name}</span>}
              </div>
            )}

            {/* Account picker */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 block">Available Instagram Accounts</label>
              {igAccounts.accounts.map((acc) => (
                <div key={acc.id} className={`flex items-center justify-between p-2 rounded-lg border ${igAccounts.selected_account_id === acc.id ? "border-emerald-300 bg-emerald-50" : "border-gray-200"}`}>
                  <div>
                    <span className="text-sm font-medium">{acc.username ? `@${acc.username}` : acc.name || acc.id}</span>
                    {acc.followers_count != null && <span className="text-xs text-gray-500 ml-2">{acc.followers_count.toLocaleString()} followers</span>}
                    <span className="text-xs text-gray-400 ml-2">via {acc.facebook_page_name}</span>
                  </div>
                  {igAccounts.selected_account_id !== acc.id ? (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => selectIgAccount.mutate(acc.id)} disabled={selectIgAccount.isPending}>
                      Select
                    </Button>
                  ) : (
                    <Badge className="bg-emerald-100 text-emerald-700 text-xs">Active</Badge>
                  )}
                </div>
              ))}
            </div>

            {/* Error / Expiry */}
            {igStatus?.status === "error" && igStatus.last_error && (
              <WarningBanner text={`Error: ${igStatus.last_error}`} />
            )}
            {igStatus?.status === "expired" && (
              <WarningBanner text="Token expired. Reconnect Meta/Facebook to refresh." />
            )}
            {igStatus?.last_validated_at && (
              <p className="text-xs text-gray-400">Last validated: {fmtDate(igStatus.last_validated_at)}</p>
            )}
          </div>
        )}
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
