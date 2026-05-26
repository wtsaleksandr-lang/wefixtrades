/**
 * /portal/quotequick/brand — Wave 29 — branded embed styles / white-label.
 *
 * Pro/Business tier surface:
 *   - Logo URL field
 *   - Brand color picker (auto-syncs accent across widget)
 *   - Font family selector (8 web-safe + Google Fonts allowlist)
 *   - Toggle: "Show 'Powered by QuoteQuick' badge" (Business+ unlocks OFF)
 *   - Custom CSS escape hatch (Business+ only)
 *
 * Live-preview pane on the right; widget updates immediately as the
 * customer types.
 *
 * Backend: GET/POST /api/portal/quotequick/brand-settings.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Brush, Loader2, Lock, Save } from "lucide-react";
import { Link } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { cn } from "@/lib/utils";

interface BrandSettings {
  logo_url: string | null;
  brand_color: string | null;
  font_family: string;
  show_powered_by_badge: boolean;
  custom_css: string | null;
}

interface BrandSettingsResponse {
  previewMode?: boolean;
  settings: BrandSettings;
  tier: string;
  customCssAllowed: boolean;
  removeBadgeAllowed: boolean;
  fontAllowlist: string[];
}

/**
 * Smart colorizer — given a base hex, produce a complementary accent
 * via simple HSL rotation. 1-click pick that "just works" for 90% of
 * brand colors. Lifted from Elfsight's flow.
 */
function smartColorizer(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  // Naive complement: rotate hue by 180° via 1-channel inversion.
  const cr = Math.round((1 - r) * 255);
  const cg = Math.round((1 - g) * 255);
  const cb = Math.round((1 - b) * 255);
  return `#${cr.toString(16).padStart(2, "0")}${cg.toString(16).padStart(2, "0")}${cb.toString(16).padStart(2, "0")}`;
}

