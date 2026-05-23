/**
 * Trade-facing portal page for the embeddable TradeLine chat widget.
 *
 * Mounted at /portal/tradeline/chat-widget.
 *
 * Shows the copy/paste snippet for the trade's site, customization
 * controls (greeting / accent color / position), origin allowlist,
 * live preview, and the "have us install it for you" upsell card
 * linking to the install service from PR #147.
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useCopilotForm } from "@/context/CopilotFormContext";
import PortalLayout from "@/components/portal/PortalLayout";
import BackButton from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, ExternalLink, Wrench, Power } from "lucide-react";

interface WidgetSite {
  id: number;
  site_key: string;
  enabled: boolean;
  display_name: string | null;
  greeting: string | null;
  accent_color: string | null;
  position: "bottom-right" | "bottom-left" | "floating";
  allowed_origins: string | null;
}

interface SiteResponse {
  site: WidgetSite;
  tradeType: string | null;
}

const DEFAULT_ACCENT = "#0d3cfc";
const DEFAULT_GREETING = "Hi there — how can we help today?";

function buildSnippet(host: string, siteKey: string): string {
  return `<script async src="${host}/widget/v1.js" data-site-key="${siteKey}"></script>`;
}

export default function PortalChatWidgetSetup() {
  usePageTitle("Chat widget setup");
  const queryClient = useQueryClient();
  const state = useQuery<SiteResponse>({
    queryKey: ["/api/portal/widget/site"],
    queryFn: () => fetch("/api/portal/widget/site", { credentials: "include" }).then((r) => r.json()),
  });

  const [draft, setDraft] = useState<Partial<WidgetSite>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.data?.site && Object.keys(draft).length === 0) {
      setDraft({
        display_name: state.data.site.display_name ?? "",
        greeting: state.data.site.greeting ?? DEFAULT_GREETING,
        accent_color: state.data.site.accent_color ?? DEFAULT_ACCENT,
        position: state.data.site.position,
        allowed_origins: state.data.site.allowed_origins ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data]);

  const patch = useMutation({
    mutationFn: async (body: Partial<WidgetSite>) => {
      const res = await fetch("/api/portal/widget/site", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/widget/site"] });
    },
  });

  /* Phase 1c: register the widget customization form with the copilot.
   * Enabled once the site has loaded (the same point the draft is seeded). */
  const WIDGET_POSITIONS = ["bottom-right", "bottom-left", "floating"];
  useCopilotForm({
    formLabel: "Chat widget setup",
    fields: [
      { key: "display_name", label: "Header display name" },
      { key: "greeting", label: "Greeting message" },
      { key: "accent_color", label: "Accent color (hex, e.g. #0d3cfc)" },
      { key: "position", label: `Position (one of: ${WIDGET_POSITIONS.join(", ")})` },
      { key: "allowed_origins", label: "Allowed domains (comma-separated, optional)" },
    ],
    values: {
      display_name: (draft.display_name as string) ?? "",
      greeting: (draft.greeting as string) ?? "",
      accent_color: (draft.accent_color as string) ?? "",
      position: (draft.position as string) ?? "",
      allowed_origins: (draft.allowed_origins as string) ?? "",
    },
    onApply: (fills) => {
      setDraft((d) => {
        const next = { ...d };
        for (const fill of fills) {
          switch (fill.field_key) {
            case "display_name": next.display_name = fill.value; break;
            case "greeting": next.greeting = fill.value; break;
            case "accent_color": next.accent_color = fill.value; break;
            case "allowed_origins": next.allowed_origins = fill.value; break;
            case "position":
              if (WIDGET_POSITIONS.includes(fill.value)) {
                next.position = fill.value as WidgetSite["position"];
              }
              break;
          }
        }
        return next;
      });
    },
    enabled: !!state.data?.site,
  });

  if (state.isLoading) {
    return (
      <PortalLayout>
        <div data-theme="light" className="max-w-3xl mx-auto p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64" />
        </div>
      </PortalLayout>
    );
  }

  if (!state.data) {
    return (
      <PortalLayout>
        <div className="max-w-3xl mx-auto p-6 text-sm text-rose-700">Failed to load widget settings.</div>
      </PortalLayout>
    );
  }

  const site = state.data.site;
  const host = typeof window !== "undefined" ? window.location.origin : "https://wefixtrades.com";
  const snippet = buildSnippet(host, site.site_key);

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <PortalLayout>
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
        <BackButton to="/portal/services" label="Back to services" />
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Chat widget for your website</h1>
            <p className="text-sm text-gray-600 mt-1">
              Drop this snippet on your site and customers can chat with your AI receptionist
              right from the page they're on. Same AI brain that answers your phone.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={site.enabled ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-gray-50 border-gray-200 text-gray-700"}>
              <Power className="w-3 h-3 mr-1" /> {site.enabled ? "Live" : "Disabled"}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => patch.mutate({ enabled: !site.enabled })}
              disabled={patch.isPending}
            >
              {site.enabled ? "Disable" : "Enable"}
            </Button>
          </div>
        </div>

        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Your install snippet</h2>
            <Button type="button" size="sm" onClick={copySnippet} variant="outline">
              {copied ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto font-mono break-all whitespace-pre-wrap">{snippet}</pre>
          <p className="text-xs text-gray-600">
            Paste this just before <code className="bg-gray-100 px-1 rounded">{"</body>"}</code> on every page where you want chat to appear.
            Works on WordPress, Wix, Squarespace, Shopify, or custom sites.
          </p>
          <Card className="p-3 bg-indigo-50 border-indigo-200">
            <div className="flex items-start gap-3">
              <Wrench className="w-4 h-4 text-indigo-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Want us to install it for you?</p>
                <p className="text-xs text-gray-700 mt-0.5">Free on Pro, $79 on Starter. We handle the paste, test, and confirm.</p>
              </div>
              <Button asChild variant="default" size="sm">
                <Link href="/portal/tradeline/chat-widget/install">Install for me</Link>
              </Button>
            </div>
          </Card>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Customization</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="display_name">Header display name</Label>
              <Input
                id="display_name"
                value={(draft.display_name as string) || ""}
                onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
                placeholder="Your business name"
              />
            </div>
            <div>
              <Label htmlFor="accent">Accent color</Label>
              <div className="flex gap-2">
                <Input
                  id="accent"
                  value={(draft.accent_color as string) || ""}
                  onChange={(e) => setDraft({ ...draft, accent_color: e.target.value })}
                  placeholder="#0d3cfc"
                />
                <input
                  type="color"
                  value={(draft.accent_color as string) || DEFAULT_ACCENT}
                  onChange={(e) => setDraft({ ...draft, accent_color: e.target.value })}
                  className="h-9 w-9 rounded-md border border-gray-200 p-0 cursor-pointer"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="greeting">Greeting message</Label>
              <Input
                id="greeting"
                value={(draft.greeting as string) || ""}
                onChange={(e) => setDraft({ ...draft, greeting: e.target.value })}
                placeholder={DEFAULT_GREETING}
              />
            </div>
            <div>
              <Label>Position</Label>
              <select
                value={(draft.position as string) || site.position}
                onChange={(e) => setDraft({ ...draft, position: e.target.value as any })}
                className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="bottom-right">Bottom-right</option>
                <option value="bottom-left">Bottom-left</option>
                <option value="floating">Floating</option>
              </select>
            </div>
            <div>
              <Label htmlFor="origins">Allowed domains (optional)</Label>
              <Textarea
                id="origins"
                value={(draft.allowed_origins as string) || ""}
                onChange={(e) => setDraft({ ...draft, allowed_origins: e.target.value })}
                placeholder="yourcompany.com, blog.yourcompany.com"
                rows={2}
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-gray-500 mt-1">Comma-separated. Leave empty to allow any domain.</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => patch.mutate(draft)}
              disabled={patch.isPending}
            >
              {patch.isPending ? "Saving…" : "Save customization"}
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold text-gray-900 mb-2">Live preview</h2>
          <p className="text-xs text-gray-600 mb-3">
            This is exactly how your widget appears to visitors. Tap the chat bubble to try it —
            it talks to the live AI brain using your niche template{state.data.tradeType ? ` (${state.data.tradeType})` : ""}.
          </p>
          <div className="relative rounded-xl border border-gray-200 bg-gray-50 h-64 overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
              Your website goes here
            </div>
            <PreviewBubble
              accent={(draft.accent_color as string) || DEFAULT_ACCENT}
              position={(draft.position as string) || site.position}
            />
          </div>
          <p className="text-[11px] text-gray-500 mt-3 inline-flex items-center gap-1">
            For the real chat experience, embed the snippet on your live site and open it.
            <ExternalLink className="w-3 h-3" />
          </p>
        </Card>
      </div>
    </PortalLayout>
  );
}

function PreviewBubble({ accent, position }: { accent: string; position: string }) {
  const style: React.CSSProperties = {
    position: "absolute",
    bottom: 16,
    background: accent,
    color: "#fff",
    borderRadius: 999,
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 600,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  };
  if (position === "bottom-left") {
    style.left = 16;
  } else {
    style.right = 16;
  }
  return <div style={style}>💬 Chat with us</div>;
}
