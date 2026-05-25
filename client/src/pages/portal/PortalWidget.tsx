import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Code, Copy, CheckCircle2, Lock, Loader2, Star, ExternalLink, ChevronLeft,
  Info, Smartphone, Tablet, Monitor, BookOpen, AlertCircle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";

/* Q3: small reusable back-to-parent link. Mirrors the pattern used by
   PortalServiceDetail / PortalTicketDetail / PaymentMethodsPage. */
function BackToReviews() {
  return (
    <Link
      href="/portal/reviews"
      className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
      data-testid="back-to-reviews"
    >
      <ChevronLeft className="w-3.5 h-3.5" /> Back to Reviews
    </Link>
  );
}

interface WidgetData {
  active: boolean;
  widgetToken?: string;
  badgeAccess?: boolean;
  carouselAccess?: boolean;
  widgetAccess?: boolean;
  settings?: {
    enabled: boolean;
    type: string;
    min_rating: number;
    max_reviews: number;
    show_reviewer_name: boolean;
    show_date: boolean;
  };
  /** All review platforms the widget supports pulling from. */
  sources?: string[];
  /** Sources the client has actually connected. */
  connectedSources?: string[];
  embedCode?: {
    badge: string;
    carousel: string | null;
  };
}

type WidgetType = "badge" | "carousel";
type Viewport = "mobile" | "tablet" | "desktop";

const VIEWPORT_WIDTHS: Record<Viewport, number> = {
  mobile: 375,
  tablet: 768,
  desktop: 1024,
};

/* Friendly labels for the sources badge. */
const SOURCE_LABELS: Record<string, string> = {
  google: "Google Business Profile",
  facebook: "Facebook / Meta",
  yelp: "Yelp",
  trustpilot: "Trustpilot",
};

function formatSourcesLabel(connected: string[] | undefined): string {
  if (!connected || connected.length === 0) return "No sources connected yet";
  if (connected.length === 1) return SOURCE_LABELS[connected[0]] ?? connected[0];
  if (connected.length === 2) {
    return `${SOURCE_LABELS[connected[0]]} + ${SOURCE_LABELS[connected[1]]}`;
  }
  return `${connected.length} connected sources`;
}

/* ─── Live widget preview pane ─────────────────────────────────────
 * Renders an iframe pointed at the real /widget/preview HTML route on
 * our origin. The iframe loads the same embed.js the customer pastes
 * onto their site, so what they see here is byte-for-byte what their
 * site visitors will see. Width is constrained to the selected
 * viewport so customers can preview mobile/tablet/desktop. */
interface WidgetPreviewProps {
  token: string;
  type: WidgetType;
  /** Bumped on settings change so we force an iframe reload to reflect
   * new min_rating / max_reviews / show_* toggles. */
  reloadKey: number;
}

