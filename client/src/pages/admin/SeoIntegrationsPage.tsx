/**
 * SEO Integrations admin page — /admin/integrations/google.
 *
 * Four-card grid (Google Search Console, Bing Webmaster, GA4, Google
 * Business Profile). Connection is one tap each (Google is a single
 * OAuth grant covering GSC + GA4 + GBP scopes; Bing is an API-key
 * paste; GBP is a prepared draft that links out to business.google.com).
 *
 * After bootstrap, every card shows the connected account, expiry, and
 * a Disconnect button. Bottom panel surfaces recent sitemap submissions
 * + indexing requests pulled from seo_indexing_history.
 *
 * Follows DESIGN-SYSTEM.md rules: every interactive surface has a
 * top-left help cue, no big gaps, theme-aware colors, outline-on-select.
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  ExternalLink,
  Globe,
  Info,
  Search,
  TrendingUp,
  MapPin,
  AlertCircle,
} from "lucide-react";

interface ProviderStatus {
  connected: boolean;
  account_email: string | null;
  expires_at: string | null;
  scopes: string[];
  connected_at: string | null;
}

interface IndexingHistoryRow {
  id: string;
  url: string;
  action: string;
  source: string;
  status: string | null;
  performed_at: string;
}

interface StatusResponse {
  google: ProviderStatus;
  bing: ProviderStatus;
  gbp: ProviderStatus;
  ga4: { measurement_id: string | null; configured: boolean };
  gbp_api_available: boolean;
  google_oauth_configured: boolean;
  cloudflare_configured: boolean;
  recent_history: IndexingHistoryRow[];
}

interface BingQuotaResponse {
  daily: number;
  monthly: number;
}

interface BingSitemapsResponse {
  sitemaps: Array<{ Url?: string; Status?: string; LastCrawledDate?: string }>;
}

interface BingUrlInfoResponse {
  url: string;
  info: {
    Url?: string;
    DocumentDownloaded?: boolean;
    HttpStatus?: number;
    LastCrawledDate?: string;
    DiscoveryDate?: string;
    AnchorCount?: number;
    TotalChildUrlCount?: number;
  };
}

function HelpCue({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 text-xs text-slate-500">
      <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/**
 * Bing Webmaster automation card. Lives under the four-card grid and surfaces
 * the env-key-backed automation: live quota, sitemap status, single-URL submit,
 * URL status lookup, and a filtered view of the last 20 Bing rows from
 * seo_indexing_history. All Bing calls go through the admin endpoints in
 * server/routes/adminSeoIntegrationsRoutes.ts.
 */
