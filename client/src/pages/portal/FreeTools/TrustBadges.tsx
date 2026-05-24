import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Save,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { cn } from "@/lib/utils";
import { FieldGroupHeader, TitleInField } from "./_shared";

/**
 * Trust Badges Widget — free-tools batch 1.
 *
 * Customer toggles up to 20 trust badges from a curated library. Selected
 * badges render as inline SVG on the customer's website via the v1 loader
 * with data-tool="badges".
 *
 * DS compliance (PR #692 audit): title-in-field + top-left help cue + 2px
 * input-cluster gaps + single .btn-primary-premium (Save badges).
 */

interface Badge {
  slug: string;
  label: string;
  proofUrl?: string;
  valueText?: string;
}

interface BadgesResponse {
  badges: Badge[];
  widgetToken: string;
}

interface CatalogEntry {
  slug: string;
  label: string;
  defaultProofPrompt?: string;
}

// Keep in sync with BADGE_SVGS keys in client/public/widget/badges.js.
const CATALOG: CatalogEntry[] = [
  { slug: "licensed-insured", label: "Licensed & Insured", defaultProofPrompt: "Link to license/insurance page" },
  { slug: "bbb-member", label: "BBB Member", defaultProofPrompt: "Link to your BBB profile" },
  { slug: "google-rating", label: "★ Google Rating", defaultProofPrompt: "Link to your Google reviews" },
  { slug: "veteran-owned", label: "Veteran Owned" },
  { slug: "family-owned", label: "Family Owned" },
  { slug: "local-business", label: "Local Business" },
  { slug: "eco-friendly", label: "Eco-Friendly" },
  { slug: "247-service", label: "24/7 Service" },
  { slug: "free-estimates", label: "Free Estimates" },
  { slug: "satisfaction-guaranteed", label: "Satisfaction Guaranteed" },
  { slug: "background-checked", label: "Background-Checked" },
  { slug: "warranty-included", label: "Warranty Included" },
  { slug: "emergency-service", label: "Emergency Service" },
  { slug: "fully-bonded", label: "Fully Bonded" },
  { slug: "trusted-since", label: "Trusted Since…", defaultProofPrompt: "Year (e.g. 2009)" },
];

