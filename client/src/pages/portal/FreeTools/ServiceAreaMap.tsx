import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPin,
  Copy,
  Check,
  Save,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { usePageTitle } from "@/hooks/usePageTitle";

/**
 * Service-Area Map widget — free-tools batch 3.
 *
 * Customer configures their address + service radius + style, the server
 * geocodes once, calls Google Static Maps API once per unique config, caches
 * the resulting PNG, and serves it from /free-tool/service-area/:token.png.
 *
 * The embed is a single <img> tag — fast, JS-free, immutable cache.
 */

interface ServiceAreaConfig {
  client_id: number;
  enabled: boolean;
  address_line: string;
  address_city: string | null;
  address_region: string | null;
  address_postal: string | null;
  address_country: string | null;
  center_lat: string | null;
  center_lng: string | null;
  radius_value: number;
  radius_unit: "miles" | "km";
  map_style: "roadmap" | "satellite" | "terrain" | "hybrid";
  pin_color: string;
  circle_color: string;
  circle_opacity: string;
  cache_key: string | null;
  cache_path: string | null;
  cached_at: string | null;
  updated_at: string;
}

interface ConfigResponse {
  config: ServiceAreaConfig | null;
  widgetToken: string;
  apiKeyConfigured: boolean;
}

const labelClass = "block text-xs font-medium text-gray-600 mb-1";
const inputClass =
  "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors";

const DEFAULT_PIN = "#0d3cfc";
const DEFAULT_CIRCLE = "#0d3cfc";