function WidgetPreview({ token, type, reloadKey }: WidgetPreviewProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const widthPx = VIEWPORT_WIDTHS[viewport];
  const src = `/widget/preview?token=${encodeURIComponent(token)}&type=${type}&v=${reloadKey}`;

  return (
    <Card className="p-4 space-y-3" data-testid="widget-preview-card">
      {/* Help cue — top-left, per design system Rule 4. */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Live preview</p>
          <p className="text-xs text-gray-400 mt-0.5">
            What visitors to your site will actually see — pulls your real reviews
          </p>
        </div>
        <div
          className="inline-flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-md"
          role="group"
          aria-label="Preview viewport size"
        >
          <button
            type="button"
            onClick={() => setViewport("mobile")}
            aria-pressed={viewport === "mobile"}
            className={`px-2 h-7 rounded text-xs inline-flex items-center gap-1 transition-colors ${
              viewport === "mobile"
                ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                : "text-gray-500 hover:text-gray-700"
            }`}
            data-testid="viewport-mobile"
          >
            <Smartphone className="w-3.5 h-3.5" /> 375
          </button>
          <button
            type="button"
            onClick={() => setViewport("tablet")}
            aria-pressed={viewport === "tablet"}
            className={`px-2 h-7 rounded text-xs inline-flex items-center gap-1 transition-colors ${
              viewport === "tablet"
                ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                : "text-gray-500 hover:text-gray-700"
            }`}
            data-testid="viewport-tablet"
          >
            <Tablet className="w-3.5 h-3.5" /> 768
          </button>
          <button
            type="button"
            onClick={() => setViewport("desktop")}
            aria-pressed={viewport === "desktop"}
            className={`px-2 h-7 rounded text-xs inline-flex items-center gap-1 transition-colors ${
              viewport === "desktop"
                ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                : "text-gray-500 hover:text-gray-700"
            }`}
            data-testid="viewport-desktop"
          >
            <Monitor className="w-3.5 h-3.5" /> 1024
          </button>
        </div>
      </div>

      {/* Preview frame — centered, bordered, scrollable on narrow parents. */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-auto p-3 flex justify-center">
        <iframe
          key={`${type}-${reloadKey}-${viewport}`}
          src={src}
          title="Review widget preview"
          width={widthPx}
          height={type === "badge" ? 140 : 280}
          className="bg-background border border-gray-200 rounded shrink-0"
          style={{ maxWidth: "100%" }}
          sandbox="allow-scripts allow-same-origin"
          data-testid="widget-preview-iframe"
        />
      </div>
    </Card>
  );
}

/* ─── Install instructions modal ─────────────────────────────────── */
const INSTALL_PLATFORMS = [
  { id: "wordpress", label: "WordPress" },
  { id: "wix", label: "Wix" },
  { id: "squarespace", label: "Squarespace" },
  { id: "shopify", label: "Shopify" },
  { id: "html", label: "Plain HTML" },
] as const;

type InstallPlatformId = (typeof INSTALL_PLATFORMS)[number]["id"];

interface InstallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snippet: string;
  sourcesLabel: string;
  hasConnectedSource: boolean;
}

function InstallModal({ open, onOpenChange, snippet, sourcesLabel, hasConnectedSource }: InstallModalProps) {
  const { toast } = useToast();
  const [platform, setPlatform] = useState<InstallPlatformId>("wordpress");

  function copySnippet() {
    navigator.clipboard.writeText(snippet);
    toast({ title: "Embed code copied" });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl w-[calc(100vw-2rem)] sm:w-auto max-h-[90vh] overflow-y-auto"
        data-testid="install-instructions-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-brand-blue" />
            How to install the review widget
          </DialogTitle>
          <DialogDescription>
            Pick your website platform below — we'll show the exact steps.
          </DialogDescription>
        </DialogHeader>

        {/* What it does + where reviews come from. */}
        <div className="space-y-2 text-sm text-gray-700">
          <p>
            The widget shows your best reviews on your website, so visitors trust you before
            they call. It updates automatically whenever a new review comes in.
          </p>
          <div className="flex items-start gap-2 p-3 rounded-md bg-gray-50 border border-gray-200">
            <Info className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-800">Reviews are pulled from:</span>{" "}
              {sourcesLabel}.
              {!hasConnectedSource && (
                <>
                  {" "}
                  <Link
                    href="/portal/reviews"
                    className="text-brand-blue hover:underline"
                  >
                    Connect a review source
                  </Link>{" "}
                  so the widget has something to display.
                </>
              )}
            </div>
          </div>
        </div>

        {/* Platform tabs. */}
        <Tabs value={platform} onValueChange={(v) => setPlatform(v as InstallPlatformId)}>
          <TabsList className="grid grid-cols-5 w-full h-auto">
            {INSTALL_PLATFORMS.map((p) => (
              <TabsTrigger key={p.id} value={p.id} className="text-xs h-8" data-testid={`install-tab-${p.id}`}>
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="wordpress" className="space-y-3 mt-3">
            <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
              <li>In your WordPress admin, open <span className="font-medium">Appearance → Theme File Editor</span> (or install a code-snippet plugin like WPCode).</li>
              <li>Open <code className="px-1 py-0.5 bg-gray-100 rounded text-xs">footer.php</code> and paste the snippet below just before the closing <code className="px-1 py-0.5 bg-gray-100 rounded text-xs">&lt;/body&gt;</code> tag.</li>
              <li>Click <span className="font-medium">Update File</span>. Refresh your site to confirm the widget appears.</li>
            </ol>
          </TabsContent>

          <TabsContent value="wix" className="space-y-3 mt-3">
            <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
              <li>Open your Wix dashboard and go to <span className="font-medium">Settings → Custom Code</span>.</li>
              <li>Click <span className="font-medium">+ Add Custom Code</span>, paste the snippet below, and choose <span className="font-medium">Body — end</span> as the placement.</li>
              <li>Apply to <span className="font-medium">All pages</span> (or just the pages you want), then click <span className="font-medium">Apply</span>.</li>
            </ol>
          </TabsContent>

          <TabsContent value="squarespace" className="space-y-3 mt-3">
            <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
              <li>Open <span className="font-medium">Settings → Advanced → Code Injection</span>.</li>
              <li>Paste the snippet below into the <span className="font-medium">Footer</span> field.</li>
              <li>Click <span className="font-medium">Save</span> and reload your site.</li>
            </ol>
            <p className="text-xs text-gray-500">Code injection requires a Business plan or higher on Squarespace.</p>
          </TabsContent>

          <TabsContent value="shopify" className="space-y-3 mt-3">
            <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
              <li>Open <span className="font-medium">Online Store → Themes</span> and click <span className="font-medium">Edit code</span> on your current theme.</li>
              <li>Open <code className="px-1 py-0.5 bg-gray-100 rounded text-xs">theme.liquid</code> and paste the snippet just before the closing <code className="px-1 py-0.5 bg-gray-100 rounded text-xs">&lt;/body&gt;</code> tag.</li>
              <li>Click <span className="font-medium">Save</span>.</li>
            </ol>
          </TabsContent>

          <TabsContent value="html" className="space-y-3 mt-3">
            <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
              <li>Open the HTML file (or template) for the page where you want the widget to appear.</li>
              <li>Paste the snippet below where you want the widget to render. It will appear right at that spot.</li>
              <li>Save and re-upload to your web host.</li>
            </ol>
          </TabsContent>
        </Tabs>

        {/* The snippet itself, syntax-styled. */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Your snippet</p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={copySnippet}
              data-testid="install-modal-copy"
            >
              <Copy className="w-3 h-3 mr-1" /> Copy
            </Button>
          </div>
          <pre className="bg-gray-900 text-gray-100 rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
            <code>{snippet}</code>
          </pre>
        </div>

        {/* FAQ. */}
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Common questions</p>
          <details className="text-sm text-gray-700">
            <summary className="cursor-pointer font-medium text-gray-800">Will it slow my site down?</summary>
            <p className="mt-1 text-xs text-gray-600">
              No. The widget script loads asynchronously and the review data is cached for 5
              minutes, so it doesn't block page rendering.
            </p>
          </details>
          <details className="text-sm text-gray-700">
            <summary className="cursor-pointer font-medium text-gray-800">Can I customize how it looks?</summary>
            <p className="mt-1 text-xs text-gray-600">
              You control which reviews show (minimum rating, max count, name + date toggles)
              from the Widget Settings panel on this page. Layout is fixed to keep the widget
              tidy on any site.
            </p>
          </details>
          <details className="text-sm text-gray-700">
            <summary className="cursor-pointer font-medium text-gray-800">What if I disable the widget?</summary>
            <p className="mt-1 text-xs text-gray-600">
              The snippet stays on your site but stops rendering — no broken layout, no error
              messages for visitors.
            </p>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PortalWidget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  /* Modal state + which snippet to show in the install instructions. */
  const [installModalSnippet, setInstallModalSnippet] = useState<string | null>(null);
  /* Bumped on every settings save so the preview iframe reloads and
     reflects the new min_rating / max_reviews / show_* values. */
  const [previewReloadKey, setPreviewReloadKey] = useState(0);

  const { data, isLoading } = useQuery<WidgetData>({
    queryKey: ["/api/portal/reputation/widget"],
    queryFn: async () => {
      const res = await fetch("/api/portal/reputation/widget", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const res = await apiRequest("PATCH", "/api/portal/reputation/widget", updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/reputation/widget"] });
      toast({ title: "Widget settings saved" });
      // Force the live preview iframe to reload with the new settings.
      setPreviewReloadKey((k) => k + 1);
    },
  });

  function copyCode(code: string, label: string) {
    navigator.clipboard.writeText(code);
    setCopied(label);
    toast({ title: "Embed code copied" });
    setTimeout(() => setCopied(null), 3000);
  }

  /* Phase 1c: register the review-widget settings with the copilot. The
   * page persists each control immediately, so applied fills go straight
   * to updateMutation. Numbers/booleans are coerced and validated against
   * the allowed option sets. Enabled only when the widget service is
   * active (the same condition that renders the settings controls). */
  const MIN_RATING_OPTIONS = [3, 4, 5];
  const MAX_REVIEWS_OPTIONS = [5, 10, 20];
  useCopilotForm({
    formLabel: "Review widget settings",
    fields: [
      { key: "enabled", label: "Widget enabled (true | false)" },
      { key: "min_rating", label: `Minimum star rating (one of: ${MIN_RATING_OPTIONS.join(", ")})` },
      { key: "max_reviews", label: `Max reviews shown (one of: ${MAX_REVIEWS_OPTIONS.join(", ")})` },
      { key: "show_reviewer_name", label: "Show reviewer names (true | false)" },
      { key: "show_date", label: "Show review dates (true | false)" },
    ],
    values: {
      enabled: data?.settings?.enabled ?? false,
      min_rating: data?.settings?.min_rating ?? 5,
      max_reviews: data?.settings?.max_reviews ?? 5,
      show_reviewer_name: data?.settings?.show_reviewer_name ?? true,
      show_date: data?.settings?.show_date ?? true,
    },
    onApply: (fills) => {
      const patch: Record<string, any> = {};
      for (const f of fills) {
        switch (f.field_key) {
          case "enabled":
          case "show_reviewer_name":
          case "show_date":
            if (f.value === "true" || f.value === "false") patch[f.field_key] = f.value === "true";
            break;
          case "min_rating": {
            const n = Number(f.value);
            if (MIN_RATING_OPTIONS.includes(n)) patch.min_rating = n;
            break;
          }
          case "max_reviews": {
            const n = Number(f.value);
            if (MAX_REVIEWS_OPTIONS.includes(n)) patch.max_reviews = n;
            break;
          }
        }
      }
      if (Object.keys(patch).length > 0) updateMutation.mutate(patch);
    },
    enabled: !!data?.active,
  });

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </PortalLayout>
    );
  }

  if (!data?.active) {
    return (
      <PortalLayout>
        <div className="space-y-4">
          <BackToReviews />
        </div>
        <div className="py-12 text-center space-y-4">
          <Code className="w-12 h-12 text-gray-300 mx-auto" />
          <h2 className="text-lg font-semibold text-gray-900">Review Widget</h2>
          <p className="text-sm text-gray-500">Display your best reviews on your website. Available with ReputationShield.</p>
        </div>
      </PortalLayout>
    );
  }

  const settings = data.settings!;
  const embedCode = data.embedCode!;
  const widgetToken = data.widgetToken!;
  const connectedSources = data.connectedSources ?? [];
  const hasConnectedSource = connectedSources.length > 0;
  const sourcesLabel = formatSourcesLabel(connectedSources);

  return (
    <PortalLayout>
      <div data-theme="light" className="space-y-6">
        <BackToReviews />
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Review Widget</h2>
          <p className="text-sm text-gray-500">Show your best reviews on your website with a simple code snippet</p>
        </div>

        {/* How it works */}
        <Card className="p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">How it works</p>
          <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
            <li>Copy the embed code below</li>
            <li>Paste it into your website where you want reviews to appear (need exact steps? click <span className="font-medium">How to install</span>)</li>
            <li>Your best reviews show up automatically and stay up to date</li>
          </ol>
        </Card>

        {/* Source clarity — tells the customer which review platforms feed
            the widget, and nudges them to connect a source if none yet. */}
        <Card className="p-4">
          <div className="flex items-start gap-2">
            {hasConnectedSource ? (
              <Info className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pulls from</p>
              <p className="text-sm text-gray-800 mt-0.5" data-testid="widget-sources-label">{sourcesLabel}</p>
              {!hasConnectedSource && (
                <p className="text-xs text-gray-500 mt-1">
                  Connect Google or another platform so your widget has reviews to show.{" "}
                  <Link href="/portal/reviews" className="text-brand-blue hover:underline" data-testid="connect-source-link">
                    Connect a source
                  </Link>
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Widget toggle */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Widget Enabled</p>
              <p className="text-xs text-gray-400">When disabled, the widget won't show on your site</p>
            </div>
            <button
              role="switch"
              aria-checked={settings.enabled}
              aria-label="Toggle widget enabled"
              className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-brand-blue/30 ${settings.enabled ? "bg-brand-blue" : "bg-gray-300"}`}
              onClick={() => updateMutation.mutate({ enabled: !settings.enabled })}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.enabled ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>
        </Card>

        {/* Badge Widget */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Badge Widget</p>
              <p className="text-xs text-gray-400">Compact rating summary — great for headers, sidebars, or footers</p>
            </div>
            <Badge variant="secondary" className="text-[10px] bg-green-50 text-green-700">Available</Badge>
          </div>

          <WidgetPreview token={widgetToken} type="badge" reloadKey={previewReloadKey} />

          <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
            <code>{embedCode.badge}</code>
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => copyCode(embedCode.badge, "badge")}
              data-testid="copy-badge"
            >
              {copied === "badge" ? (
                <><CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Copied</>
              ) : (
                <><Copy className="w-3.5 h-3.5 mr-1" /> Copy Badge Code</>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setInstallModalSnippet(embedCode.badge)}
              data-testid="install-badge"
            >
              <BookOpen className="w-3.5 h-3.5 mr-1" /> How to install
            </Button>
          </div>
        </Card>

        {/* Carousel Widget */}
        <Card className={`p-4 space-y-3 ${!data.carouselAccess ? "opacity-70" : ""}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Carousel Widget</p>
              <p className="text-xs text-gray-400">Rotating reviews with star ratings and text — great for landing pages</p>
            </div>
            {data.carouselAccess ? (
              <Badge variant="secondary" className="text-[10px] bg-green-50 text-green-700">Available</Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] bg-gray-100 text-gray-500">
                <Lock className="w-3 h-3 mr-1" /> Pro Plan
              </Badge>
            )}
          </div>
          {data.carouselAccess && embedCode.carousel ? (
            <>
              <WidgetPreview token={widgetToken} type="carousel" reloadKey={previewReloadKey} />

              <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
                <code>{embedCode.carousel}</code>
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => copyCode(embedCode.carousel!, "carousel")}
                  data-testid="copy-carousel"
                >
                  {copied === "carousel" ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-600" /> Copied</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5 mr-1" /> Copy Carousel Code</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => setInstallModalSnippet(embedCode.carousel!)}
                  data-testid="install-carousel"
                >
                  <BookOpen className="w-3.5 h-3.5 mr-1" /> How to install
                </Button>
              </div>
            </>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-2 text-sm text-gray-500">
              <Lock className="w-4 h-4 shrink-0" />
              Carousel widget is available on the Pro plan. Upgrade to access rotating review displays.
            </div>
          )}
        </Card>

        {/* Settings */}
        <Card className="p-4 space-y-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Widget Settings</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Minimum Star Rating</label>
              <Select
                value={String(settings.min_rating)}
                onValueChange={(v) => updateMutation.mutate({ min_rating: parseInt(v) })}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 stars only</SelectItem>
                  <SelectItem value="4">4+ stars</SelectItem>
                  <SelectItem value="3">3+ stars</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Max Reviews Shown</label>
              <Select
                value={String(settings.max_reviews)}
                onValueChange={(v) => updateMutation.mutate({ max_reviews: parseInt(v) })}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 reviews</SelectItem>
                  <SelectItem value="10">10 reviews</SelectItem>
                  <SelectItem value="20">20 reviews</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between sm:col-span-2">
              <div>
                <p className="text-sm text-gray-700">Show Reviewer Names</p>
                <p className="text-xs text-gray-400">Display the name of each reviewer</p>
              </div>
              <button
                role="switch"
                aria-checked={settings.show_reviewer_name}
                aria-label="Toggle show reviewer names"
                className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-brand-blue/30 ${settings.show_reviewer_name ? "bg-brand-blue" : "bg-gray-300"}`}
                onClick={() => updateMutation.mutate({ show_reviewer_name: !settings.show_reviewer_name })}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.show_reviewer_name ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
            <div className="flex items-center justify-between sm:col-span-2">
              <div>
                <p className="text-sm text-gray-700">Show Review Dates</p>
                <p className="text-xs text-gray-400">Display when each review was posted</p>
              </div>
              <button
                role="switch"
                aria-checked={settings.show_date}
                aria-label="Toggle show review dates"
                className={`relative w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-brand-blue/30 ${settings.show_date ? "bg-brand-blue" : "bg-gray-300"}`}
                onClick={() => updateMutation.mutate({ show_date: !settings.show_date })}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.show_date ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Install instructions modal — opens when the user clicks the
          "How to install" button on either widget card. */}
      <InstallModal
        open={installModalSnippet !== null}
        onOpenChange={(open) => {
          if (!open) setInstallModalSnippet(null);
        }}
        snippet={installModalSnippet ?? ""}
        sourcesLabel={sourcesLabel}
        hasConnectedSource={hasConnectedSource}
      />
    </PortalLayout>
  );
}