export default function QuoteQuickBrandSettings() {
  usePageTitle("QuoteQuick brand settings");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<BrandSettingsResponse>({
    queryKey: ["/api/portal/quotequick/brand-settings"],
    queryFn: async () => {
      const res = await fetch("/api/portal/quotequick/brand-settings", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load brand settings");
      return res.json();
    },
  });

  const [draft, setDraft] = useState<BrandSettings | null>(null);

  useEffect(() => {
    if (data?.settings && !draft) setDraft(data.settings);
  }, [data?.settings, draft]);

  const save = useMutation({
    mutationFn: async (next: BrandSettings) => {
      return apiRequest("POST", "/api/portal/quotequick/brand-settings", {
        settings: next,
      });
    },
    onSuccess: () => {
      toast({ title: "Brand settings saved" });
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/quotequick/brand-settings"],
      });
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message ?? "Try again.",
        variant: "destructive",
      });
    },
  });

  const allowedFonts = data?.fontAllowlist ?? ["system"];
  const customCssAllowed = data?.customCssAllowed ?? false;
  const removeBadgeAllowed = data?.removeBadgeAllowed ?? false;

  const previewAccent = useMemo(() => {
    return draft?.brand_color
      ? smartColorizer(draft.brand_color)
      : "#6366f1";
  }, [draft?.brand_color]);

  // Wave 29 — register the brand-settings fields with the AI copilot.
  // Applied fills land in local draft state; the tradesperson still hits
  // Save to persist.
  useCopilotForm({
    formLabel: "QuoteQuick white-label brand settings",
    fields: [
      { key: "logo_url", label: "Logo URL (https://…/logo.png)" },
      { key: "brand_color", label: "Brand color as a hex code (e.g. #6366f1)" },
      { key: "font_family", label: "Font family (system / Inter / Roboto / Open Sans / Lato / Poppins / Montserrat / Source Sans Pro / Nunito)" },
      { key: "custom_css", label: "Custom CSS (Business tier; max 4KB)" },
    ],
    values: {
      logo_url: draft?.logo_url ?? "",
      brand_color: draft?.brand_color ?? "",
      font_family: draft?.font_family ?? "system",
      custom_css: draft?.custom_css ?? "",
    },
    onApply: (fills) => {
      if (!draft) return;
      let next = { ...draft };
      for (const f of fills) {
        switch (f.field_key) {
          case "logo_url":
            next = { ...next, logo_url: f.value || null };
            break;
          case "brand_color":
            next = { ...next, brand_color: f.value || null };
            break;
          case "font_family":
            next = { ...next, font_family: f.value || "system" };
            break;
          case "custom_css":
            next = { ...next, custom_css: f.value || null };
            break;
        }
      }
      setDraft(next);
    },
  });

  if (isLoading || !draft) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground md:text-2xl">
              <Brush className="h-5 w-5" aria-hidden="true" />
              Brand settings
            </h1>
            <p className="text-sm text-muted-foreground">
              White-label the widget to match your brand. Tier:{" "}
              <span className="font-medium text-foreground">{data?.tier}</span>
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,360px)]">
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="logo_url" className="text-xs">
                Logo URL
              </Label>
              <Input
                id="logo_url"
                type="url"
                value={draft.logo_url ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, logo_url: e.target.value || null })
                }
                placeholder="https://yourbusiness.com/logo.png"
                data-testid="input-logo-url"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="brand_color" className="text-xs">
                Brand color
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="brand_color"
                  type="color"
                  value={draft.brand_color ?? "#6366f1"}
                  onChange={(e) =>
                    setDraft({ ...draft, brand_color: e.target.value })
                  }
                  className="h-9 w-16 cursor-pointer p-1"
                  data-testid="input-brand-color"
                />
                <Input
                  type="text"
                  value={draft.brand_color ?? "#6366f1"}
                  onChange={(e) =>
                    setDraft({ ...draft, brand_color: e.target.value })
                  }
                  className="flex-1 font-mono text-xs"
                  data-testid="input-brand-color-hex"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Accent auto-derived via 1-click smart colorizer:{" "}
                <span
                  className="inline-block h-3 w-3 rounded-sm align-middle"
                  style={{ backgroundColor: previewAccent }}
                />{" "}
                <span className="font-mono">{previewAccent}</span>
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="font_family" className="text-xs">
                Font family
              </Label>
              <select
                id="font_family"
                value={draft.font_family}
                onChange={(e) =>
                  setDraft({ ...draft, font_family: e.target.value })
                }
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                data-testid="select-font"
              >
                {allowedFonts.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-start justify-between gap-2 rounded-md border border-border bg-muted/30 p-3">
              <div className="flex flex-col">
                <Label htmlFor="show_badge" className="flex items-center gap-1 text-xs">
                  Show "Powered by QuoteQuick" badge
                  {!removeBadgeAllowed && (
                    <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  )}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {removeBadgeAllowed
                    ? "Business tier — you can hide the badge."
                    : "Upgrade to Business to hide the badge."}
                </p>
              </div>
              <Switch
                id="show_badge"
                checked={draft.show_powered_by_badge}
                disabled={!removeBadgeAllowed}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, show_powered_by_badge: checked })
                }
                data-testid="switch-show-badge"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="custom_css" className="flex items-center gap-1 text-xs">
                Custom CSS
                {!customCssAllowed && (
                  <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                )}
              </Label>
              <textarea
                id="custom_css"
                value={draft.custom_css ?? ""}
                disabled={!customCssAllowed}
                onChange={(e) =>
                  setDraft({ ...draft, custom_css: e.target.value || null })
                }
                placeholder={
                  customCssAllowed
                    ? ".qq-widget__cta { border-radius: 999px; }"
                    : "Business tier unlocks custom CSS."
                }
                className={cn(
                  "min-h-[120px] rounded-md border border-input bg-background px-3 py-2 font-mono text-xs",
                  !customCssAllowed && "cursor-not-allowed opacity-60",
                )}
                maxLength={4096}
                data-testid="textarea-custom-css"
              />
              <p className="text-[11px] text-muted-foreground">
                Max 4KB. Sanitized server-side.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => data?.settings && setDraft(data.settings)}
                disabled={save.isPending}
                data-testid="brand-reset"
              >
                Reset
              </Button>
              <Button
                size="sm"
                onClick={() => save.mutate(draft)}
                disabled={save.isPending}
                data-testid="brand-save"
              >
                {save.isPending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                )}
                Save
              </Button>
            </div>
          </Card>

          {/* Live preview pane */}
          <Card className="flex flex-col gap-2 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Live preview
            </h3>
            <div
              className="rounded-md border p-3"
              style={{
                fontFamily:
                  draft.font_family === "system"
                    ? undefined
                    : draft.font_family,
                borderColor: draft.brand_color ?? undefined,
              }}
              data-testid="brand-preview"
            >
              {draft.logo_url ? (
                <img
                  src={draft.logo_url}
                  alt="Logo preview"
                  className="mb-2 h-8 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
              <p className="text-sm font-semibold text-foreground">
                Get your free quote
              </p>
              <button
                type="button"
                className="mt-2 w-full rounded-md px-3 py-2 text-sm font-semibold text-primary-foreground"
                style={{
                  backgroundColor: draft.brand_color ?? "#6366f1",
                }}
              >
                Start now
              </button>
              {draft.show_powered_by_badge && (
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  Powered by QuoteQuick
                </p>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Changes apply to every embedded widget on save.
            </p>
          </Card>
        </div>

        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/portal/quotequick/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </PortalLayout>
  );
}