export default function TrustBadges() {
  usePageTitle("Trust Badges Widget");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data } = useQuery<BadgesResponse>({
    queryKey: ["/api/portal/free-tools/badges"],
    queryFn: async () => {
      const r = await fetch("/api/portal/free-tools/badges", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load badges");
      return r.json();
    },
  });

  const widgetToken = data?.widgetToken ?? "";

  const [selected, setSelected] = useState<Record<string, Badge>>({});
  const [howOpen, setHowOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    if (!data) return;
    const map: Record<string, Badge> = {};
    for (const b of data.badges) map[b.slug] = b;
    setSelected(map);
  }, [data]);

  // Copilot form helper — let the assistant set a Google-rating valueText.
  useCopilotForm({
    formLabel: "Trust Badges",
    fields: [
      { key: "googleRatingValue", label: "Google rating value (e.g. 4.9 ★)", required: false },
    ],
    values: { googleRatingValue: selected["google-rating"]?.valueText ?? "" },
    onApply: (fills) => {
      for (const f of fills) {
        if (f.field_key === "googleRatingValue") {
          const v = String(f.value ?? "");
          const existing = selected["google-rating"];
          setSelected({
            ...selected,
            "google-rating": existing
              ? { ...existing, valueText: v }
              : { slug: "google-rating", label: "★ Google Rating", valueText: v },
          });
        }
      }
    },
    enabled: true,
  });

  const selectedList = useMemo(
    () => CATALOG.filter((c) => selected[c.slug]).map((c) => selected[c.slug]),
    [selected]
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/portal/free-tools/badges", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ badges: selectedList }),
      });
      if (!r.ok) throw new Error("Save failed");
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Badges updated." });
      qc.invalidateQueries({ queryKey: ["/api/portal/free-tools/badges"] });
      setPreviewKey((k) => k + 1);
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  const toggle = (entry: CatalogEntry) => {
    if (selected[entry.slug]) {
      const next = { ...selected };
      delete next[entry.slug];
      setSelected(next);
    } else {
      setSelected({ ...selected, [entry.slug]: { slug: entry.slug, label: entry.label } });
    }
  };

  const updateField = (slug: string, patch: Partial<Badge>) => {
    const b = selected[slug];
    if (!b) return;
    setSelected({ ...selected, [slug]: { ...b, ...patch } });
  };

  const snippet = widgetToken
    ? `<script src="https://wefixtrades.com/widget/v1.js" data-site-key="${widgetToken}" data-tool="badges" async></script>`
    : "Loading…";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast({ title: "Copied", description: "Embed snippet copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Select the snippet and copy manually.", variant: "destructive" });
    }
  };

  return (
    <PortalLayout
      breadcrumb={
        <span className="flex items-center gap-1.5">
          <Link href="/portal/free-tools" className="hover:text-brand-blue">Free Tools</Link>
          <span className="text-gray-400">/</span>
          <span>Trust Badges</span>
        </span>
      }
    >
      <div data-theme="light" className="space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-gray-900">Trust Badges</h1>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            Pick the credibility marks that apply to your business. Selected
            badges render as clean inline SVG — no external image loads, no
            tracking pixels, no slowdowns.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Picker */}
          <div className="lg:col-span-2 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Choose your badges"
                  help="Click a badge to toggle it on or off. Selected tiles use the brand outline — the same style as every other 'on' picker in the portal."
                  right={<span className="text-xs text-gray-500">{selectedList.length} selected</span>}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {CATALOG.map((entry) => {
                    const isOn = !!selected[entry.slug];
                    return (
                      <button
                        key={entry.slug}
                        type="button"
                        onClick={() => toggle(entry)}
                        className={cn(
                          "flex items-center gap-2 p-3 text-left rounded-lg border bg-white transition-colors",
                          /* DS rule — selected = outline, not bright fill. */
                          isOn ? "border-brand-blue ring-2 ring-brand-blue/20" : "border-gray-200 hover:border-gray-300",
                        )}
                        data-testid={`badge-toggle-${entry.slug}`}
                        aria-pressed={isOn}
                      >
                        <BadgePreview slug={entry.slug} />
                        <span className="text-xs font-medium text-gray-700 flex-1">{entry.label}</span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {selectedList.length > 0 && (
              <Card>
                <CardContent className="p-5 space-y-3">
                  <FieldGroupHeader
                    title="Selected badge details"
                    help="Optional — add a proof URL or value text. Useful for Google-rating ('4.9 ★ 230 reviews') or to link a BBB badge to your profile."
                  />
                  <ul className="space-y-2">
                    {selectedList.map((b) => (
                      <li key={b.slug} className="border border-gray-200 rounded-lg p-3 bg-white space-y-0.5">
                        <div className="flex items-center gap-2 mb-1">
                          <BadgePreview slug={b.slug} />
                          <span className="text-sm font-medium text-gray-800">{b.label}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
                          <TitleInField
                            id={`badge-proof-${b.slug}`}
                            label="Proof URL (optional)"
                            value={b.proofUrl ?? ""}
                            onChange={(v) => updateField(b.slug, { proofUrl: v })}
                            placeholder="https://…"
                            help="Link the badge clicks through to — e.g. your BBB profile or licence page."
                          />
                          <TitleInField
                            id={`badge-value-${b.slug}`}
                            label="Value text (optional)"
                            value={b.valueText ?? ""}
                            onChange={(v) => updateField(b.slug, { valueText: v })}
                            placeholder={b.slug === "google-rating" ? "4.9 ★" : ""}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end">
              {/* DS rule 4 — single .btn-primary-premium per page: Save. */}
              <Button
                type="button"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                className="btn-primary-premium"
                data-testid="badges-save-button"
              >
                <Save className="w-4 h-4 mr-1.5" />
                {saveMut.isPending ? "Saving…" : "Save badges"}
              </Button>
            </div>
          </div>

          {/* Snippet + preview */}
          <div className="lg:col-span-1 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Live preview"
                  help="Real render of how the badge row looks on your site. Updates on save."
                />
                {widgetToken && (
                  <iframe
                    key={previewKey}
                    title="Trust badges preview"
                    src={`/widget/preview/badges?token=${encodeURIComponent(widgetToken)}`}
                    className="w-full h-[260px] border border-gray-200 rounded-lg bg-slate-50"
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Embed snippet"
                  help="Paste this once anywhere in your site to drop in the selected badges."
                  right={
                    <Button
                      type="button"
                      onClick={handleCopy}
                      variant="outline"
                      size="sm"
                      disabled={!widgetToken}
                      data-testid="badges-copy-snippet"
                    >
                      {copied ? <><Check className="w-4 h-4 mr-1.5" />Copied</> : <><Copy className="w-4 h-4 mr-1.5" />Copy</>}
                    </Button>
                  }
                />
                <pre className="text-xs bg-slate-50 text-gray-800 p-3 rounded-md overflow-x-auto border border-gray-200">
                  <code>{snippet}</code>
                </pre>
                <p className="text-xs text-gray-500">
                  Free tier shows a "Powered by WeFixTrades" link. Auto-removed when you upgrade to any paid product.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <button
                  type="button"
                  onClick={() => setHowOpen((v) => !v)}
                  className="flex items-center justify-between w-full text-left"
                  aria-expanded={howOpen}
                >
                  <h2 className="text-sm font-semibold text-gray-900">How to install</h2>
                  {howOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {howOpen && (
                  <ul className="mt-3 space-y-2 text-xs text-gray-700">
                    <li><strong>WordPress:</strong> drop the snippet into the homepage hero or footer via a header/footer plugin.</li>
                    <li><strong>Wix:</strong> Add → Embed Code → paste.</li>
                    <li><strong>Squarespace:</strong> Add Block → Code → paste.</li>
                    <li><strong>Shopify:</strong> place in a section template or <code>theme.liquid</code>.</li>
                    <li><strong>Plain HTML:</strong> paste anywhere in <code>&lt;body&gt;</code>.</li>
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}

/* Inline preview swatch — mirrors a couple of the SVGs in the embed library. */
function BadgePreview({ slug: _slug }: { slug: string }) {
  return (
    <span className="inline-flex w-8 h-8 items-center justify-center rounded-md bg-brand-blue/10 text-brand-blue shrink-0">
      <ShieldCheck className="w-4 h-4" aria-hidden="true" />
    </span>
  );
}
