import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, CheckCircle, Clock, ArrowRight, TrendingUp, FileText,
  MapPin, BarChart3, Sparkles, Globe, Search, ArrowUpRight, Minus,
  PauseCircle, PlayCircle, Link, ExternalLink, ShieldCheck,
  AlertCircle, RotateCw,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import UpsellCard from "@/components/portal/UpsellCard";
import {
  PortalProductPageShell,
  type PortalPlanTier,
  type ProductPortalStats,
} from "@/components/portal/PortalProductPageShell";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

/** Map raw plan_tier string from API → shell's PortalPlanTier vocab. */
function mapPlanTier(raw: string | undefined): PortalPlanTier {
  switch ((raw || "").toLowerCase()) {
    case "pro":
      return "pro";
    case "business":
      return "business";
    case "enterprise":
      return "enterprise";
    case "starter":
    case "free":
      return "free";
    default:
      return null;
  }
}

/* ─── Types ─── */
interface RankFlowData {
  active: boolean;
  plan_tier?: string;
  month?: string;
  statusLine?: string;
  narrative?: string;
  metrics?: {
    tasksCompleted: number;
    totalTasks: number;
    pagesCreated: number;
    citationsBuilt: number;
    progressPct: number;
  };
  ranking?: {
    highlights: string[];
    keywordsTracked: number;
    keywordsTop10: number;
    keywordsTop20: number;
    keywordsImproved: number;
    avgPosition: number | null;
  };
  indexing?: {
    totalPages: number;
    indexed: number;
    pending: number;
  };
  completed?: { label: string; detail: string; completedAt: string | null }[];
  inProgress?: { label: string; detail: string }[];
  nextUp?: string[];
}

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TRADE_OPTIONS = [
  "Plumbing", "HVAC", "Electrical", "Roofing", "Cleaning", "Landscaping", "Locksmith", "General Contractor",
];

