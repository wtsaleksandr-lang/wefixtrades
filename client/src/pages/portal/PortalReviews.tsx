import { usePageTitle } from "@/hooks/usePageTitle";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCopilotForm } from "@/context/CopilotFormContext";
import PortalLayout from "@/components/portal/PortalLayout";
import UpsellCard from "@/components/portal/UpsellCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Star, StarHalf, TrendingUp, MessageSquare, Send, ShieldCheck, AlertTriangle,
  ChevronDown, ChevronUp, Loader2, RefreshCw, ThumbsDown, Settings, Lock, Code,
  QrCode, UserPlus, CheckCircle2, Unplug, ExternalLink, PauseCircle, PlayCircle,
  CheckCircle, XCircle, MessageSquareWarning, Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SmsConsentDisclosure } from "@/components/forms/SmsConsentDisclosure";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

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

interface ConfigData {
  active: boolean;
  tier: string | null;
  tierLabel: string | null;
  features: Record<string, boolean>;
  settings: {
    channel_preference: string;
    reminders_enabled: boolean;
    review_request_delay_hours: number;
    low_rating_alerts: boolean;
  } | null;
  upgradeHints: Record<string, string>;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function RatingStars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.5;
  return (
    <div role="img" aria-label={`${rating} out of 5 stars`} className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => {
        if (s <= full) {
          return <Star key={s} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />;
        }
        if (s === full + 1 && hasHalf) {
          return <StarHalf key={s} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />;
        }
        return <Star key={s} className="w-3.5 h-3.5 text-gray-200" />;
      })}
    </div>
  );
}

function MetricCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <Card className="h-full p-4">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          {sub && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

function UpgradeBanner({ feature, hint }: { feature: string; hint: string }) {
  return (
    <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground">
      <Lock className="w-3.5 h-3.5 shrink-0" />
      <span>{feature} — <span className="font-medium text-foreground">{hint}</span></span>
    </div>
  );
}

interface PendingReplyItem {
  id: number;
  title: string | null;
  body: string | null;
  status: string;
  metadata: {
    gbp?: {
      external_review_id?: string | null;
      star_rating?: number | null;
      posted_at?: string | null;
      queue_status?: string | null;
    };
    client_review?: {
      state?: string | null;
      note?: string | null;
      decided_at?: string | null;
    };
  };
  created_at: string;
  updated_at: string;
}

export default function PortalReviews() {
  usePageTitle("Reviews");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expandedReview, setExpandedReview] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestForm, setRequestForm] = useState({ customer_name: "", customer_email: "", customer_phone: "", job_label: "" });
  const [requestSent, setRequestSent] = useState(false);
  const [changesNoteId, setChangesNoteId] = useState<number | null>(null);
  const [changesNote, setChangesNote] = useState("");
  const [showPendingReplies, setShowPendingReplies] = useState(true);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  // Config / tier
  const { data: config } = useQuery<ConfigData>({
    queryKey: ["/api/portal/reputation/config"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/config", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  // Automation status (for pause toggle)
  const { data: automationStatus } = useQuery<{ all_automation_paused: boolean; reputationshield_auto_reply_paused: boolean }>({
    queryKey: ["/api/portal/automation-status"],
  });

  const autoReplyPauseMutation = useMutation({
    mutationFn: async (paused: boolean) => {
      const res = await apiRequest("PATCH", "/api/portal/reputation/auto-reply-settings", { auto_reply_paused: paused });
      return res.json();
    },
    onSuccess: (_data, paused) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/automation-status"] });
      toast({ title: paused ? "Auto-replies paused" : "Auto-replies resumed" });
    },
    onError: () => {
      toast({ title: "Failed to update setting", variant: "destructive" });
    },
  });

  const isAutoReplyPaused = automationStatus?.reputationshield_auto_reply_paused || automationStatus?.all_automation_paused || false;

  // Pending review replies
  const { data: pendingRepliesData, isLoading: loadingPendingReplies } = useQuery<{ replies: PendingReplyItem[]; count: number }>({
    queryKey: ["/api/portal/review-replies/pending"],
    queryFn: async () => {
      const res = await fetch("/api/portal/review-replies/pending", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!config?.active,
  });

  const replyActionMutation = useMutation({
    mutationFn: async ({ id, action, note }: { id: number; action: "approve" | "reject" | "request-changes"; note?: string }) => {
      const res = await apiRequest("POST", `/api/portal/review-replies/${id}/${action}`, note ? { note } : undefined);
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/review-replies/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/review-replies"] });
      const actionLabels: Record<string, string> = { approve: "Reply approved", reject: "Reply rejected", "request-changes": "Changes requested" };
      toast({ title: actionLabels[vars.action] || "Action completed" });
      setChangesNoteId(null);
      setChangesNote("");
    },
    onError: () => {
      toast({ title: "Action failed. Please try again.", variant: "destructive" });
    },
  });

  const pendingReplies = pendingRepliesData?.replies ?? [];

  // Overview metrics
  const { data: overview, isLoading: loadingOverview, error: overviewError, refetch: refetchOverview } = useQuery<OverviewData>({
    queryKey: ["/api/portal/reputation/overview"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/overview", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  // Reviews
  const { data: reviewsData, isLoading: loadingReviews } = useQuery<{ data: ReviewItem[]; total: number }>({
    queryKey: ["/api/portal/reputation/reviews"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/reviews?limit=20", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  // Feedback (lazy)
  const { data: feedbackData, isLoading: loadingFeedback } = useQuery<{ data: FeedbackItem[] }>({
    queryKey: ["/api/portal/reputation/feedback"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/feedback", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: showFeedback,
  });

  // Settings mutation
  const settingsMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const res = await apiRequest("PATCH", "/api/portal/reputation/settings", updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/reputation/config"] });
      toast({ title: "Settings saved" });
    },
  });

  const requestMutation = useMutation({
    mutationFn: async (data: typeof requestForm) => {
      const res = await apiRequest("POST", "/api/portal/reputation/request-review", data);
      return res.json();
    },
    onSuccess: () => {
      setRequestSent(true);
      setRequestForm({ customer_name: "", customer_email: "", customer_phone: "", job_label: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/reputation/overview"] });
      setTimeout(() => setRequestSent(false), 5000);
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message || "Could not send review request" });
    },
  });

  const { data: qrData } = useQuery<{ qrUrl: string; widgetToken: string }>({
    queryKey: ["/api/portal/reputation/qr"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/qr", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!config?.active,
  });

  const { data: requestStats } = useQuery<{ total: number; job_complete: number; portal_manual: number; admin_manual: number; qr_scan: number }>({
    queryKey: ["/api/portal/reputation/request-stats"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/request-stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!config?.active,
  });

  // Google connection
  const { data: googleStatus } = useQuery<{ oauthConfigured: boolean; connected: boolean; connectedAt: string | null; needsReconnect: boolean }>({
    queryKey: ["/api/portal/reputation/google-status"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/google-status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!config?.active,
  });

  const googleConnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/reputation/google-connect", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      if (data.authUrl) window.location.href = data.authUrl;
    },
  });

  const googleDisconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/portal/reputation/google-disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/reputation/google-status"] });
      toast({ title: "Google disconnected" });
    },
  });

  const reviews = reviewsData?.data ?? [];
  const feedback = feedbackData?.data ?? [];
  const rv = overview?.reviews;
  const rq = overview?.requests;
  const tier = config?.tier;
  const features = config?.features ?? {};
  const settings = config?.settings;
  const upgradeHints = config?.upgradeHints ?? {};

  /* Phase 1c: register the manual "Request a Review" form with the copilot.
   * (This page has no review-response draft state — responses are AI-drafted
   * server-side; the only editable form here is the customer request form.)
   * Enabled only while the request form is open and not yet sent. */
  useCopilotForm({
    formLabel: "Request a review",
    fields: [
      { key: "customer_name", label: "Customer name", required: true },
      { key: "customer_email", label: "Customer email" },
      { key: "customer_phone", label: "Customer phone" },
      { key: "job_label", label: "Job description (optional)" },
    ],
    values: requestForm as unknown as Record<string, unknown>,
    onApply: (fills) => {
      const allowed = new Set(["customer_name", "customer_email", "customer_phone", "job_label"]);
      setRequestForm((prev) => {
        const next = { ...prev };
        for (const f of fills) {
          if (allowed.has(f.field_key)) (next as any)[f.field_key] = f.value;
        }
        return next;
      });
    },
    enabled: showRequestForm && !requestSent,
  });

  // No active service
  if (config && !config.active) {
    return (
      <PortalLayout>
        <div className="py-12 text-center space-y-4">
          <ShieldCheck className="w-12 h-12 text-muted-foreground/50 mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">ReputationShield</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Protect and grow your online reputation with automated review requests,
            monitoring, and AI-powered response drafting.
          </p>
          <Button className="bg-brand-blue hover:bg-brand-blue-600" onClick={() => window.open("/products/reputationshield", "_blank")}>
            Learn More
          </Button>
        </div>
      </PortalLayout>
    );
  }

  if (overviewError) {
    return (
      <PortalLayout>
        <div className="py-12 text-center">
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">Your Reviews</h2>
              {config?.tierLabel && (
                <Badge variant="secondary" className="text-[10px] bg-[#EEF3FF] text-brand-blue">
                  {config.tierLabel}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">How customers see your business online</p>
          </div>
          <div className="flex gap-2">
            <Link href="/portal/reviews/setup">
              <Button variant="outline" size="sm" className="h-8">
                <Sparkles className="w-3.5 h-3.5 mr-1" /> Setup
              </Button>
            </Link>
            <Link href="/portal/reviews/competitors">
              <Button variant="outline" size="sm" className="h-8">
                <TrendingUp className="w-3.5 h-3.5 mr-1" /> Competitors
              </Button>
            </Link>
            <Link href="/portal/reviews/widget">
              <Button variant="outline" size="sm" className="h-8">
                <Code className="w-3.5 h-3.5 mr-1" /> Widget
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="w-3.5 h-3.5 mr-1" /> Settings
            </Button>
          </div>
        </div>

        {/* Settings panel (collapsible) */}
        {showSettings && settings && (
          <Card className="p-4 space-y-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Review Request Settings</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Preferred Channel</label>
                <Select
                  value={settings.channel_preference}
                  onValueChange={(v) => settingsMutation.mutate({ channel_preference: v })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="auto">Auto (email preferred)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Delay After Job Completion</label>
                <Select
                  value={String(settings.review_request_delay_hours)}
                  onValueChange={(v) => settingsMutation.mutate({ review_request_delay_hours: parseInt(v) })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Immediately</SelectItem>
                    <SelectItem value="1">1 hour</SelectItem>
                    <SelectItem value="2">2 hours</SelectItem>
                    <SelectItem value="4">4 hours</SelectItem>
                    <SelectItem value="24">1 day</SelectItem>
                    <SelectItem value="48">2 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between sm:col-span-2">
                <div>
                  <p className="text-sm text-foreground">Follow-up Reminders</p>
                  <p className="text-xs text-muted-foreground/70">Automatically send gentle reminders if customers haven't responded</p>
                </div>
                <button
                  className={`relative w-10 h-6 rounded-full transition-colors ${settings.reminders_enabled ? "bg-brand-blue" : "bg-input"}`}
                  onClick={() => settingsMutation.mutate({ reminders_enabled: !settings.reminders_enabled })}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform ${settings.reminders_enabled ? "left-[18px]" : "left-0.5"}`} />
                </button>
              </div>
              <div className="flex items-center justify-between sm:col-span-2">
                <div>
                  <p className="text-sm text-foreground">Low-Rating Alerts</p>
                  <p className="text-xs text-muted-foreground/70">Get notified when a 1 or 2 star review is detected</p>
                </div>
                <button
                  className={`relative w-10 h-6 rounded-full transition-colors ${settings.low_rating_alerts ? "bg-brand-blue" : "bg-input"}`}
                  onClick={() => settingsMutation.mutate({ low_rating_alerts: !settings.low_rating_alerts })}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform ${settings.low_rating_alerts ? "left-[18px]" : "left-0.5"}`} />
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* Pause Auto-Replies Toggle */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isAutoReplyPaused ? (
                <PauseCircle className="w-5 h-5 text-amber-500" />
              ) : (
                <PlayCircle className="w-5 h-5 text-emerald-500" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">Auto-Replies</p>
                <p className="text-xs text-muted-foreground">{isAutoReplyPaused ? "Paused" : "Active"}</p>
              </div>
            </div>
            <Switch
              checked={!isAutoReplyPaused}
              onCheckedChange={(checked) => autoReplyPauseMutation.mutate(!checked)}
              disabled={autoReplyPauseMutation.isPending || automationStatus?.all_automation_paused}
              className="data-[state=checked]:bg-brand-blue"
            />
          </div>
          {isAutoReplyPaused && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-700">
                {automationStatus?.all_automation_paused
                  ? "All automation is paused from your account settings. Resume from Settings to re-enable auto-replies."
                  : "Auto-replies are paused. AI-drafted responses will not be posted until you resume."}
              </p>
            </div>
          )}
        </Card>

        {/* Pending Review Replies */}
        {pendingReplies.length > 0 && (
          <div>
            <button
              className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3 hover:text-foreground"
              onClick={() => setShowPendingReplies(!showPendingReplies)}
            >
              <MessageSquareWarning className="w-4 h-4 text-amber-500" />
              Pending Reply Approvals
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                {pendingReplies.length}
              </span>
              {showPendingReplies ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showPendingReplies && (
              <div className="space-y-3">
                {pendingReplies.map((reply) => {
                  const gbp = reply.metadata?.gbp;
                  const starRating = gbp?.star_rating ?? null;
                  const isRequestingChanges = changesNoteId === reply.id;
                  const isBusy = replyActionMutation.isPending;
                  return (
                    <Card key={reply.id} className="p-4 border-amber-100">
                      {/* Original review info */}
                      {starRating !== null && (
                        <div className="flex items-center gap-2 mb-2">
                          <RatingStars rating={starRating} />
                          <span className="text-xs text-muted-foreground">
                            {reply.title || "Customer Review"}
                          </span>
                        </div>
                      )}
                      {!starRating && reply.title && (
                        <p className="text-xs font-medium text-muted-foreground mb-2">{reply.title}</p>
                      )}

                      {/* AI-drafted reply */}
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3">
                        <p className="text-[11px] text-blue-500 mb-1 font-medium">AI-Drafted Reply</p>
                        <p className="text-sm text-blue-900 whitespace-pre-wrap">{reply.body}</p>
                      </div>

                      {/* Request Changes textarea */}
                      {isRequestingChanges && (
                        <div className="mb-3 space-y-2">
                          <Textarea
                            placeholder="Describe what you'd like changed..."
                            value={changesNote}
                            onChange={(e) => setChangesNote(e.target.value)}
                            className="text-sm min-h-[80px]"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-amber-500 hover:bg-amber-600 text-white text-xs"
                              disabled={isBusy || !changesNote.trim()}
                              onClick={() => replyActionMutation.mutate({ id: reply.id, action: "request-changes", note: changesNote.trim() })}
                            >
                              {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              Submit Feedback
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs"
                              onClick={() => { setChangesNoteId(null); setChangesNote(""); }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      {!isRequestingChanges && (
                        <div className="flex items-center gap-2 pt-2 border-t border-border">
                          <Button
                            size="sm"
                            className="bg-brand-blue hover:bg-brand-blue-600 text-white text-xs"
                            disabled={isBusy}
                            onClick={() => replyActionMutation.mutate({ id: reply.id, action: "approve" })}
                          >
                            {isBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            disabled={isBusy}
                            onClick={() => { setChangesNoteId(reply.id); setChangesNote(""); }}
                          >
                            <MessageSquareWarning className="w-3 h-3 mr-1" />
                            Request Changes
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto"
                            disabled={isBusy}
                            onClick={() => replyActionMutation.mutate({ id: reply.id, action: "reject" })}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Google Connection */}
        {googleStatus?.oauthConfigured && (
          <Card className={`p-4 ${googleStatus.needsReconnect ? "border-amber-200" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${googleStatus.connected && !googleStatus.needsReconnect ? "bg-emerald-50" : googleStatus.needsReconnect ? "bg-amber-50" : "bg-muted/50"}`}>
                  {googleStatus.connected && !googleStatus.needsReconnect ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : googleStatus.needsReconnect ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  ) : (
                    <Unplug className="w-4 h-4 text-muted-foreground/70" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {googleStatus.connected && !googleStatus.needsReconnect
                      ? "Google Connected"
                      : googleStatus.needsReconnect
                        ? "Google Needs Reconnection"
                        : "Connect Google"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-md">
                    {googleStatus.connected && !googleStatus.needsReconnect
                      ? "Review responses can be posted directly to Google from ReputationShield."
                      : googleStatus.needsReconnect
                        ? "Your connection has expired. Reconnect to continue posting responses directly to Google."
                        : "Connect your Google Business Profile to post review responses directly — no copy-paste needed."}
                  </p>
                  {googleStatus.connected && googleStatus.connectedAt && !googleStatus.needsReconnect && (
                    <p className="text-[11px] text-muted-foreground/70 mt-1">Connected {new Date(googleStatus.connectedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                  )}
                </div>
              </div>
              <div className="shrink-0">
                {!googleStatus.connected || googleStatus.needsReconnect ? (
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-brand-blue hover:bg-brand-blue-600"
                    disabled={googleConnectMutation.isPending}
                    onClick={() => googleConnectMutation.mutate()}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    {googleStatus.needsReconnect ? "Reconnect" : "Connect Google"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs text-muted-foreground"
                    onClick={() => setShowDisconnectConfirm(true)}
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Metrics */}
        {loadingOverview ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" />
          </div>
        ) : rv && rq ? (
          <>
            <div className="grid auto-rows-fr grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard label="Average Rating" value={`${rv.averageRating}★`} icon={Star} color="bg-amber-500" />
              <MetricCard
                label="Total Reviews"
                value={rv.total}
                sub={rv.last30Days > 0 ? `+${rv.last30Days} this month` : undefined}
                icon={TrendingUp}
                color="bg-emerald-500"
              />
              <MetricCard
                label="Requests Sent"
                value={rq.totalSent}
                sub={rq.pendingFollowups > 0 ? `${rq.pendingFollowups} follow-ups pending` : undefined}
                icon={Send}
                color="bg-blue-500"
              />
              <MetricCard
                label="Private Issues Captured"
                value={rq.feedbackCaptured}
                sub={`${rq.routedPositive} happy customers sent to Google`}
                icon={ShieldCheck}
                color="bg-brand-blue-500"
              />
            </div>

            {/* Q16 upsell — pair ReputationShield with RankFlow (reviews ↔ local rankings) */}
            <UpsellCard
              recommendPrefix="rankflow"
              pitch="Pair your reviews with RankFlow local SEO — high review counts are a top ranking signal for the Map Pack."
            />

            {/* Value signals */}
            <Card className="p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">This Month</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                {rv.last30Days > 0 && (
                  <div className="flex items-center gap-2 text-foreground">
                    <Star className="w-4 h-4 text-amber-500 shrink-0" />
                    <span><strong>{rv.last30Days}</strong> new public review{rv.last30Days !== 1 ? "s" : ""}</span>
                  </div>
                )}
                {rq.feedbackCaptured > 0 && (
                  <div className="flex items-center gap-2 text-foreground">
                    <ShieldCheck className="w-4 h-4 text-brand-blue-500 shrink-0" />
                    <span><strong>{rq.feedbackCaptured}</strong> issue{rq.feedbackCaptured !== 1 ? "s" : ""} captured privately</span>
                  </div>
                )}
                {rv.withoutResponse > 0 && (
                  <div className="flex items-center gap-2 text-foreground">
                    <MessageSquare className="w-4 h-4 text-amber-500 shrink-0" />
                    <span><strong>{rv.withoutResponse}</strong> review{rv.withoutResponse !== 1 ? "s" : ""} awaiting reply</span>
                  </div>
                )}
              </div>
              {rv.lowRatingNoResponse > 0 && (
                <div className="flex items-center gap-2 text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="text-sm"><strong>{rv.lowRatingNoResponse}</strong> low-rating review{rv.lowRatingNoResponse !== 1 ? "s" : ""} without a response</span>
                </div>
              )}
            </Card>

            {/* Upgrade hints for locked features */}
            {Object.keys(upgradeHints).length > 0 && (
              <div className="space-y-2">
                {upgradeHints.aiDrafts && <UpgradeBanner feature="AI Response Drafts" hint={upgradeHints.aiDrafts} />}
                {upgradeHints.reviewWidget && <UpgradeBanner feature="Review Widget" hint={upgradeHints.reviewWidget} />}
                {upgradeHints.competitorTracking && <UpgradeBanner feature="Competitor Tracking" hint={upgradeHints.competitorTracking} />}
              </div>
            )}
          </>
        ) : null}

        {/* Request a Review + QR Code */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 auto-rows-fr">
          {/* Manual Request */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-500" />
                <p className="text-sm font-medium text-foreground">Request a Review</p>
              </div>
              {requestStats && requestStats.portal_manual > 0 && (
                <span className="text-xs text-muted-foreground/70">{requestStats.portal_manual} sent</span>
              )}
            </div>
            {!showRequestForm ? (
              <div>
                <p className="text-xs text-muted-foreground mb-3">Send a review request to a specific customer by email or text.</p>
                <Button size="sm" className="bg-brand-blue hover:bg-brand-blue-600" onClick={() => setShowRequestForm(true)}>
                  <Send className="w-3.5 h-3.5 mr-1" /> Send Review Request
                </Button>
              </div>
            ) : requestSent ? (
              <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-3">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="text-sm">Review request sent! Your customer will receive it shortly.</span>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Customer name *"
                  value={requestForm.customer_name}
                  onChange={(e) => setRequestForm({ ...requestForm, customer_name: e.target.value })}
                  className="h-9 text-sm"
                />
                <Input
                  placeholder="Email address"
                  type="email"
                  value={requestForm.customer_email}
                  onChange={(e) => setRequestForm({ ...requestForm, customer_email: e.target.value })}
                  className="h-9 text-sm"
                />
                <Input
                  placeholder="Phone number"
                  type="tel"
                  value={requestForm.customer_phone}
                  onChange={(e) => setRequestForm({ ...requestForm, customer_phone: e.target.value })}
                  className="h-9 text-sm"
                />
                <SmsConsentDisclosure />
                <Input
                  placeholder="Job description (optional)"
                  value={requestForm.job_label}
                  onChange={(e) => setRequestForm({ ...requestForm, job_label: e.target.value })}
                  className="h-9 text-sm"
                />
                {(!requestForm.customer_email && !requestForm.customer_phone) && requestForm.customer_name.length > 0 && (
                  <p className="text-xs text-amber-600">Enter an email or phone number to send the request.</p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-brand-blue hover:bg-brand-blue-600"
                    disabled={!requestForm.customer_name.trim() || (!requestForm.customer_email && !requestForm.customer_phone) || requestMutation.isPending}
                    onClick={() => requestMutation.mutate(requestForm)}
                  >
                    {requestMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                    Send
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowRequestForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* QR Code */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-brand-blue-500" />
                <p className="text-sm font-medium text-foreground">QR Review Code</p>
              </div>
              {requestStats && requestStats.qr_scan > 0 && (
                <span className="text-xs text-muted-foreground/70">{requestStats.qr_scan} scans</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Customers scan this code after a job to leave a review. Add it to business cards, invoices, or show it on your phone.
            </p>
            {qrData?.qrUrl ? (
              <div className="space-y-3">
                <div className="bg-card border border-border rounded-lg p-4 flex items-center justify-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrData.qrUrl)}&margin=8`}
                    alt="QR Code"
                    width={180}
                    height={180}
                    className="block"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrData.qrUrl)}&margin=16&format=png`;
                      a.download = "review-qr-code.png";
                      a.click();
                      toast({ title: "QR code downloaded" });
                    }}
                  >
                    Download PNG
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(qrData.qrUrl);
                      toast({ title: "Link copied" });
                    }}
                  >
                    Copy Link
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground/70">Works on any phone camera. No app needed.</p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground/70 italic">Loading QR code...</div>
            )}
          </Card>
        </div>

        {/* Source breakdown */}
        {requestStats && requestStats.total > 0 && (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>Review requests by source:</span>
            {requestStats.job_complete > 0 && <Badge variant="secondary" className="text-[10px]">Post-job: {requestStats.job_complete}</Badge>}
            {requestStats.portal_manual > 0 && <Badge variant="secondary" className="text-[10px]">Manual: {requestStats.portal_manual}</Badge>}
            {requestStats.qr_scan > 0 && <Badge variant="secondary" className="text-[10px]">QR scan: {requestStats.qr_scan}</Badge>}
            {requestStats.admin_manual > 0 && <Badge variant="secondary" className="text-[10px]">Admin: {requestStats.admin_manual}</Badge>}
          </div>
        )}

        {/* Recent Reviews */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Recent Reviews</h3>
          {loadingReviews ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" />
            </div>
          ) : reviews.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">
              No public reviews tracked yet. Reviews will appear here once monitoring starts.
            </Card>
          ) : (
            <div className="space-y-2">
              {reviews.map((r) => {
                const expanded = expandedReview === r.id;
                const isLow = r.rating <= 2;
                return (
                  <Card key={r.id} className={`overflow-hidden ${isLow && !r.response_text ? "border-red-200" : ""}`}>
                    <button
                      className="w-full p-4 text-left flex items-start gap-3 hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedReview(expanded ? null : r.id)}
                    >
                      <div className="shrink-0 mt-0.5">
                        <RatingStars rating={r.rating} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{r.reviewer_name}</span>
                          <span className="text-xs text-muted-foreground/70">{formatDate(r.published_at)}</span>
                          {r.is_new && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />}
                        </div>
                        {r.review_text && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.review_text}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.response_text ? (
                          <Badge variant="secondary" className="text-[10px] bg-green-50 text-green-700">Replied</Badge>
                        ) : r.draft_response && features.aiDrafts ? (
                          <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-600">Draft ready</Badge>
                        ) : isLow ? (
                          <Badge variant="secondary" className="text-[10px] bg-red-50 text-red-600">Needs reply</Badge>
                        ) : null}
                        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground/70" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/70" />}
                      </div>
                    </button>
                    {expanded && (
                      <div className="px-4 pb-4 pt-0 space-y-3 border-t">
                        {r.review_text && (
                          <div className="pt-3">
                            <p className="text-xs text-muted-foreground/70 mb-1">Full Review</p>
                            <p className="text-sm text-foreground whitespace-pre-wrap">{r.review_text}</p>
                          </div>
                        )}
                        {r.response_text && (
                          <div>
                            <p className="text-xs text-muted-foreground/70 mb-1">Your Response (Public)</p>
                            <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                              <p className="text-sm text-green-800 whitespace-pre-wrap">{r.response_text}</p>
                            </div>
                          </div>
                        )}
                        {!r.response_text && r.draft_response && features.aiDrafts && (
                          <div>
                            <p className="text-xs text-muted-foreground/70 mb-1">Draft Response (Not Posted)</p>
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                              <p className="text-sm text-blue-800 whitespace-pre-wrap">{r.draft_response}</p>
                              <p className="text-[11px] text-blue-500 mt-2">Prepared by your team. Not posted publicly yet.</p>
                            </div>
                          </div>
                        )}
                        {!r.response_text && !r.draft_response && (
                          <div className={`rounded-lg p-3 ${isLow ? "bg-red-50 border border-red-100" : "bg-muted/50"}`}>
                            <p className={`text-sm ${isLow ? "text-red-700" : "text-muted-foreground"}`}>
                              {isLow
                                ? "This review hasn't been responded to yet. Low-rating reviews benefit from a timely reply."
                                : "No response has been posted to this review yet."}
                            </p>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground/70">
                          First seen {formatDate(r.first_seen_at)} on <span className="capitalize font-medium">{r.platform}</span>
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
            className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3 hover:text-foreground"
            onClick={() => setShowFeedback(!showFeedback)}
          >
            <ThumbsDown className="w-4 h-4" />
            Private Customer Feedback
            {rq && rq.feedbackCaptured > 0 && (
              <span className="text-xs font-normal text-muted-foreground/70">({rq.feedbackCaptured})</span>
            )}
            {showFeedback ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showFeedback && (
            <>
              {loadingFeedback ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/70" />
                </div>
              ) : feedback.length === 0 ? (
                <Card className="p-4 text-center text-muted-foreground text-sm">
                  No private feedback captured yet. When customers share concerns privately, they appear here.
                </Card>
              ) : (
                <div className="space-y-2">
                  {feedback.map((f) => (
                    <Card key={f.id} className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="text-sm font-medium text-foreground">{f.customer_name || "Customer"}</span>
                          <span className="text-xs text-muted-foreground/70 ml-2">{formatDate(f.completed_at || f.created_at)}</span>
                        </div>
                        <Badge variant="secondary" className="text-[10px] bg-brand-blue-50 text-brand-blue-600">Private</Badge>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{f.internal_feedback}</p>
                      <p className="text-xs text-muted-foreground/70 mt-2">Captured privately — not posted publicly.</p>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <AlertDialog open={showDisconnectConfirm} onOpenChange={setShowDisconnectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Google?</AlertDialogTitle>
            <AlertDialogDescription>
              You won't be able to post review responses directly until you reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowDisconnectConfirm(false); googleDisconnectMutation.mutate(); }}
              className="bg-red-600 hover:bg-red-700"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PortalLayout>
  );
}