export default function ServiceAreaMap() {
  usePageTitle("Service Area Map");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<ConfigResponse>({
    queryKey: ["/api/portal/free-tools/service-area"],
    queryFn: async () => {
      const r = await fetch("/api/portal/free-tools/service-area", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });

  const [enabled, setEnabled] = useState(false);
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("US");
  const [radius, setRadius] = useState(25);
  const [unit, setUnit] = useState<"miles" | "km">("miles");
  const [mapStyle, setMapStyle] = useState<"roadmap" | "satellite" | "terrain" | "hybrid">("roadmap");
  const [pinColor, setPinColor] = useState(DEFAULT_PIN);
  const [circleColor, setCircleColor] = useState(DEFAULT_CIRCLE);
  const [circleOpacity, setCircleOpacity] = useState(0.2);
  const [previewKey, setPreviewKey] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const c = data?.config;
    if (!c) return;
    setEnabled(c.enabled);
    setAddressLine(c.address_line);
    setCity(c.address_city ?? "");
    setRegion(c.address_region ?? "");
    setPostal(c.address_postal ?? "");
    setCountry(c.address_country ?? "US");
    setRadius(c.radius_value);
    setUnit(c.radius_unit);
    setMapStyle(c.map_style);
    setPinColor(c.pin_color || DEFAULT_PIN);
    setCircleColor(c.circle_color || DEFAULT_CIRCLE);
    setCircleOpacity(Number(c.circle_opacity) || 0.2);
  }, [data]);

  useCopilotForm({
    formLabel: "Service-Area Map",
    fields: [
      { key: "address_line", label: "Business street address (e.g. 120 Main St)", required: true },
      { key: "address_city", label: "City" },
      { key: "address_region", label: "State / region" },
      { key: "address_postal", label: "ZIP / postal code" },
      { key: "radius_value", label: "Service radius (number)", required: true },
      { key: "radius_unit", label: "Radius unit — 'miles' or 'km'" },
    ],
    values: {
      address_line: addressLine,
      address_city: city,
      address_region: region,
      address_postal: postal,
      radius_value: String(radius),
      radius_unit: unit,
    },
    onApply: (fills) => {
      for (const f of fills) {
        const v = String(f.value ?? "");
        if (f.field_key === "address_line") setAddressLine(v);
        if (f.field_key === "address_city") setCity(v);
        if (f.field_key === "address_region") setRegion(v);
        if (f.field_key === "address_postal") setPostal(v);
        if (f.field_key === "radius_value") {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) setRadius(n);
        }
        if (f.field_key === "radius_unit" && (v === "miles" || v === "km")) setUnit(v);
      }
    },
    enabled: true,
  });

  const widgetToken = data?.widgetToken ?? "";
  const apiKeyConfigured = data?.apiKeyConfigured ?? false;

  const publicUrl = useMemo(
    () => (widgetToken ? `https://wefixtrades.com/free-tool/service-area/${widgetToken}.png` : ""),
    [widgetToken],
  );
  const previewUrl = useMemo(
    () => (widgetToken ? `/free-tool/service-area/${widgetToken}.png?t=${previewKey}` : ""),
    [widgetToken, previewKey],
  );
  const snippet = widgetToken
    ? `<img src="${publicUrl}" alt="Service area" width="600" height="400" loading="lazy">`
    : "Loading…";

  const saveMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/portal/free-tools/service-area", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          address_line: addressLine.trim(),
          address_city: city.trim() || null,
          address_region: region.trim() || null,
          address_postal: postal.trim() || null,
          address_country: (country.trim() || "US").slice(0, 2).toUpperCase(),
          radius_value: radius,
          radius_unit: unit,
          map_style: mapStyle,
          pin_color: pinColor,
          circle_color: circleColor,
          circle_opacity: circleOpacity,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error || "Save failed");
      }
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Map regenerated. Preview updating." });
      qc.invalidateQueries({ queryKey: ["/api/portal/free-tools/service-area"] });
      setPreviewKey((k) => k + 1);
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  const regenMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/portal/free-tools/service-area/regenerate", {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error || "Regenerate failed");
      }
    },
    onSuccess: () => {
      toast({ title: "Regenerated", description: "Map cache refreshed." });
      setPreviewKey((k) => k + 1);
    },
    onError: (e: Error) => toast({ title: "Couldn't regenerate", description: e.message, variant: "destructive" }),
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast({ title: "Copied", description: "Embed snippet copied." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Select the snippet and copy manually.", variant: "destructive" });
    }
  };

  const canSave = addressLine.trim().length > 0 && radius > 0;
  const hasGeocode = Boolean(data?.config?.center_lat && data?.config?.center_lng);

  return (
    <PortalLayout
      breadcrumb={
        <span className="flex items-center gap-1.5">
          <Link href="/portal/free-tools" className="hover:text-brand-blue">Free Tools</Link>
          <span className="text-gray-400">/</span>
          <span>Service Area Map</span>
        </span>
      }
    >
      <div data-theme="light" className="space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-gray-900">Service Area Map</h1>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            Show customers exactly where you serve. The map embeds as a static
            image — fast-loading, no JavaScript, mobile-friendly. We render it
            once on our servers and cache it, so your site stays snappy.
          </p>
        </header>

        {!apiKeyConfigured && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs text-amber-900">
                The Google Maps API key isn't configured on the server yet.
                You can save settings, but the preview won't render until an
                admin sets GOOGLE_MAPS_API_KEY in Doppler.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Editor */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <h2 className="text-sm font-semibold text-gray-900">Map settings</h2>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/20"
                  />
                  <span className="text-sm text-gray-700">Map is enabled (visible on your site)</span>
                </label>

                <div>
                  <label className={labelClass} htmlFor="sa-address">Business street address</label>
                  <input
                    id="sa-address"
                    className={inputClass}
                    value={addressLine}
                    onChange={(e) => setAddressLine(e.target.value)}
                    placeholder="120 Main St"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass} htmlFor="sa-city">City</label>
                    <input
                      id="sa-city"
                      className={inputClass}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="sa-region">State / region</label>
                    <input
                      id="sa-region"
                      className={inputClass}
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="sa-postal">ZIP / postal</label>
                    <input
                      id="sa-postal"
                      className={inputClass}
                      value={postal}
                      onChange={(e) => setPostal(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass} htmlFor="sa-country">Country code</label>
                    <input
                      id="sa-country"
                      className={inputClass}
                      value={country}
                      onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                      maxLength={2}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="sa-radius">Service radius</label>
                    <input
                      id="sa-radius"
                      type="number"
                      min={1}
                      max={500}
                      className={inputClass}
                      value={radius}
                      onChange={(e) => setRadius(Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 1)))}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="sa-unit">Unit</label>
                    <select
                      id="sa-unit"
                      className={inputClass}
                      value={unit}
                      onChange={(e) => setUnit(e.target.value as "miles" | "km")}
                    >
                      <option value="miles">miles</option>
                      <option value="km">km</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelClass} htmlFor="sa-style">Map style</label>
                  <select
                    id="sa-style"
                    className={inputClass}
                    value={mapStyle}
                    onChange={(e) => setMapStyle(e.target.value as "roadmap" | "satellite" | "terrain" | "hybrid")}
                  >
                    <option value="roadmap">Roadmap (standard streets)</option>
                    <option value="satellite">Satellite</option>
                    <option value="terrain">Terrain</option>
                    <option value="hybrid">Hybrid (satellite + labels)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass} htmlFor="sa-pin">Pin colour</label>
                    <div className="flex items-center gap-2">
                      <input
                        id="sa-pin"
                        type="color"
                        className="h-9 w-12 rounded border border-gray-200 cursor-pointer"
                        value={pinColor}
                        onChange={(e) => setPinColor(e.target.value)}
                      />
                      <input
                        type="text"
                        className={inputClass}
                        value={pinColor}
                        onChange={(e) => setPinColor(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="sa-circle">Circle colour</label>
                    <div className="flex items-center gap-2">
                      <input
                        id="sa-circle"
                        type="color"
                        className="h-9 w-12 rounded border border-gray-200 cursor-pointer"
                        value={circleColor}
                        onChange={(e) => setCircleColor(e.target.value)}
                      />
                      <input
                        type="text"
                        className={inputClass}
                        value={circleColor}
                        onChange={(e) => setCircleColor(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className={labelClass} htmlFor="sa-opacity">
                    Circle fill opacity: {(circleOpacity * 100).toFixed(0)}%
                  </label>
                  <input
                    id="sa-opacity"
                    type="range"
                    min={0.05}
                    max={0.5}
                    step={0.05}
                    className="w-full"
                    value={circleOpacity}
                    onChange={(e) => setCircleOpacity(parseFloat(e.target.value))}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => regenMut.mutate()}
                disabled={regenMut.isPending || !hasGeocode}
                data-testid="service-area-regenerate"
              >
                <RefreshCw className="w-4 h-4 mr-1.5" />
                {regenMut.isPending ? "Regenerating…" : "Force regenerate"}
              </Button>
              <Button
                type="button"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || !canSave}
                className="btn-primary-premium"
                data-testid="service-area-save"
              >
                <Save className="w-4 h-4 mr-1.5" />
                {saveMut.isPending ? "Saving…" : "Save & regenerate"}
              </Button>
            </div>
          </div>

          {/* Preview + snippet */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardContent className="p-5 space-y-3">
                <h2 className="text-sm font-semibold text-gray-900">Live preview</h2>
                {isLoading ? (
                  <p className="text-xs text-gray-500">Loading…</p>
                ) : widgetToken ? (
                  <img
                    key={previewKey}
                    src={previewUrl}
                    alt="Service area preview"
                    className="w-full rounded-lg border border-gray-200 bg-slate-50"
                    width={600}
                    height={400}
                    data-testid="service-area-preview"
                  />
                ) : (
                  <p className="text-xs text-gray-500">No widget token yet.</p>
                )}
                {!hasGeocode && data?.config && (
                  <p className="text-[11px] text-gray-500">
                    Save your address first to generate a real map.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">Embed snippet</h2>
                  <Button
                    type="button"
                    onClick={handleCopy}
                    className="btn-primary-premium"
                    disabled={!widgetToken}
                    data-testid="service-area-copy-snippet"
                  >
                    {copied ? <><Check className="w-4 h-4 mr-1.5" />Copied</> : <><Copy className="w-4 h-4 mr-1.5" />Copy</>}
                  </Button>
                </div>
                <pre className="text-xs bg-slate-50 text-gray-800 p-3 rounded-md overflow-x-auto border border-gray-200">
                  <code>{snippet}</code>
                </pre>
                <p className="text-xs text-gray-500">
                  Paste anywhere in your site's HTML. Static image —
                  fast-loading, no JavaScript required.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