/* ─── Main Component ─── */
export default function PortalRankFlow() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, error: rankflowError, refetch, isFetching } = useQuery<RankFlowData>({
    queryKey: ["/api/portal/rankflow"],
    queryFn: async () => {
      const res = await fetch("/api/portal/rankflow", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const { data: automationStatus } = useQuery<{ all_automation_paused: boolean; rankflow_article_generation_paused: boolean }>({
    queryKey: ["/api/portal/automation-status"],
  });

  const pauseMutation = useMutation({
    mutationFn: async (paused: boolean) => {
      const res = await apiRequest("PATCH", "/api/portal/rankflow/settings", { article_generation_paused: paused });
      return res.json();
    },
    onSuccess: (_data, paused) => {
      qc.invalidateQueries({ queryKey: ["/api/portal/automation-status"] });
      toast({ title: paused ? "Article generation paused" : "Article generation resumed" });
    },
    onError: () => {
      toast({ title: "Failed to update setting", variant: "destructive" });
    },
  });

  const isArticleGenPaused = automationStatus?.rankflow_article_generation_paused || automationStatus?.all_automation_paused || false;

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/50" />
        </div>
      </PortalLayout>
    );
  }

  if (isError) {
    return (
      <PortalLayout>
        <div data-theme="light" className="max-w-md mx-auto mt-16">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800">Couldn't load RankFlow</p>
                <p className="text-xs text-red-700 mt-1">
                  {(rankflowError as Error | null)?.message ?? "The server didn't respond as expected."}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-300 rounded-md hover:bg-red-100 disabled:opacity-50 transition-colors"
                  data-testid="button-retry-rankflow"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
                  Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      </PortalLayout>
    );
  }

  if (!data || !data.active) {
    return (
      <PortalLayout>
        <OnboardingWizard onComplete={() => qc.invalidateQueries({ queryKey: ["/api/portal/rankflow"] })} />
      </PortalLayout>
    );
  }

  const m = data.metrics!;
  const r = data.ranking;
  const idx = data.indexing;
  const planTier = mapPlanTier(data.plan_tier);

  const stats: ProductPortalStats = {
    primary: {
      label: "Keywords tracked",
      value: r?.keywordsTracked ?? 0,
      hint: "Search terms RankFlow monitors for your business",
    },
    secondary: {
      label: "Page 1 (Top 10)",
      value: r?.keywordsTop10 ?? 0,
      hint: "Keywords ranking on the first page of Google",
    },
    tertiary: {
      label: "Pages created",
      value: m.pagesCreated,
      hint: "SEO pages built for your site this month",
    },
    quaternary: {
      label: "Progress",
      value: m.progressPct,
      suffix: "%",
      hint: "Monthly task completion",
    },
  };

  // Portal RankFlow is light-theme locked — see CONTRAST-2.
  const overviewBody = (
    <div data-theme="light" className="max-w-3xl space-y-5">
      {data.statusLine && (
        <p className="text-sm text-muted-foreground">{data.statusLine}</p>
      )}

      {/* ─── Pause Article Generation Toggle ─── */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isArticleGenPaused ? (
                <PauseCircle className="w-5 h-5 text-amber-500" />
              ) : (
                <PlayCircle className="w-5 h-5 text-emerald-500" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">New Article Generation</p>
                <p className="text-xs text-muted-foreground">{isArticleGenPaused ? "Paused" : "Active"}</p>
              </div>
            </div>
            <Switch
              checked={!isArticleGenPaused}
              onCheckedChange={(checked) => pauseMutation.mutate(!checked)}
              disabled={pauseMutation.isPending || automationStatus?.all_automation_paused}
              className="data-[state=checked]:bg-[#0d3cfc]"
            />
          </div>
          {isArticleGenPaused && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-700">
                {automationStatus?.all_automation_paused
                  ? "All automation is paused from your account settings. Resume from Settings to re-enable article generation."
                  : "New article generation is paused. No new articles will be created until you resume."}
              </p>
            </div>
          )}
        </div>

        {/* ─── Google Search Console Connection ─── */}
        <SearchConsoleCard />

        {/* ─── Monthly Narrative ─── */}
        {data.narrative && (
          <div className="bg-[#EEF3FF] border border-[#0d3cfc]/10 rounded-xl px-5 py-4">
            <p className="text-sm text-[#0b34d6] leading-relaxed">{data.narrative}</p>
          </div>
        )}

        {/* ─── Metrics Row ─── */}
        <div className="grid auto-rows-fr grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard icon={CheckCircle} label="Work Done" value={`${m.tasksCompleted}/${m.totalTasks}`} color="emerald" />
          <MetricCard icon={FileText} label="Pages Created" value={String(m.pagesCreated)} color="blue" />
          <MetricCard icon={MapPin} label="Directory Listings" value={String(m.citationsBuilt)} color="amber" />
          <MetricCard icon={BarChart3} label="Progress" value={`${m.progressPct}%`} color="indigo" />
        </div>

        {/* Q16 upsell — pair RankFlow with SocialSync for content amplification */}
        <UpsellCard
          recommendPrefix="socialsync"
          pitch="Add SocialSync so RankFlow content gets republished to your social channels — same content, multiple distribution points."
        />

        {/* ─── Progress Bar ─── */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Monthly Progress</span>
            <span className="text-xs text-muted-foreground/70">{m.progressPct}% complete</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-[#0d3cfc] rounded-full transition-all duration-500" style={{ width: `${m.progressPct}%` }} />
          </div>
        </div>

        {/* ─── Ranking Highlights ─── */}
        {r && (r.keywordsTracked > 0 || r.highlights.length > 0) && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Search className="w-4 h-4 text-muted-foreground/70" /> Ranking Progress
              </h2>
            </div>
            <div className="px-5 py-4">
              {/* Stat row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <MiniStat label="Keywords Tracked" value={String(r.keywordsTracked)} hint="Search terms we monitor for your business" />
                <MiniStat label="Page 1 (Top 10)" value={String(r.keywordsTop10)} highlight={r.keywordsTop10 > 0} hint="Keywords ranking on the first page of Google" />
                <MiniStat label="Top 20" value={String(r.keywordsTop20)} highlight={r.keywordsTop20 > 0} hint="Keywords ranking in the top 2 pages of Google" />
                <MiniStat label="Improved" value={String(r.keywordsImproved)} highlight={r.keywordsImproved > 0} hint="Keywords that moved up in ranking this month" />
              </div>
              {/* Highlights */}
              {r.highlights.length > 0 && (
                <ul className="space-y-1.5">
                  {r.highlights.map((h, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-emerald-700">
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                      {h}
                    </li>
                  ))}
                </ul>
              )}
              {r.avgPosition !== null && (
                <p className="text-xs text-muted-foreground/70 mt-3">Average position: {r.avgPosition}</p>
              )}
            </div>
          </div>
        )}

        {/* ─── Indexing Status ─── */}
        {idx && idx.totalPages > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-muted-foreground/70" /> Pages on Google
              </h2>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">{idx.indexed} of {idx.totalPages} pages indexed</span>
                    <span className="text-xs text-muted-foreground/70">{idx.totalPages > 0 ? Math.round((idx.indexed / idx.totalPages) * 100) : 0}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${idx.totalPages > 0 ? (idx.indexed / idx.totalPages) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
              {idx.pending > 0 && (
                <p className="text-xs text-muted-foreground/70 mt-2">{idx.pending} page{idx.pending > 1 ? "s" : ""} waiting to be indexed by Google</p>
              )}
            </div>
          </div>
        )}

        {/* ─── Work Completed ─── */}
        {data.completed && data.completed.length > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">What We Did This Month</h2>
            </div>
            <ul className="divide-y divide-gray-50">
              {data.completed.map((item, i) => (
                <li key={i} className="px-5 py-3 flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{item.detail}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-medium text-muted-foreground/70">{item.label}</span>
                      {item.completedAt && <span className="text-[10px] text-muted-foreground/50">{formatDate(item.completedAt)}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ─── In Progress ─── */}
        {data.inProgress && data.inProgress.length > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Currently Working On</h2>
            </div>
            <ul className="divide-y divide-gray-50">
              {data.inProgress.map((item, i) => (
                <li key={i} className="px-5 py-3 flex items-start gap-3">
                  <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{item.detail}</p>
                    <span className="text-[10px] font-medium text-muted-foreground/70">{item.label}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

      {/* ─── What's Next ─── */}
      {data.nextUp && data.nextUp.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Coming Up Next</h2>
          </div>
          <ul className="divide-y divide-gray-50">
            {data.nextUp.map((item, i) => (
              <li key={i} className="px-5 py-3 flex items-center gap-3">
                <ArrowRight className="w-4 h-4 text-[#0d3cfc] shrink-0" />
                <p className="text-sm text-foreground">{item}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <PortalLayout>
      {/* Portal RankFlow is light-theme locked — see CONTRAST-2. */}
      <div data-theme="light">
        <PortalProductPageShell
          productId="rankflow"
          productName="RankFlow SEO Report"
          planTier={planTier}
          upgradeCtaHref="/portal/billing"
          stats={stats}
          tabs={[
            { id: "overview", label: "Overview", render: () => overviewBody },
          ]}
        />
      </div>
    </PortalLayout>
  );
}

/* ─── Sub-Components ─── */

/* ─── Search Console Connection Card ─── */

interface SearchConsoleStatus {
  enabled: boolean;
  oauthConfigured?: boolean;
  googleConnected: boolean;
  searchConsoleConnected: boolean;
}

function SearchConsoleCard() {
  const { toast } = useToast();

  const { data: scStatus, isLoading } = useQuery<SearchConsoleStatus>({
    queryKey: ["/api/portal/rankflow/search-console-status"],
    queryFn: async () => {
      const res = await fetch("/api/portal/rankflow/search-console-status", { credentials: "include" });
      if (!res.ok) return { enabled: false, googleConnected: false, searchConsoleConnected: false };
      return res.json();
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/rankflow/google-connect", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to start Google connection");
      const data = await res.json();
      return data.authUrl;
    },
    onSuccess: (authUrl: string) => {
      window.location.href = authUrl;
    },
    onError: () => {
      toast({ title: "Failed to connect Google", variant: "destructive" });
    },
  });

  // Don't render if feature is not enabled or still loading
  if (isLoading || !scStatus?.enabled) return null;

  // Already connected to Search Console
  if (scStatus.searchConsoleConnected) {
    return (
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <div>
              <p className="text-sm font-medium text-foreground">Google Search Console</p>
              <p className="text-xs text-muted-foreground">Connected -- real ranking data is active</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">Active</span>
        </div>
      </div>
    );
  }

  // Google connected but Search Console not accessible (might need to verify site)
  if (scStatus.googleConnected && !scStatus.searchConsoleConnected) {
    return (
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <Link className="w-5 h-5 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-foreground">Google Search Console</p>
            <p className="text-xs text-muted-foreground">Google connected, but Search Console access not detected</p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="text-xs text-amber-700">
            Make sure your website is verified in Google Search Console. You may need to{" "}
            <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">
              add and verify your site <ExternalLink className="w-3 h-3 inline" />
            </a>
            , then reconnect your Google account.
          </p>
        </div>
        <button
          className="mt-3 w-full py-2 rounded-lg text-sm font-medium text-white bg-[#0d3cfc] hover:bg-[#0b34d6] disabled:opacity-50 transition-colors"
          disabled={connectMutation.isPending}
          onClick={() => connectMutation.mutate()}
        >
          {connectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Reconnect Google"}
        </button>
      </div>
    );
  }

  // Not connected at all
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center gap-3 mb-3">
        <Globe className="w-5 h-5 text-muted-foreground/70" />
        <div>
          <p className="text-sm font-medium text-foreground">Connect Google Search Console</p>
          <p className="text-xs text-muted-foreground">Get real ranking data directly from Google for more accurate reports</p>
        </div>
      </div>
      <button
        className="w-full py-2.5 rounded-lg text-sm font-medium text-white bg-[#0d3cfc] hover:bg-[#0b34d6] disabled:opacity-50 transition-colors"
        disabled={connectMutation.isPending}
        onClick={() => connectMutation.mutate()}
      >
        {connectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Connect Google"}
      </button>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-500",
    blue: "text-blue-500",
    amber: "text-amber-500",
    indigo: "text-brand-blue-500",
  };
  return (
    <div className="h-full bg-card rounded-xl border border-border p-4 text-center">
      <Icon className={`w-4 h-4 mx-auto mb-1.5 ${colors[color] || "text-muted-foreground/70"}`} />
      <p className="text-xl font-semibold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function MiniStat({ label, value, highlight, hint }: { label: string; value: string; highlight?: boolean; hint?: string }) {
  return (
    <div className="text-center" title={hint}>
      <p className={`text-lg font-semibold ${highlight ? "text-emerald-600" : "text-foreground"}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

/* ─── Onboarding Wizard ─── */

function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);

  // Accept prefill from audit conversion URL param
  const prefillData = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("prefill");
      if (raw) return JSON.parse(decodeURIComponent(raw));
    } catch {}
    return null;
  })();

  const [form, setForm] = useState({
    business_name: prefillData?.business_name || "",
    website_url: prefillData?.website_url || "",
    niche: prefillData?.niche || "",
    location: prefillData?.location || "",
    additional_services: "",
    additional_locations: "",
  });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const onboard = useMutation({
    mutationFn: async () => {
      const body = {
        business_name: form.business_name.trim(),
        website_url: form.website_url.trim(),
        niche: form.niche,
        location: form.location.trim(),
        additional_services: form.additional_services ? form.additional_services.split(",").map(s => s.trim()).filter(Boolean) : undefined,
        additional_locations: form.additional_locations ? form.additional_locations.split(",").map(s => s.trim()).filter(Boolean) : undefined,
      };
      const res = await fetch("/api/portal/rankflow/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to complete setup");
      }
      return res.json();
    },
    onSuccess: () => { setDone(true); setTimeout(() => onComplete(), 2000); },
    onError: (e: any) => setError(e.message),
  });

  const canAdvance1 = form.business_name.trim() && form.website_url.trim();
  const canAdvance2 = form.niche && form.location.trim();

  if (done) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-7 h-7 text-[#0d3cfc]" />
        </div>
        <h1 className="text-lg font-semibold text-foreground mb-2">You're all set!</h1>
        <p className="text-sm text-muted-foreground">We're starting your SEO work now. Check back soon to see progress.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-8">
      <div className="text-center mb-6">
        <TrendingUp className="w-8 h-8 text-[#0d3cfc] mx-auto mb-3" />
        <h1 className="text-lg font-semibold text-foreground">Set Up RankFlow</h1>
        <p className="text-sm text-muted-foreground mt-1">Tell us about your business so we can start improving your local SEO.</p>
      </div>
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map(s => (
          <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${s <= step ? "bg-[#0d3cfc]" : "bg-muted"}`} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground/70 text-center mb-4">Step {step} of 3</p>

      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <Field label="Business name" placeholder="e.g. Ace Plumbing" value={form.business_name} onChange={v => setForm({ ...form, business_name: v })} />
            <Field label="Website URL" placeholder="e.g. https://aceplumbing.ca" value={form.website_url} onChange={v => setForm({ ...form, website_url: v })} type="url" />
          </div>
          <button className="w-full py-2.5 rounded-lg text-sm font-medium text-white bg-[#0d3cfc] hover:bg-[#0b34d6] disabled:opacity-50 transition-colors" disabled={!canAdvance1} onClick={() => setStep(2)}>Continue</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">What type of trade?</label>
              <select className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0d3cfc]/30 bg-card" value={form.niche} onChange={e => setForm({ ...form, niche: e.target.value })}>
                <option value="">Select your trade...</option>
                {TRADE_OPTIONS.map(t => <option key={t} value={t.toLowerCase()}>{t}</option>)}
              </select>
            </div>
            <Field label="Primary city or area" placeholder="e.g. Hamilton, ON" value={form.location} onChange={v => setForm({ ...form, location: v })} />
            <Field label="Other services you offer" placeholder="e.g. drain cleaning, water heater repair" value={form.additional_services} onChange={v => setForm({ ...form, additional_services: v })} optional hint="Separate with commas" />
            <Field label="Other areas you serve" placeholder="e.g. Burlington, Stoney Creek" value={form.additional_locations} onChange={v => setForm({ ...form, additional_locations: v })} optional hint="Separate with commas" />
          </div>
          <div className="flex gap-2">
            <button className="flex-1 py-2.5 rounded-lg text-sm font-medium text-muted-foreground bg-muted hover:bg-muted transition-colors" onClick={() => setStep(1)}>Back</button>
            <button className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-[#0d3cfc] hover:bg-[#0b34d6] disabled:opacity-50 transition-colors" disabled={!canAdvance2} onClick={() => setStep(3)}>Continue</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Confirm your details</h2>
            <dl className="space-y-2 text-sm">
              <ConfirmRow label="Business" value={form.business_name} />
              <ConfirmRow label="Website" value={form.website_url} />
              <ConfirmRow label="Trade" value={form.niche} />
              <ConfirmRow label="Location" value={form.location} />
              {form.additional_services && <ConfirmRow label="Services" value={form.additional_services} />}
              {form.additional_locations && <ConfirmRow label="Areas" value={form.additional_locations} />}
            </dl>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3">
            <p className="text-sm text-emerald-800"><Sparkles className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />We'll automatically generate your first SEO plan and start work right away.</p>
          </div>
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          <div className="flex gap-2">
            <button className="flex-1 py-2.5 rounded-lg text-sm font-medium text-muted-foreground bg-muted hover:bg-muted transition-colors" onClick={() => setStep(2)}>Back</button>
            <button className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-[#0d3cfc] hover:bg-[#0b34d6] disabled:opacity-50 transition-colors" disabled={onboard.isPending} onClick={() => onboard.mutate()}>
              {onboard.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Start My SEO"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Form Helpers ─── */

function Field({ label, placeholder, value, onChange, type, optional, hint }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
  type?: string; optional?: boolean; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-foreground mb-1">
        {label} {optional && <span className="text-muted-foreground/70">(optional)</span>}
      </label>
      <input
        type={type || "text"} placeholder={placeholder}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0d3cfc]/30 focus:border-[#0d3cfc]"
        value={value} onChange={e => onChange(e.target.value)}
      />
      {hint && <p className="text-[10px] text-muted-foreground/70 mt-1">{hint}</p>}
    </div>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground font-medium capitalize text-right max-w-[200px] truncate">{value}</dd>
    </div>
  );
}