function BingAutomationCard() {
  const [submitUrl, setSubmitUrl] = useState("");
  const [inspectUrl, setInspectUrl] = useState("");
  const [inspectResult, setInspectResult] = useState<BingUrlInfoResponse | null>(null);
  const [submitMessage, setSubmitMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const qc = useQueryClient();

  const quotaQuery = useQuery<BingQuotaResponse>({
    queryKey: ["/api/admin/seo/bing/quota"],
    queryFn: async () => {
      const res = await fetch("/api/admin/seo/bing/quota", { credentials: "include" });
      if (!res.ok) throw new Error(`quota ${res.status}`);
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const sitemapsQuery = useQuery<BingSitemapsResponse>({
    queryKey: ["/api/admin/seo/bing/sitemaps"],
    queryFn: async () => {
      const res = await fetch("/api/admin/seo/bing/sitemaps", { credentials: "include" });
      if (!res.ok) throw new Error(`sitemaps ${res.status}`);
      return res.json();
    },
    refetchInterval: 5 * 60_000,
  });

  const historyQuery = useQuery<{ recent_history: IndexingHistoryRow[] }>({
    queryKey: ["/api/admin/integrations/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/integrations/status", { credentials: "include" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      setSubmitMessage(null);
      const res = await fetch("/api/admin/seo/bing/submit-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: submitUrl.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? `submit ${res.status}`);
      return body;
    },
    onSuccess: () => {
      setSubmitMessage({ kind: "ok", text: `Submitted ${submitUrl.trim()} to Bing.` });
      setSubmitUrl("");
      qc.invalidateQueries({ queryKey: ["/api/admin/seo/bing/quota"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/integrations/status"] });
    },
    onError: (err: Error) => setSubmitMessage({ kind: "error", text: err.message }),
  });

  const inspectMutation = useMutation({
    mutationFn: async () => {
      const u = inspectUrl.trim();
      const res = await fetch(`/api/admin/seo/bing/url-info?url=${encodeURIComponent(u)}`, {
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? `inspect ${res.status}`);
      return body as BingUrlInfoResponse;
    },
    onSuccess: (data) => setInspectResult(data),
    onError: (err: Error) =>
      setInspectResult({
        url: inspectUrl.trim(),
        info: { Url: `error: ${err.message}` },
      }),
  });

  const sitemapRegistered = (sitemapsQuery.data?.sitemaps ?? []).some((s) => {
    const url = String(s?.Url ?? "").trim().toLowerCase();
    return url === "https://wefixtrades.com/sitemap.xml";
  });

  const bingHistory = (historyQuery.data?.recent_history ?? [])
    .filter((row) => row.source === "bing")
    .slice(0, 20);

  return (
    <Card className="border border-slate-200">
      <CardContent className="p-4 space-y-3">
        <HelpCue>
          Bing automation runs unattended. Sitemap auto-registers on deploy; new URLs auto-submit
          every 6 hours; this panel is for ad-hoc submissions and indexing checks.
        </HelpCue>
        <div className="flex items-start gap-3">
          <Globe className="w-8 h-8 text-teal-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900">Bing Webmaster automation</h3>
            <p className="text-sm text-slate-600">
              Submit URLs, inspect index status, and see what the cron has shipped.
            </p>
          </div>
        </div>

        {/* Quota + sitemap status */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Daily quota remaining</div>
            <div className="font-semibold text-slate-900">
              {quotaQuery.isLoading
                ? "…"
                : quotaQuery.data
                  ? quotaQuery.data.daily.toLocaleString()
                  : "—"}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Monthly quota remaining</div>
            <div className="font-semibold text-slate-900">
              {quotaQuery.isLoading
                ? "…"
                : quotaQuery.data
                  ? quotaQuery.data.monthly.toLocaleString()
                  : "—"}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">Sitemap</div>
            <div className="font-semibold text-slate-900 flex items-center gap-1">
              {sitemapsQuery.isLoading ? (
                "…"
              ) : sitemapRegistered ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Registered
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Not registered
                </>
              )}
            </div>
          </div>
        </div>

        {/* Submit URL */}
        <div data-cue-allowed-multiple className="space-y-1">
          <HelpCue>One URL per click. Counts 1 against the daily 100 quota.</HelpCue>
          <Label htmlFor="bing-submit-url" className="text-xs text-slate-700">
            Submit URL to Bing
          </Label>
          <div className="flex gap-2">
            <Input
              id="bing-submit-url"
              type="url"
              value={submitUrl}
              onChange={(e) => setSubmitUrl(e.target.value)}
              placeholder="https://wefixtrades.com/path"
              data-testid="bing-submit-url"
            />
            <Button
              size="sm"
              onClick={() => submitMutation.mutate()}
              disabled={!submitUrl.trim() || submitMutation.isPending}
              data-testid="bing-submit-url-go"
            >
              Submit
            </Button>
          </div>
          {submitMessage && (
            <p
              className={`text-xs ${
                submitMessage.kind === "ok" ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {submitMessage.text}
            </p>
          )}
        </div>

        {/* Inspect URL */}
        <div data-cue-allowed-multiple className="space-y-1">
          <HelpCue>Shows last crawl date, index discovery, anchor count, HTTP status.</HelpCue>
          <Label htmlFor="bing-inspect-url" className="text-xs text-slate-700">
            Check URL status in Bing
          </Label>
          <div className="flex gap-2">
            <Input
              id="bing-inspect-url"
              type="url"
              value={inspectUrl}
              onChange={(e) => setInspectUrl(e.target.value)}
              placeholder="https://wefixtrades.com/path"
              data-testid="bing-inspect-url"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => inspectMutation.mutate()}
              disabled={!inspectUrl.trim() || inspectMutation.isPending}
              data-testid="bing-inspect-url-go"
            >
              Check
            </Button>
          </div>
          {inspectResult && (
            <pre className="mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-[11px] overflow-auto">
              {JSON.stringify(inspectResult.info, null, 2)}
            </pre>
          )}
        </div>

        {/* Recent Bing activity */}
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-slate-900">Recent Bing activity</h4>
          {historyQuery.isLoading && <p className="text-xs text-slate-500">Loading…</p>}
          {!historyQuery.isLoading && bingHistory.length === 0 && (
            <p className="text-xs text-slate-500">No Bing activity yet.</p>
          )}
          {!historyQuery.isLoading && bingHistory.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-600">
                  <tr>
                    <th className="text-left p-1.5">When</th>
                    <th className="text-left p-1.5">Action</th>
                    <th className="text-left p-1.5">URL</th>
                    <th className="text-left p-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bingHistory.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="p-1.5 text-slate-700">
                        {new Date(row.performed_at).toLocaleString()}
                      </td>
                      <td className="p-1.5 text-slate-700">{row.action}</td>
                      <td className="p-1.5 text-slate-600 truncate max-w-xs">{row.url}</td>
                      <td className="p-1.5 text-slate-700">{row.status ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Live GA4 card — pulls last-7-day sessions, page views, new users, and
 * top 5 pages from the Data API (service-account auth, see
 * server/lib/analytics/ga4DataClient.ts). Refetches every 5 minutes —
 * GA's reporting pipeline is hours behind real-time anyway so polling
 * faster than that doesn't buy anything.
 *
 * When `configured === false` (no GA4_MEASUREMENT_ID in env) the card
 * shows a setup hint. When the Data API endpoint 503s (service account
 * not in Doppler yet) the card shows that explicitly and still surfaces
 * the "Open GA4" jump link so the operator can navigate manually.
 */
interface Ga4SummaryResponse {
  propertyId: string;
  measurement_id: string | null;
  sessions7d: number;
  pageviews7d: number;
  newUsers7d: number;
  topPages: Array<{ path: string; views: number }>;
  generatedAt: string;
}

function Ga4Card({
  configured,
  measurementId,
}: {
  configured: boolean;
  measurementId: string | null;
}) {
  const summary = useQuery<Ga4SummaryResponse>({
    queryKey: ["/api/admin/seo/ga4/summary"],
    queryFn: async () => {
      const res = await fetch("/api/admin/seo/ga4/summary", { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? `ga4 ${res.status}`);
      }
      return res.json();
    },
    enabled: configured,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  const propertyLabel = measurementId ? `wefixtrades-prd (${measurementId})` : "wefixtrades-prd";
  const connected = configured && summary.isSuccess;

  return (
    <Card className="border border-slate-200">
      <CardContent className="p-4 space-y-2">
        <HelpCue>
          Last 7 days, served by the GA4 Data API via the WeFixTrades service account.
          GA's pipeline is hours behind real-time — numbers settle within a day.
        </HelpCue>
        <div className="flex items-start gap-3">
          <TrendingUp className="w-8 h-8 text-orange-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900">Google Analytics 4</h3>
            <p className="text-sm text-slate-600">
              Track sessions, conversions, and quote-widget engagement.
            </p>
            {connected ? (
              <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Connected — {propertyLabel}
              </p>
            ) : configured ? (
              <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Measurement ID set, live summary unavailable
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-1">
                Add <code className="font-mono">GA4_MEASUREMENT_ID</code> to Doppler to enable.
              </p>
            )}
          </div>
        </div>

        {/* Live metrics */}
        {configured && (
          <div className="grid grid-cols-3 gap-2 text-sm pt-1">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">Sessions (7d)</div>
              <div className="font-semibold text-slate-900" data-testid="ga4-sessions-7d">
                {summary.isLoading
                  ? "…"
                  : summary.isError
                    ? "—"
                    : summary.data?.sessions7d.toLocaleString() ?? "0"}
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">Page views (7d)</div>
              <div className="font-semibold text-slate-900" data-testid="ga4-pageviews-7d">
                {summary.isLoading
                  ? "…"
                  : summary.isError
                    ? "—"
                    : summary.data?.pageviews7d.toLocaleString() ?? "0"}
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">New users (7d)</div>
              <div className="font-semibold text-slate-900" data-testid="ga4-new-users-7d">
                {summary.isLoading
                  ? "…"
                  : summary.isError
                    ? "—"
                    : summary.data?.newUsers7d.toLocaleString() ?? "0"}
              </div>
            </div>
          </div>
        )}

        {/* Top pages */}
        {connected && (summary.data?.topPages?.length ?? 0) > 0 && (
          <div className="pt-1">
            <h4 className="text-xs font-semibold text-slate-700 mb-1">Top pages (7d)</h4>
            <ul className="text-xs text-slate-700 space-y-0.5">
              {summary.data!.topPages.map((p) => (
                <li key={p.path} className="flex items-center justify-between gap-2">
                  <span className="truncate max-w-[18rem]">{p.path || "(unset)"}</span>
                  <span className="font-medium text-slate-900">{p.views.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Inline error surface — only when there's a config gap */}
        {configured && summary.isError && (
          <p className="text-xs text-amber-700">
            {summary.error instanceof Error ? summary.error.message : "GA4 summary unavailable"}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              window.open("https://analytics.google.com", "_blank", "noopener,noreferrer")
            }
            data-testid="open-ga4"
          >
            Open GA4 <ExternalLink className="w-3 h-3 ml-1" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              window.open(
                "https://analytics.google.com/analytics/web/#/p537753613/admin/streams/table/",
                "_blank",
                "noopener,noreferrer",
              )
            }
            data-testid="ga4-configuration"
          >
            Configuration <ExternalLink className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SeoIntegrationsPage() {
  usePageTitle("SEO Integrations");
  const qc = useQueryClient();
  const [bingApiKey, setBingApiKey] = useState("");
  const [bingEmail, setBingEmail] = useState("");
  const [bingError, setBingError] = useState<string | null>(null);
  const [calloutKind, setCalloutKind] = useState<"connected" | "error" | null>(null);
  const [calloutMessage, setCalloutMessage] = useState<string | null>(null);

  // Read ?status= for OAuth callback feedback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (!status) return;
    if (status === "connected") {
      setCalloutKind("connected");
      setCalloutMessage("Google connected. GSC, GA4, and GBP scopes are now authorized.");
    } else if (status === "state-mismatch" || status === "state-expired") {
      setCalloutKind("error");
      setCalloutMessage("OAuth state expired or mismatched. Please retry the Connect button.");
    } else if (status === "exchange-failed") {
      setCalloutKind("error");
      setCalloutMessage("Google rejected the authorization. Verify the OAuth client and redirect URI.");
    }
    // Clean the URL so a refresh doesn't replay the message.
    window.history.replaceState({}, "", "/admin/integrations/google");
  }, []);

  const { data, isLoading } = useQuery<StatusResponse>({
    queryKey: ["/api/admin/integrations/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/integrations/status", { credentials: "include" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const connectGoogle = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/integrations/google/authorize", { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `authorize ${res.status}`);
      }
      return res.json() as Promise<{ authorize_url: string }>;
    },
    onSuccess: ({ authorize_url }) => {
      window.location.href = authorize_url;
    },
    onError: (err: Error) => {
      setCalloutKind("error");
      setCalloutMessage(err.message);
    },
  });

  const connectBing = useMutation({
    mutationFn: async () => {
      setBingError(null);
      const res = await fetch("/api/admin/integrations/bing/connect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: bingApiKey.trim(), accountEmail: bingEmail.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Bing rejected the key");
      return body;
    },
    onSuccess: () => {
      setBingApiKey("");
      setBingEmail("");
      qc.invalidateQueries({ queryKey: ["/api/admin/integrations/status"] });
    },
    onError: (err: Error) => setBingError(err.message),
  });

  const prepareGbp = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/integrations/gbp/prepare", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`gbp ${res.status}`);
      return res.json();
    },
  });

  const disconnect = useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(`/api/admin/integrations/disconnect/${provider}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`disconnect ${res.status}`);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/integrations/status"] }),
  });

  return (
    <AdminLayout>
      <div data-theme="light" data-cue-allowed-multiple className="space-y-4">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-slate-900">SEO Integrations</h2>
          <HelpCue>
            Connect once. After bootstrap, sitemap submission, indexing requests, analytics, and
            review monitoring run unattended.
          </HelpCue>
        </div>

        {/* Status banner from OAuth callback */}
        {calloutKind && calloutMessage && (
          <div
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
              calloutKind === "connected"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
            data-testid="seo-callout"
          >
            {calloutKind === "connected" ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 mt-0.5" />
            )}
            <p className="flex-1">{calloutMessage}</p>
            <button
              type="button"
              onClick={() => {
                setCalloutKind(null);
                setCalloutMessage(null);
              }}
              className="text-xs underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Config warnings */}
        {data && !data.google_oauth_configured && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <span>
              Google OAuth not configured. Add <code className="font-mono">GOOGLE_OAUTH_CLIENT_ID</code> and
              <code className="font-mono"> GOOGLE_OAUTH_CLIENT_SECRET</code> to Doppler{" "}
              <code className="font-mono">wefixtrades/prd</code>, then redeploy.
            </span>
          </div>
        )}

        {/* Provider cards — each card is its own context with its own help cue. */}
        <div data-cue-allowed-multiple className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Google Search Console */}
          <Card className="border border-slate-200">
            <CardContent className="p-4 space-y-2">
              <HelpCue>One OAuth tap connects GSC + GA4 + GBP. Sitemap auto-submits.</HelpCue>
              <div className="flex items-start gap-3">
                <Search className="w-8 h-8 text-blue-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900">Google Search Console</h3>
                  <p className="text-sm text-slate-600">
                    Auto-submit sitemap, monitor rankings, request indexing on every deploy.
                  </p>
                  {data?.google.connected && data.google.account_email && (
                    <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Connected as {data.google.account_email}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => connectGoogle.mutate()}
                  disabled={!data?.google_oauth_configured || connectGoogle.isPending}
                  data-testid="connect-google"
                >
                  {data?.google.connected ? "Reconnect" : "Connect Google"}
                </Button>
                {data?.google.connected && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => disconnect.mutate("google")}
                    disabled={disconnect.isPending}
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Bing Webmaster */}
          <Card className="border border-slate-200">
            <CardContent className="p-4 space-y-2">
              <HelpCue>
                Generate an API key at bing.com/webmasters → Settings → API Access, then paste below.
              </HelpCue>
              <div className="flex items-start gap-3">
                <Globe className="w-8 h-8 text-teal-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900">Bing Webmaster Tools</h3>
                  <p className="text-sm text-slate-600">
                    Submit sitemap + per-URL index requests to Bing (powers ChatGPT search results).
                  </p>
                  {data?.bing.connected && (
                    <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Connected
                      {data.bing.account_email ? ` as ${data.bing.account_email}` : ""}
                    </p>
                  )}
                </div>
              </div>

              {!data?.bing.connected && (
                <div className="space-y-2 pt-1">
                  <div className="space-y-1">
                    <Label htmlFor="bing-api-key" className="text-xs text-slate-700">
                      Bing API key
                    </Label>
                    <Input
                      id="bing-api-key"
                      type="password"
                      value={bingApiKey}
                      onChange={(e) => setBingApiKey(e.target.value)}
                      placeholder="paste Bing Webmaster API key"
                      data-testid="bing-api-key"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="bing-email" className="text-xs text-slate-700">
                      Account email (optional)
                    </Label>
                    <Input
                      id="bing-email"
                      type="email"
                      value={bingEmail}
                      onChange={(e) => setBingEmail(e.target.value)}
                      placeholder="for the connection label"
                    />
                  </div>
                  {bingError && <p className="text-xs text-red-700">{bingError}</p>}
                  <Button
                    size="sm"
                    onClick={() => connectBing.mutate()}
                    disabled={bingApiKey.length < 8 || connectBing.isPending}
                    data-testid="connect-bing"
                  >
                    Connect Bing
                  </Button>
                </div>
              )}

              {data?.bing.connected && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => disconnect.mutate("bing")}
                    disabled={disconnect.isPending}
                  >
                    Disconnect
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* GA4 */}
          <Ga4Card configured={Boolean(data?.ga4.configured)} measurementId={data?.ga4.measurement_id ?? null} />

          {/* GBP */}
          <Card className="border border-slate-200">
            <CardContent className="p-4 space-y-2">
              <HelpCue>
                Google must approve the business.manage scope (3–14 day review) before full
                automation. Until then, use the prepared draft to seed the listing manually.
              </HelpCue>
              <div className="flex items-start gap-3">
                <MapPin className="w-8 h-8 text-rose-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900">Google Business Profile</h3>
                  <p className="text-sm text-slate-600">
                    Listing creation + verification, then auto-sync hours, weekly posts, review alerts.
                  </p>
                  {data?.gbp_api_available && (
                    <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> business.manage scope granted
                    </p>
                  )}
                  {data?.gbp.connected && (
                    <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Listing connected
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => prepareGbp.mutate()}
                  disabled={prepareGbp.isPending}
                  data-testid="prepare-gbp"
                >
                  Prepare Listing Draft
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.open("https://business.google.com", "_blank", "noopener,noreferrer")
                  }
                >
                  Open GBP <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              </div>
              {prepareGbp.data && (
                <details className="text-xs text-slate-700 pt-1">
                  <summary className="cursor-pointer font-medium">View draft + steps</summary>
                  <pre className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded text-[11px] overflow-auto">
                    {JSON.stringify(prepareGbp.data, null, 2)}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>
        </div>

        <BingAutomationCard />

        {/* DNS readiness */}
        <Card className="border border-slate-200">
          <CardContent className="p-4 space-y-1">
            <HelpCue>
              When Google or Bing requests TXT verification, the DNS helper writes the record
              automatically if Cloudflare is configured.
            </HelpCue>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-800">
                <strong>DNS verification:</strong>{" "}
                {data?.cloudflare_configured ? (
                  <span className="text-emerald-700">Cloudflare automation enabled</span>
                ) : (
                  <span className="text-amber-700">
                    Manual — add CLOUDFLARE_API_TOKEN to Doppler for one-tap verification
                  </span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Recent indexing activity */}
        <Card className="border border-slate-200">
          <CardContent className="p-4 space-y-2">
            <HelpCue>Last 20 sitemap submissions and per-URL indexing requests.</HelpCue>
            <h3 className="font-semibold text-slate-900">Recent SEO activity</h3>
            {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
            {!isLoading && data && data.recent_history.length === 0 && (
              <p className="text-sm text-slate-500">
                No activity yet. After connect, sitemap submissions appear here.
              </p>
            )}
            {!isLoading && data && data.recent_history.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-600">
                    <tr>
                      <th className="text-left p-1.5">When</th>
                      <th className="text-left p-1.5">Source</th>
                      <th className="text-left p-1.5">Action</th>
                      <th className="text-left p-1.5">URL</th>
                      <th className="text-left p-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_history.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="p-1.5 text-slate-700">
                          {new Date(row.performed_at).toLocaleString()}
                        </td>
                        <td className="p-1.5 text-slate-700">{row.source}</td>
                        <td className="p-1.5 text-slate-700">{row.action}</td>
                        <td className="p-1.5 text-slate-600 truncate max-w-xs">{row.url}</td>
                        <td className="p-1.5 text-slate-700">{row.status ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
